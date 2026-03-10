import { useState, useCallback, useRef, useMemo, useEffect } from "react";
import Papa from "papaparse";
import _ from "lodash";

/* ── Utility: string similarity (Dice coefficient) ── */
function bigrams(str) {
  const s = str.toLowerCase();
  const b = [];
  for (let i = 0; i < s.length - 1; i++) b.push(s.slice(i, i + 2));
  return b;
}
function similarity(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const ba = bigrams(a), bb = bigrams(b);
  if (!ba.length || !bb.length) return 0;
  let hits = 0;
  const used = new Set();
  for (const g of ba) {
    const idx = bb.findIndex((x, i) => x === g && !used.has(i));
    if (idx !== -1) { hits++; used.add(idx); }
  }
  return (2 * hits) / (ba.length + bb.length);
}

/* ── Utility: detect delimiter ── */
function detectDelimiter(text) {
  const first5 = text.split("\n").slice(0, 5).join("\n");
  const counts = { ",": 0, ";": 0, "\t": 0, "|": 0 };
  for (const ch of first5) if (ch in counts) counts[ch]++;
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  if (sorted[0][1] === 0) return ",";
  return sorted[0][0];
}

/* ── Utility: detect encoding heuristic ── */
function detectEncoding(buffer) {
  const bytes = new Uint8Array(buffer);
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return "UTF-8 (BOM)";
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return "UTF-16 LE";
  const check = Math.min(bytes.length, 4096);
  for (let i = 0; i < check; i++) {
    if (bytes[i] >= 0x80 && bytes[i] <= 0x9f) return "Windows-1252";
  }
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(bytes.slice(0, check));
    return "UTF-8";
  } catch {
    return "Windows-1252";
  }
}

function decodeBuffer(buffer, encoding) {
  if (encoding.startsWith("Windows") || encoding === "Latin-1") {
    return new TextDecoder("windows-1252").decode(buffer);
  }
  if (encoding === "UTF-16 LE") return new TextDecoder("utf-16le").decode(buffer);
  return new TextDecoder("utf-8").decode(buffer);
}

function formatSize(bytes) {
  if (bytes < 1024) return bytes + " o";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " ko";
  return (bytes / (1024 * 1024)).toFixed(1) + " Mo";
}

function delimiterLabel(d) {
  if (d === ",") return "virgule ,";
  if (d === ";") return "point-virgule ;";
  if (d === "\t") return "TAB";
  if (d === "|") return "pipe |";
  return d;
}

/* ── Icons ── */
const IconUpload = () => (
  <svg width="32" height="32" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
  </svg>
);
const IconX = () => (
  <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
  </svg>
);
const IconCheck = () => (
  <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
  </svg>
);
const IconArrowLeft = () => (
  <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
    <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
  </svg>
);
const IconDownload = () => (
  <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12M12 16.5V3" />
  </svg>
);

/* ═══════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════ */
const STEPS = ["import", "config", "preview", "export"];

export default function CSVMerger() {
  const [files, setFiles] = useState([]);
  const [step, setStep] = useState("import");
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState(null);
  const fileInputRef = useRef(null);
  const [dragOver, setDragOver] = useState(false);

  const [keyColumn, setKeyColumn] = useState(null);
  const [noKeyColumn, setNoKeyColumn] = useState(false);
  const [cleanOpts, setCleanOpts] = useState({
    trim: true, normalizeCase: true, removeEmpty: true, removeDupes: true, fuzzy: false,
  });
  const [fuzzyThreshold, setFuzzyThreshold] = useState(85);
  const [keepAllCols, setKeepAllCols] = useState(true);
  const [conflictMode, setConflictMode] = useState("first");
  const [delimiterOut, setDelimiterOut] = useState(",");

  const [result, setResult] = useState(null);
  const [stats, setStats] = useState(null);

  /* ── Computed columns ── */
  const allColumns = useMemo(() => {
    if (!files.length) return [];
    const sets = files.map(f => new Set(f.columns));
    return [...sets[0]].filter(c => sets.every(s => s.has(c)));
  }, [files]);

  const allColumnsList = useMemo(() => {
    if (!files.length) return [];
    const seen = new Set();
    const all = [];
    files.forEach(f => f.columns.forEach(c => { if (!seen.has(c)) { seen.add(c); all.push(c); } }));
    return all;
  }, [files]);

  const columnsAreSame = useMemo(() => {
    if (files.length < 2) return true;
    const ref = JSON.stringify(files[0].columns);
    return files.every(f => JSON.stringify(f.columns) === ref);
  }, [files]);

  const columnUniqueness = useMemo(() => {
    const cols = files.length === 1 ? allColumnsList : allColumns;
    if (!cols.length || !files.length) return {};
    const vals = {};
    cols.forEach(c => { vals[c] = []; });
    files.forEach(f => {
      f.data.forEach(row => {
        cols.forEach(c => {
          if (row[c] !== undefined && row[c] !== "") vals[c].push(String(row[c]).trim().toLowerCase());
        });
      });
    });
    const r = {};
    cols.forEach(c => {
      const total = vals[c].length;
      const unique = new Set(vals[c]).size;
      r[c] = total ? Math.round((unique / total) * 100) : 0;
    });
    return r;
  }, [allColumns, allColumnsList, files]);

  useEffect(() => {
    const cols = files.length === 1 ? allColumnsList : allColumns;
    if (cols.length && !noKeyColumn) {
      const best = cols.reduce((a, b) => (columnUniqueness[a] || 0) >= (columnUniqueness[b] || 0) ? a : b, cols[0]);
      setKeyColumn(best);
    }
  }, [allColumns, allColumnsList, columnUniqueness, noKeyColumn, files.length]);

  /* ── File handling ── */
  const handleFiles = useCallback(async (fileList) => {
    setError(null);
    const newFiles = [];
    for (const file of fileList) {
      if (!file.name.toLowerCase().endsWith(".csv")) {
        setError(`"${file.name}" ignoré — seuls les .csv sont acceptés.`);
        continue;
      }
      if (files.some(f => f.name === file.name) || newFiles.some(f => f.name === file.name)) {
        setError(`"${file.name}" est déjà dans la liste.`);
        continue;
      }
      if (file.size === 0) { setError(`"${file.name}" est vide.`); continue; }
      try {
        const buffer = await file.arrayBuffer();
        const encoding = detectEncoding(buffer);
        const text = decodeBuffer(buffer, encoding);
        const delimiter = detectDelimiter(text);
        const parsed = Papa.parse(text, { header: true, delimiter, skipEmptyLines: true, dynamicTyping: false });
        if (!parsed.data.length) { setError(`"${file.name}" — format non reconnu.`); continue; }
        newFiles.push({
          id: Date.now() + Math.random(),
          name: file.name, size: file.size, encoding,
          encodingCorrected: !encoding.startsWith("UTF-8"),
          delimiter, rows: parsed.data.length,
          columns: parsed.meta.fields || [],
          data: parsed.data,
        });
      } catch { setError(`"${file.name}" — erreur de lecture.`); }
    }
    if (newFiles.length) {
      setFiles(prev => [...prev, ...newFiles]);
      setResult(null); setStats(null);
    }
  }, [files]);

  const removeFile = (id) => { setFiles(prev => prev.filter(f => f.id !== id)); setResult(null); setStats(null); };

  /* ── Drag & drop ── */
  const onDragOver = (e) => { e.preventDefault(); setDragOver(true); };
  const onDragLeave = () => setDragOver(false);
  const onDrop = (e) => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files); };

  /* ── Process ── */
  const processMerge = useCallback(async () => {
    setProcessing(true); setProgress(0);
    await new Promise(r => setTimeout(r, 50));
    try {
      const st = { totalInputRows: 0, encodingsCorrected: 0, trimmed: 0, emptyRemoved: 0, dupesRemoved: 0, fuzzyDupes: 0 };
      files.forEach(f => { st.totalInputRows += f.rows; if (f.encodingCorrected) st.encodingsCorrected++; });

      const finalColumns = keepAllCols ? allColumnsList : allColumns;
      let combined = [];
      files.forEach(f => {
        f.data.forEach(row => {
          const newRow = {};
          finalColumns.forEach(col => { newRow[col] = row[col] !== undefined ? String(row[col]) : ""; });
          combined.push(newRow);
        });
      });
      setProgress(20); await new Promise(r => setTimeout(r, 20));

      if (cleanOpts.trim) {
        combined.forEach(row => {
          finalColumns.forEach(col => {
            if (row[col] && typeof row[col] === "string") {
              const t = row[col].trim();
              if (t !== row[col]) st.trimmed++;
              row[col] = t;
            }
          });
        });
      }
      setProgress(40); await new Promise(r => setTimeout(r, 20));

      if (cleanOpts.removeEmpty) {
        const before = combined.length;
        combined = combined.filter(row => finalColumns.some(col => row[col] && row[col].trim() !== ""));
        st.emptyRemoved = before - combined.length;
      }
      setProgress(55); await new Promise(r => setTimeout(r, 20));

      if (cleanOpts.removeDupes) {
        const key = noKeyColumn ? null : keyColumn;
        const seen = new Map();
        const deduped = [];
        combined.forEach(row => {
          let k;
          if (key) {
            k = cleanOpts.normalizeCase ? String(row[key]).toLowerCase().trim() : String(row[key]).trim();
          } else {
            const vals = finalColumns.map(c => cleanOpts.normalizeCase ? String(row[c]).toLowerCase().trim() : String(row[c]).trim());
            k = vals.join("||");
          }
          if (seen.has(k)) {
            if (conflictMode === "both") deduped.push(row);
            else if (conflictMode === "last") { const idx = seen.get(k); deduped[idx] = row; }
            st.dupesRemoved++;
          } else { seen.set(k, deduped.length); deduped.push(row); }
        });
        combined = deduped;
      }
      setProgress(75); await new Promise(r => setTimeout(r, 20));

      if (cleanOpts.fuzzy) {
        const threshold = fuzzyThreshold / 100;
        const key = noKeyColumn ? null : keyColumn;
        const toRemove = new Set();
        const limit = Math.min(combined.length, 5000);
        for (let i = 0; i < limit; i++) {
          if (toRemove.has(i)) continue;
          for (let j = i + 1; j < combined.length; j++) {
            if (toRemove.has(j)) continue;
            let valA, valB;
            if (key) {
              valA = String(combined[i][key]).toLowerCase().trim();
              valB = String(combined[j][key]).toLowerCase().trim();
            } else {
              valA = finalColumns.map(c => String(combined[i][c])).join(" ");
              valB = finalColumns.map(c => String(combined[j][c])).join(" ");
            }
            if (similarity(valA, valB) >= threshold && valA !== valB) { toRemove.add(j); st.fuzzyDupes++; }
          }
        }
        combined = combined.filter((_, i) => !toRemove.has(i));
      }
      setProgress(95); await new Promise(r => setTimeout(r, 20));

      setResult({ data: combined, columns: finalColumns });
      setStats({ ...st, filesCount: files.length, finalRows: combined.length });
      setStep("preview");
    } catch (e) { setError("Erreur : " + e.message); }
    finally { setProcessing(false); setProgress(100); }
  }, [files, keyColumn, noKeyColumn, cleanOpts, fuzzyThreshold, keepAllCols, conflictMode, allColumns, allColumnsList]);

  /* ── Download ── */
  const downloadCSV = () => {
    if (!result) return;
    const csv = Papa.unparse(result.data, { delimiter: delimiterOut, quotes: true });
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
    a.download = `merged_${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    URL.revokeObjectURL(a.href);
    setStep("export");
  };

  const downloadReport = () => {
    if (!stats) return;
    const d = new Date().toISOString().slice(0, 10);
    const t = [
      `CSV Merge & Clean — Rapport du ${d}`, "─".repeat(45), "",
      `Fichiers importés : ${stats.filesCount}`,
      `Lignes en entrée : ${stats.totalInputRows}`,
      `Encodages corrigés : ${stats.encodingsCorrected}`,
      `Espaces supprimés : ${stats.trimmed}`,
      `Lignes vides retirées : ${stats.emptyRemoved}`,
      `Doublons exacts supprimés : ${stats.dupesRemoved}`,
      `Quasi-doublons détectés : ${stats.fuzzyDupes}`,
      "", `Résultat final : ${stats.finalRows} lignes`,
      `Colonne clé : ${noKeyColumn ? "Ligne entière" : keyColumn}`,
      `Délimiteur export : ${delimiterLabel(delimiterOut)}`,
    ];
    const blob = new Blob([t.join("\n")], { type: "text/plain;charset=utf-8" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
    a.download = `rapport_${d}.txt`; a.click();
  };

  const reset = () => {
    setFiles([]); setStep("import"); setResult(null); setStats(null);
    setError(null); setKeyColumn(null); setNoKeyColumn(false);
    setCleanOpts({ trim: true, normalizeCase: true, removeEmpty: true, removeDupes: true, fuzzy: false });
    setFuzzyThreshold(85); setKeepAllCols(true); setConflictMode("first");
  };

  const fuzzyLabel = fuzzyThreshold < 80
    ? "Agressif — peut fusionner des entrées différentes"
    : fuzzyThreshold < 90
      ? "Recommandé — attrape les fautes de frappe et espaces"
      : "Conservateur — seulement les quasi-identiques";

  const stepIdx = STEPS.indexOf(step);
  const selectableCols = files.length === 1 ? allColumnsList : allColumns;

  /* ═══════════════════════════════════════════
     RENDER
     ═══════════════════════════════════════════ */
  return (
    <div style={{
      fontFamily: "'DM Sans', 'Söhne', -apple-system, sans-serif",
      maxWidth: 860, margin: "0 auto", padding: "0 16px", color: "#1a1a2e",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;1,9..40,400&family=DM+Mono:wght@400;500&display=swap');

        .cm-step-dot{width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:600;transition:all .3s}
        .cm-step-dot.active{background:#1a1a2e;color:#fff}
        .cm-step-dot.done{background:#22c55e;color:#fff}
        .cm-step-dot.pending{background:#e5e5e5;color:#999}

        .cm-drop{border:2px dashed #d1d5db;border-radius:12px;padding:48px 24px;text-align:center;cursor:pointer;transition:all .25s;background:#fafafa}
        .cm-drop:hover,.cm-drop.over{border-color:#1a1a2e;background:#f0f0f8}

        .cm-card{background:#fff;border:1px solid #e5e7eb;border-radius:10px;padding:14px 16px;margin-top:8px;display:flex;justify-content:space-between;align-items:flex-start;transition:all .2s}
        .cm-card:hover{border-color:#c5c5d0;box-shadow:0 1px 4px rgba(0,0,0,.04)}

        .cm-badge{display:inline-flex;align-items:center;gap:4px;font-size:11px;font-weight:500;padding:2px 8px;border-radius:20px}
        .cm-badge-ok{background:#dcfce7;color:#166534}
        .cm-badge-warn{background:#fef3c7;color:#92400e}

        .cm-btn{display:inline-flex;align-items:center;gap:8px;padding:10px 20px;border-radius:8px;border:none;font-family:'DM Sans',sans-serif;font-size:14px;font-weight:500;cursor:pointer;transition:all .2s}
        .cm-btn-p{background:#1a1a2e;color:#fff}
        .cm-btn-p:hover{background:#2a2a4e}
        .cm-btn-p:disabled{background:#ccc;cursor:not-allowed}
        .cm-btn-s{background:#fff;color:#1a1a2e;border:1px solid #d1d5db}
        .cm-btn-s:hover{background:#f5f5f5}
        .cm-btn-g{background:transparent;color:#666;padding:8px 12px}
        .cm-btn-g:hover{color:#1a1a2e}

        .cm-chk{display:flex;align-items:center;gap:10px;padding:8px 0;cursor:pointer;font-size:14px}
        .cm-chk input[type="checkbox"]{width:16px;height:16px;accent-color:#1a1a2e;cursor:pointer}

        .cm-radio{display:flex;align-items:center;gap:10px;padding:6px 0;cursor:pointer;font-size:14px}
        .cm-radio input[type="radio"]{width:15px;height:15px;accent-color:#1a1a2e;cursor:pointer}

        .cm-sel{font-family:'DM Sans',sans-serif;font-size:14px;padding:8px 32px 8px 12px;border:1px solid #d1d5db;border-radius:8px;background:#fff;cursor:pointer;appearance:none;-webkit-appearance:none;background-image:url("data:image/svg+xml,%3Csvg width='12' height='12' viewBox='0 0 24 24' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M6 9l6 6 6-6' stroke='%23666' stroke-width='2' stroke-linecap='round'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 10px center}

        .cm-slider{width:100%;accent-color:#1a1a2e;cursor:pointer}

        .cm-tbl{width:100%;border-collapse:collapse;font-size:13px}
        .cm-tbl th{background:#f5f5f7;font-weight:600;text-align:left;padding:8px 12px;border-bottom:2px solid #e5e7eb;font-family:'DM Mono',monospace;font-size:12px;white-space:nowrap}
        .cm-tbl td{padding:7px 12px;border-bottom:1px solid #f0f0f0;font-family:'DM Mono',monospace;font-size:12px;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
        .cm-tbl tr:hover td{background:#fafafa}

        .cm-stat{display:flex;align-items:center;gap:12px;padding:12px 16px;border-radius:10px;background:#f8f8fc;font-size:14px}
        .cm-stat-i{font-size:18px;flex-shrink:0;width:32px;text-align:center}

        .cm-pbar{width:100%;height:4px;background:#e5e5e5;border-radius:4px;overflow:hidden}
        .cm-pfill{height:100%;background:#1a1a2e;border-radius:4px;transition:width .3s}

        .cm-title{font-size:15px;font-weight:600;margin-bottom:12px;color:#1a1a2e}
        .cm-sub{font-size:13px;color:#666;margin-bottom:16px}
        .cm-mono{font-family:'DM Mono',monospace}
        .cm-err{background:#fef2f2;border:1px solid #fecaca;color:#dc2626;padding:10px 14px;border-radius:8px;font-size:13px;margin-top:12px}
        .cm-fade{animation:cmFade .3s ease}
        @keyframes cmFade{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
      `}</style>

      {/* ── Stepper ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 0, marginBottom: 32, justifyContent: "center" }}>
        {STEPS.map((s, i) => (
          <div key={s} style={{ display: "flex", alignItems: "center" }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
              <div className={`cm-step-dot ${i < stepIdx ? "done" : i === stepIdx ? "active" : "pending"}`}>
                {i < stepIdx ? <IconCheck /> : i + 1}
              </div>
              <span style={{ fontSize: 11, fontWeight: 500, color: i <= stepIdx ? "#1a1a2e" : "#aaa" }}>
                {["Import", "Config", "Aperçu", "Export"][i]}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div style={{ width: 48, height: 2, background: i < stepIdx ? "#22c55e" : "#e5e5e5", margin: "0 8px", marginBottom: 18, borderRadius: 1 }} />
            )}
          </div>
        ))}
      </div>

      {/* ── IMPORT ── */}
      {(step === "import" || step === "config") && (
        <div className="cm-fade">
          <div
            className={`cm-drop ${dragOver ? "over" : ""}`}
            onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <input ref={fileInputRef} type="file" accept=".csv" multiple style={{ display: "none" }}
              onChange={(e) => { handleFiles(e.target.files); e.target.value = ""; }} />
            <div style={{ color: "#888", marginBottom: 12, display: "flex", justifyContent: "center" }}><IconUpload /></div>
            <div style={{ fontSize: 15, fontWeight: 500, color: "#444" }}>Glisse tes fichiers CSV ici</div>
            <div style={{ fontSize: 13, color: "#999", marginTop: 4 }}>ou clique pour sélectionner</div>
          </div>

          {error && <div className="cm-err">{error}</div>}

          {files.length > 0 && (
            <div style={{ marginTop: 16 }}>
              {files.map(f => (
                <div key={f.id} className="cm-card">
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <span className="cm-mono" style={{ fontWeight: 500, fontSize: 13 }}>{f.name}</span>
                      <span style={{ fontSize: 12, color: "#999" }}>{formatSize(f.size)}</span>
                      {f.encodingCorrected
                        ? <span className="cm-badge cm-badge-warn">⚠ {f.encoding} → UTF-8</span>
                        : <span className="cm-badge cm-badge-ok">✓ {f.encoding}</span>}
                    </div>
                    <div style={{ fontSize: 12, color: "#888", marginTop: 6, display: "flex", gap: 16, flexWrap: "wrap" }}>
                      <span>{f.rows.toLocaleString("fr-FR")} lignes</span>
                      <span>{f.columns.length} colonnes</span>
                      <span>Dél. : {delimiterLabel(f.delimiter)}</span>
                    </div>
                  </div>
                  <button onClick={(e) => { e.stopPropagation(); removeFile(f.id); }}
                    style={{ background: "none", border: "none", cursor: "pointer", color: "#ccc", padding: 4, borderRadius: 4 }}
                    onMouseEnter={(e) => e.currentTarget.style.color = "#ef4444"}
                    onMouseLeave={(e) => e.currentTarget.style.color = "#ccc"}>
                    <IconX />
                  </button>
                </div>
              ))}
            </div>
          )}

          {files.length > 0 && step === "import" && (
            <div style={{ marginTop: 20, display: "flex", justifyContent: "flex-end" }}>
              <button className="cm-btn cm-btn-p" onClick={() => setStep("config")}>Configurer la fusion →</button>
            </div>
          )}
        </div>
      )}

      {/* ── CONFIG ── */}
      {step === "config" && (
        <div className="cm-fade" style={{ marginTop: 32 }}>

          {/* Key column */}
          <div style={{ marginBottom: 28 }}>
            <div className="cm-title">Colonne clé pour la déduplication</div>
            <div className="cm-sub">Choisir la colonne qui identifie chaque ligne de manière unique.</div>
            {allColumns.length === 0 && files.length > 1 ? (
              <div className="cm-err">Aucune colonne commune. Vérifie les en-têtes ou utilise la dédup sur ligne entière.</div>
            ) : (
              <select className="cm-sel" style={{ width: "100%", maxWidth: 400 }}
                value={noKeyColumn ? "__none" : (keyColumn || "")}
                onChange={e => {
                  if (e.target.value === "__none") { setNoKeyColumn(true); setKeyColumn(null); }
                  else { setNoKeyColumn(false); setKeyColumn(e.target.value); }
                }}>
                {selectableCols.map(c => (
                  <option key={c} value={c}>{c} — {columnUniqueness[c] ?? "?"}% unique</option>
                ))}
                <option value="__none">Pas de colonne clé — dédup sur ligne entière</option>
              </select>
            )}
          </div>

          {/* Cleaning */}
          <div style={{ marginBottom: 28 }}>
            <div className="cm-title">Nettoyage automatique</div>
            {[
              ["trim", "Trim espaces", "Supprime les espaces en début/fin de cellule"],
              ["normalizeCase", "Normaliser la casse", "Minuscules pour la comparaison (pas l'export)"],
              ["removeEmpty", "Supprimer les lignes vides", "Toutes les cellules vides"],
              ["removeDupes", "Supprimer les doublons exacts", "Sur la colonne clé sélectionnée"],
              ["fuzzy", "Déduplication floue", "Quasi-doublons (fautes de frappe, espaces…)"],
            ].map(([key, label, desc]) => (
              <label key={key} className="cm-chk">
                <input type="checkbox" checked={cleanOpts[key]}
                  onChange={e => setCleanOpts(p => ({ ...p, [key]: e.target.checked }))} />
                <div>
                  <div style={{ fontWeight: 500 }}>{label}</div>
                  <div style={{ fontSize: 12, color: "#888", marginTop: 1 }}>{desc}</div>
                </div>
              </label>
            ))}

            {cleanOpts.fuzzy && (
              <div style={{ marginLeft: 26, marginTop: 8, padding: 16, background: "#f8f8fc", borderRadius: 10 }}>
                <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 8 }}>
                  Seuil de similarité : <span className="cm-mono">{fuzzyThreshold}%</span>
                </div>
                <input type="range" className="cm-slider" min={70} max={99}
                  value={fuzzyThreshold} onChange={e => setFuzzyThreshold(Number(e.target.value))} />
                <div style={{ fontSize: 12, color: "#888", marginTop: 6, fontStyle: "italic" }}>{fuzzyLabel}</div>
              </div>
            )}
          </div>

          {/* Columns */}
          {!columnsAreSame && files.length > 1 && (
            <div style={{ marginBottom: 28 }}>
              <div className="cm-title">Gestion des colonnes</div>
              <div className="cm-sub">Les fichiers n'ont pas les mêmes colonnes.</div>
              <div style={{ display: "flex", gap: 16 }}>
                <label className="cm-radio">
                  <input type="radio" checked={keepAllCols} onChange={() => setKeepAllCols(true)} />
                  Garder toutes les colonnes
                </label>
                <label className="cm-radio">
                  <input type="radio" checked={!keepAllCols} onChange={() => setKeepAllCols(false)} />
                  Communes seulement ({allColumns.length})
                </label>
              </div>
            </div>
          )}

          {/* Conflict */}
          <div style={{ marginBottom: 28 }}>
            <div className="cm-title">En cas de conflit de valeurs</div>
            <div className="cm-sub">Quand deux lignes ont la même clé mais des valeurs différentes.</div>
            {[
              ["first", "Garder le premier fichier", "Priorité au fichier en haut de liste"],
              ["last", "Garder le dernier fichier", "Priorité au dernier fichier ajouté"],
              ["both", "Garder les deux lignes", "Conserve tout, même les doublons"],
            ].map(([val, label, desc]) => (
              <label key={val} className="cm-radio">
                <input type="radio" checked={conflictMode === val} onChange={() => setConflictMode(val)} />
                <div>
                  <div style={{ fontWeight: 500 }}>{label}</div>
                  <div style={{ fontSize: 12, color: "#888" }}>{desc}</div>
                </div>
              </label>
            ))}
          </div>

          {/* Delimiter out */}
          <div style={{ marginBottom: 28 }}>
            <div className="cm-title">Délimiteur du fichier exporté</div>
            <div style={{ display: "flex", gap: 16 }}>
              <label className="cm-radio">
                <input type="radio" checked={delimiterOut === ","} onChange={() => setDelimiterOut(",")} />
                <span className="cm-mono">,</span>&nbsp;virgule
              </label>
              <label className="cm-radio">
                <input type="radio" checked={delimiterOut === ";"} onChange={() => setDelimiterOut(";")} />
                <span className="cm-mono">;</span>&nbsp;point-virgule (Excel FR)
              </label>
            </div>
          </div>

          {/* Actions */}
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 24 }}>
            <button className="cm-btn cm-btn-g" onClick={() => setStep("import")}><IconArrowLeft /> Retour</button>
            <button className="cm-btn cm-btn-p" onClick={processMerge} disabled={processing || !files.length}>
              {processing ? "Traitement…" : "Lancer la fusion →"}
            </button>
          </div>

          {processing && (
            <div style={{ marginTop: 16 }}>
              <div className="cm-pbar"><div className="cm-pfill" style={{ width: `${progress}%` }} /></div>
              <div style={{ fontSize: 12, color: "#888", marginTop: 6, textAlign: "center" }}>Traitement… {progress}%</div>
            </div>
          )}
        </div>
      )}

      {/* ── PREVIEW ── */}
      {step === "preview" && result && stats && (
        <div className="cm-fade">
          <div style={{ display: "grid", gap: 8, marginBottom: 28 }}>
            <div className="cm-stat">
              <span className="cm-stat-i">📥</span>
              <span>{stats.filesCount} fichiers — <strong>{stats.totalInputRows.toLocaleString("fr-FR")}</strong> lignes totales</span>
            </div>
            {stats.encodingsCorrected > 0 && (
              <div className="cm-stat">
                <span className="cm-stat-i">🔧</span>
                <span>Encodage corrigé sur {stats.encodingsCorrected} fichier{stats.encodingsCorrected > 1 ? "s" : ""}</span>
              </div>
            )}
            {(stats.trimmed > 0 || stats.emptyRemoved > 0) && (
              <div className="cm-stat">
                <span className="cm-stat-i">🧹</span>
                <span>{stats.trimmed.toLocaleString("fr-FR")} espaces supprimés, {stats.emptyRemoved} lignes vides retirées</span>
              </div>
            )}
            {stats.dupesRemoved > 0 && (
              <div className="cm-stat">
                <span className="cm-stat-i">🔁</span>
                <span>{stats.dupesRemoved.toLocaleString("fr-FR")} doublons exacts supprimés</span>
              </div>
            )}
            {stats.fuzzyDupes > 0 && (
              <div className="cm-stat">
                <span className="cm-stat-i">〰️</span>
                <span>{stats.fuzzyDupes} quasi-doublons (seuil {fuzzyThreshold}%)</span>
              </div>
            )}
            <div className="cm-stat" style={{ background: "#dcfce7" }}>
              <span className="cm-stat-i">✅</span>
              <span><strong>{stats.finalRows.toLocaleString("fr-FR")}</strong> lignes uniques</span>
            </div>
          </div>

          <div style={{ marginBottom: 24 }}>
            <div className="cm-title">Aperçu — 10 premières lignes</div>
            <div style={{ overflowX: "auto", border: "1px solid #e5e7eb", borderRadius: 10 }}>
              <table className="cm-tbl">
                <thead>
                  <tr>
                    <th style={{ color: "#aaa", width: 40 }}>#</th>
                    {result.columns.map(c => <th key={c}>{c}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {result.data.slice(0, 10).map((row, i) => (
                    <tr key={i}>
                      <td style={{ color: "#ccc" }}>{i + 1}</td>
                      {result.columns.map(c => <td key={c}>{row[c]}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {result.data.length > 10 && (
              <div style={{ fontSize: 12, color: "#999", marginTop: 6, textAlign: "center" }}>
                … et {(result.data.length - 10).toLocaleString("fr-FR")} lignes supplémentaires
              </div>
            )}
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
            <button className="cm-btn cm-btn-g" onClick={() => setStep("config")}><IconArrowLeft /> Modifier</button>
            <div style={{ display: "flex", gap: 10 }}>
              <button className="cm-btn cm-btn-s" onClick={downloadReport}>Rapport .txt</button>
              <button className="cm-btn cm-btn-p" onClick={downloadCSV}><IconDownload /> Télécharger le CSV</button>
            </div>
          </div>
        </div>
      )}

      {/* ── EXPORT DONE ── */}
      {step === "export" && (
        <div className="cm-fade" style={{ textAlign: "center", padding: "48px 0" }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>✓</div>
          <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>Fichier téléchargé</div>
          <div style={{ fontSize: 14, color: "#888", marginBottom: 24 }}>
            {stats?.finalRows.toLocaleString("fr-FR")} lignes · {result?.columns.length} colonnes · {delimiterLabel(delimiterOut)}
          </div>
          <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
            <button className="cm-btn cm-btn-s" onClick={() => setStep("preview")}>← Revoir l'aperçu</button>
            <button className="cm-btn cm-btn-s" onClick={downloadReport}>Rapport .txt</button>
            <button className="cm-btn cm-btn-p" onClick={reset}>Nouvelle fusion</button>
          </div>
        </div>
      )}
    </div>
  );
}
