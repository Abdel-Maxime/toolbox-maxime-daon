"use client";
import { useState, useCallback, useRef, useMemo, useEffect } from "react";
import Papa from "papaparse";
import _ from "lodash";

/* ── String similarity (Dice coefficient) ── */
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

function detectDelimiter(text) {
  const first5 = text.split("\n").slice(0, 5).join("\n");
  const counts = { ",": 0, ";": 0, "\t": 0, "|": 0 };
  for (const ch of first5) if (ch in counts) counts[ch]++;
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  return sorted[0][1] === 0 ? "," : sorted[0][0];
}

function detectEncoding(buffer) {
  const bytes = new Uint8Array(buffer);
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return "UTF-8 (BOM)";
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return "UTF-16 LE";
  const check = Math.min(bytes.length, 4096);
  for (let i = 0; i < check; i++) {
    if (bytes[i] >= 0x80 && bytes[i] <= 0x9f) return "Windows-1252";
  }
  try { new TextDecoder("utf-8", { fatal: true }).decode(bytes.slice(0, check)); return "UTF-8"; }
  catch { return "Windows-1252"; }
}

function decodeBuffer(buffer, encoding) {
  if (encoding.startsWith("Windows") || encoding === "Latin-1") return new TextDecoder("windows-1252").decode(buffer);
  if (encoding === "UTF-16 LE") return new TextDecoder("utf-16le").decode(buffer);
  return new TextDecoder("utf-8").decode(buffer);
}

function formatSize(bytes) {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

function delimLabel(d) {
  if (d === ",") return "comma ,";
  if (d === ";") return "semicolon ;";
  if (d === "\t") return "TAB";
  if (d === "|") return "pipe |";
  return d;
}

/* ── Icons ── */
const IcoUp = () => <svg width="32" height="32" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" /></svg>;
const IcoX = () => <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>;
const IcoChk = () => <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>;
const IcoLeft = () => <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" /></svg>;
const IcoDl = () => <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12M12 16.5V3" /></svg>;

/* ═══════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════ */
const STEPS = ["import", "config", "preview", "export"];
const STEP_LABELS = ["Import", "Configure", "Preview", "Export"];

export default function CSVMerger2() {
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

  const allColumns = useMemo(() => {
    if (!files.length) return [];
    const sets = files.map(f => new Set(f.columns));
    return [...sets[0]].filter(c => sets.every(s => s.has(c)));
  }, [files]);

  const allColumnsList = useMemo(() => {
    if (!files.length) return [];
    const seen = new Set(); const all = [];
    files.forEach(f => f.columns.forEach(c => { if (!seen.has(c)) { seen.add(c); all.push(c); } }));
    return all;
  }, [files]);

  const columnsAreSame = useMemo(() => {
    if (files.length < 2) return true;
    const ref = JSON.stringify(files[0].columns);
    return files.every(f => JSON.stringify(f.columns) === ref);
  }, [files]);

  const selectableCols = files.length === 1 ? allColumnsList : allColumns;

  const columnUniqueness = useMemo(() => {
    const cols = files.length === 1 ? allColumnsList : allColumns;
    if (!cols.length || !files.length) return {};
    const vals = {}; cols.forEach(c => { vals[c] = []; });
    files.forEach(f => f.data.forEach(row => {
      cols.forEach(c => { if (row[c] !== undefined && row[c] !== "") vals[c].push(String(row[c]).trim().toLowerCase()); });
    }));
    const r = {};
    cols.forEach(c => { const t = vals[c].length; r[c] = t ? Math.round((new Set(vals[c]).size / t) * 100) : 0; });
    return r;
  }, [allColumns, allColumnsList, files]);

  useEffect(() => {
    const cols = files.length === 1 ? allColumnsList : allColumns;
    if (cols.length && !noKeyColumn) {
      setKeyColumn(cols.reduce((a, b) => (columnUniqueness[a] || 0) >= (columnUniqueness[b] || 0) ? a : b, cols[0]));
    }
  }, [allColumns, allColumnsList, columnUniqueness, noKeyColumn, files.length]);

  const handleFiles = useCallback(async (fileList) => {
    setError(null);
    const added = [];
    for (const file of fileList) {
      if (!file.name.toLowerCase().endsWith(".csv")) { setError(`"${file.name}" skipped — only .csv files accepted.`); continue; }
      if (files.some(f => f.name === file.name) || added.some(f => f.name === file.name)) { setError(`"${file.name}" already in the list.`); continue; }
      if (file.size === 0) { setError(`"${file.name}" is empty.`); continue; }
      try {
        const buffer = await file.arrayBuffer();
        const encoding = detectEncoding(buffer);
        const text = decodeBuffer(buffer, encoding);
        const delimiter = detectDelimiter(text);
        const parsed = Papa.parse(text, { header: true, delimiter, skipEmptyLines: true, dynamicTyping: false });
        if (!parsed.data.length) { setError(`"${file.name}" — unrecognized format.`); continue; }
        added.push({
          id: Date.now() + Math.random(), name: file.name, size: file.size, encoding,
          encodingCorrected: !encoding.startsWith("UTF-8"), delimiter,
          rows: parsed.data.length, columns: parsed.meta.fields || [], data: parsed.data,
        });
      } catch { setError(`"${file.name}" — read error.`); }
    }
    if (added.length) { setFiles(prev => [...prev, ...added]); setResult(null); setStats(null); }
  }, [files]);

  const removeFile = (id) => { setFiles(prev => prev.filter(f => f.id !== id)); setResult(null); setStats(null); };

  const processMerge = useCallback(async () => {
    setProcessing(true); setProgress(0);
    await new Promise(r => setTimeout(r, 50));
    try {
      const st = { totalInputRows: 0, encodingsCorrected: 0, trimmed: 0, emptyRemoved: 0, dupesRemoved: 0, fuzzyDupes: 0 };
      files.forEach(f => { st.totalInputRows += f.rows; if (f.encodingCorrected) st.encodingsCorrected++; });
      const finalCols = keepAllCols ? allColumnsList : allColumns;
      let combined = [];
      files.forEach(f => f.data.forEach(row => {
        const nr = {}; finalCols.forEach(c => { nr[c] = row[c] !== undefined ? String(row[c]) : ""; }); combined.push(nr);
      }));
      setProgress(20); await new Promise(r => setTimeout(r, 20));
      if (cleanOpts.trim) {
        combined.forEach(row => finalCols.forEach(col => {
          if (row[col] && typeof row[col] === "string") { const t = row[col].trim(); if (t !== row[col]) st.trimmed++; row[col] = t; }
        }));
      }
      setProgress(40); await new Promise(r => setTimeout(r, 20));
      if (cleanOpts.removeEmpty) {
        const b = combined.length;
        combined = combined.filter(row => finalCols.some(c => row[c] && row[c].trim() !== ""));
        st.emptyRemoved = b - combined.length;
      }
      setProgress(55); await new Promise(r => setTimeout(r, 20));
      if (cleanOpts.removeDupes) {
        const key = noKeyColumn ? null : keyColumn;
        const seen = new Map(); const deduped = [];
        combined.forEach(row => {
          let k;
          if (key) k = cleanOpts.normalizeCase ? String(row[key]).toLowerCase().trim() : String(row[key]).trim();
          else k = finalCols.map(c => cleanOpts.normalizeCase ? String(row[c]).toLowerCase().trim() : String(row[c]).trim()).join("||");
          if (seen.has(k)) {
            if (conflictMode === "both") deduped.push(row);
            else if (conflictMode === "last") deduped[seen.get(k)] = row;
            st.dupesRemoved++;
          } else { seen.set(k, deduped.length); deduped.push(row); }
        });
        combined = deduped;
      }
      setProgress(75); await new Promise(r => setTimeout(r, 20));
      if (cleanOpts.fuzzy) {
        const thr = fuzzyThreshold / 100; const key = noKeyColumn ? null : keyColumn;
        const rm = new Set(); const lim = Math.min(combined.length, 5000);
        for (let i = 0; i < lim; i++) {
          if (rm.has(i)) continue;
          for (let j = i + 1; j < combined.length; j++) {
            if (rm.has(j)) continue;
            let a, b;
            if (key) { a = String(combined[i][key]).toLowerCase().trim(); b = String(combined[j][key]).toLowerCase().trim(); }
            else { a = finalCols.map(c => String(combined[i][c])).join(" "); b = finalCols.map(c => String(combined[j][c])).join(" "); }
            if (similarity(a, b) >= thr && a !== b) { rm.add(j); st.fuzzyDupes++; }
          }
        }
        combined = combined.filter((_, i) => !rm.has(i));
      }
      setProgress(95); await new Promise(r => setTimeout(r, 20));
      setResult({ data: combined, columns: finalCols });
      setStats({ ...st, filesCount: files.length, finalRows: combined.length });
      setStep("preview");
    } catch (e) { setError("Error: " + e.message); }
    finally { setProcessing(false); setProgress(100); }
  }, [files, keyColumn, noKeyColumn, cleanOpts, fuzzyThreshold, keepAllCols, conflictMode, allColumns, allColumnsList]);

  const downloadCSV = () => {
    if (!result) return;
    const csv = Papa.unparse(result.data, { delimiter: delimiterOut, quotes: true });
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
    a.download = `merged_${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    URL.revokeObjectURL(a.href); setStep("export");
  };

  const downloadReport = () => {
    if (!stats) return;
    const d = new Date().toISOString().slice(0, 10);
    const t = [
      `CSV Merge & Clean — Report ${d}`, "─".repeat(40), "",
      `Files imported: ${stats.filesCount}`, `Input rows: ${stats.totalInputRows}`,
      `Encodings fixed: ${stats.encodingsCorrected}`, `Spaces trimmed: ${stats.trimmed}`,
      `Empty rows removed: ${stats.emptyRemoved}`, `Exact duplicates removed: ${stats.dupesRemoved}`,
      `Fuzzy duplicates: ${stats.fuzzyDupes}`, "", `Final result: ${stats.finalRows} rows`,
      `Key column: ${noKeyColumn ? "Full row" : keyColumn}`, `Export delimiter: ${delimLabel(delimiterOut)}`,
    ];
    const blob = new Blob([t.join("\n")], { type: "text/plain;charset=utf-8" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
    a.download = `report_${d}.txt`; a.click();
  };

  const reset = () => {
    setFiles([]); setStep("import"); setResult(null); setStats(null); setError(null);
    setKeyColumn(null); setNoKeyColumn(false); setFuzzyThreshold(85);
    setCleanOpts({ trim: true, normalizeCase: true, removeEmpty: true, removeDupes: true, fuzzy: false });
    setKeepAllCols(true); setConflictMode("first");
  };

  const fuzzyLabel = fuzzyThreshold < 80
    ? "Aggressive — may merge different entries"
    : fuzzyThreshold < 90
      ? "Recommended — catches typos & extra spaces"
      : "Conservative — near-identical only";

  const stepIdx = STEPS.indexOf(step);

  /* ═══════════════════════════════════════════ RENDER ═══════════════════════════════════════════ */
  return (
    <div style={{ fontFamily: "'DM Sans', -apple-system, sans-serif", maxWidth: 860, margin: "0 auto", padding: "0 16px", color: "#1a1a2e" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;1,9..40,400&family=DM+Mono:wght@400;500&display=swap');
        .cm-dot{width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:600;transition:all .3s}
        .cm-dot.a{background:#1a1a2e;color:#fff}.cm-dot.d{background:#22c55e;color:#fff}.cm-dot.p{background:#e5e5e5;color:#999}
        .cm-drop{border:2px dashed #d1d5db;border-radius:12px;padding:48px 24px;text-align:center;cursor:pointer;transition:all .25s;background:#fafafa}
        .cm-drop:hover,.cm-drop.ov{border-color:#1a1a2e;background:#f0f0f8}
        .cm-card{background:#fff;border:1px solid #e5e7eb;border-radius:10px;padding:14px 16px;margin-top:8px;display:flex;justify-content:space-between;align-items:flex-start;transition:all .2s}
        .cm-card:hover{border-color:#c5c5d0;box-shadow:0 1px 4px rgba(0,0,0,.04)}
        .cm-bg{display:inline-flex;align-items:center;gap:4px;font-size:11px;font-weight:500;padding:2px 8px;border-radius:20px}
        .cm-bg-ok{background:#dcfce7;color:#166534}.cm-bg-w{background:#fef3c7;color:#92400e}
        .cm-b{display:inline-flex;align-items:center;gap:8px;padding:10px 20px;border-radius:8px;border:none;font-family:'DM Sans',sans-serif;font-size:14px;font-weight:500;cursor:pointer;transition:all .2s}
        .cm-bp{background:#1a1a2e;color:#fff}.cm-bp:hover{background:#2a2a4e}.cm-bp:disabled{background:#ccc;cursor:not-allowed}
        .cm-bs{background:#fff;color:#1a1a2e;border:1px solid #d1d5db}.cm-bs:hover{background:#f5f5f5}
        .cm-bg2{background:transparent;color:#666;padding:8px 12px}.cm-bg2:hover{color:#1a1a2e}
        .cm-chk{display:flex;align-items:center;gap:10px;padding:8px 0;cursor:pointer;font-size:14px}
        .cm-chk input[type="checkbox"]{width:16px;height:16px;accent-color:#1a1a2e;cursor:pointer}
        .cm-r{display:flex;align-items:center;gap:10px;padding:6px 0;cursor:pointer;font-size:14px}
        .cm-r input[type="radio"]{width:15px;height:15px;accent-color:#1a1a2e;cursor:pointer}
        .cm-sel{font-family:'DM Sans',sans-serif;font-size:14px;padding:8px 32px 8px 12px;border:1px solid #d1d5db;border-radius:8px;background:#fff;cursor:pointer;appearance:none;background-image:url("data:image/svg+xml,%3Csvg width='12' height='12' viewBox='0 0 24 24' fill='none'%3E%3Cpath d='M6 9l6 6 6-6' stroke='%23666' stroke-width='2' stroke-linecap='round'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 10px center}
        .cm-sl{width:100%;accent-color:#1a1a2e;cursor:pointer}
        .cm-tbl{width:100%;border-collapse:collapse;font-size:13px}
        .cm-tbl th{background:#f5f5f7;font-weight:600;text-align:left;padding:8px 12px;border-bottom:2px solid #e5e7eb;font-family:'DM Mono',monospace;font-size:12px;white-space:nowrap}
        .cm-tbl td{padding:7px 12px;border-bottom:1px solid #f0f0f0;font-family:'DM Mono',monospace;font-size:12px;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
        .cm-tbl tr:hover td{background:#fafafa}
        .cm-st{display:flex;align-items:center;gap:12px;padding:12px 16px;border-radius:10px;background:#f8f8fc;font-size:14px}
        .cm-sti{font-size:18px;flex-shrink:0;width:32px;text-align:center}
        .cm-pb{width:100%;height:4px;background:#e5e5e5;border-radius:4px;overflow:hidden}
        .cm-pf{height:100%;background:#1a1a2e;border-radius:4px;transition:width .3s}
        .cm-t{font-size:15px;font-weight:600;margin-bottom:12px;color:#1a1a2e}
        .cm-s{font-size:13px;color:#666;margin-bottom:16px}
        .cm-m{font-family:'DM Mono',monospace}
        .cm-err{background:#fef2f2;border:1px solid #fecaca;color:#dc2626;padding:10px 14px;border-radius:8px;font-size:13px;margin-top:12px}

        .cm-panel{animation:cmIn .35s ease both}
        @keyframes cmIn{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}

        .cm-foot{display:flex;justify-content:space-between;align-items:center;margin-top:28px;padding-top:20px;border-top:1px solid #f0f0f0}
      `}</style>

      {/* ── Stepper ── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 32 }}>
        {STEPS.map((s, i) => (
          <div key={s} style={{ display: "flex", alignItems: "center" }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
              <div className={`cm-dot ${i < stepIdx ? "d" : i === stepIdx ? "a" : "p"}`}>
                {i < stepIdx ? <IcoChk /> : i + 1}
              </div>
              <span style={{ fontSize: 11, fontWeight: 500, color: i <= stepIdx ? "#1a1a2e" : "#aaa" }}>
                {STEP_LABELS[i]}
              </span>
            </div>
            {i < 3 && <div style={{ width: 48, height: 2, background: i < stepIdx ? "#22c55e" : "#e5e5e5", margin: "0 8px", marginBottom: 18, borderRadius: 1 }} />}
          </div>
        ))}
      </div>

      {/* ═══ STEP 1 — IMPORT ═══ */}
      {step === "import" && (
        <div className="cm-panel" key="import">
          <div className={`cm-drop ${dragOver ? "ov" : ""}`}
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={e => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files); }}
            onClick={() => fileInputRef.current?.click()}>
            <input ref={fileInputRef} type="file" accept=".csv" multiple style={{ display: "none" }}
              onChange={e => { handleFiles(e.target.files); e.target.value = ""; }} />
            <div style={{ color: "#888", marginBottom: 12, display: "flex", justifyContent: "center" }}><IcoUp /></div>
            <div style={{ fontSize: 15, fontWeight: 500, color: "#444" }}>Drop your CSV files here</div>
            <div style={{ fontSize: 13, color: "#999", marginTop: 4 }}>or click to browse</div>
          </div>

          {error && <div className="cm-err">{error}</div>}

          {files.length > 0 && (
            <div style={{ marginTop: 16 }}>
              {files.map(f => (
                <div key={f.id} className="cm-card">
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <span className="cm-m" style={{ fontWeight: 500, fontSize: 13 }}>{f.name}</span>
                      <span style={{ fontSize: 12, color: "#999" }}>{formatSize(f.size)}</span>
                      {f.encodingCorrected
                        ? <span className="cm-bg cm-bg-w">⚠ {f.encoding} → UTF-8</span>
                        : <span className="cm-bg cm-bg-ok">✓ {f.encoding}</span>}
                    </div>
                    <div style={{ fontSize: 12, color: "#888", marginTop: 6, display: "flex", gap: 16, flexWrap: "wrap" }}>
                      <span>{f.rows.toLocaleString()} rows</span>
                      <span>{f.columns.length} columns</span>
                      <span>Delimiter: {delimLabel(f.delimiter)}</span>
                    </div>
                  </div>
                  <button onClick={e => { e.stopPropagation(); removeFile(f.id); }}
                    style={{ background: "none", border: "none", cursor: "pointer", color: "#ccc", padding: 4 }}
                    onMouseEnter={e => e.currentTarget.style.color = "#ef4444"}
                    onMouseLeave={e => e.currentTarget.style.color = "#ccc"}>
                    <IcoX />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="cm-foot" style={{ justifyContent: "flex-end" }}>
            <button className="cm-b cm-bp" disabled={!files.length} onClick={() => { setError(null); setStep("config"); }}>
              Configure merge →
            </button>
          </div>
        </div>
      )}

      {/* ═══ STEP 2 — CONFIG ═══ */}
      {step === "config" && (
        <div className="cm-panel" key="config">

          {/* Summary bar */}
          <div style={{ background: "#f8f8fc", borderRadius: 10, padding: "10px 16px", marginBottom: 24, fontSize: 13, color: "#666", display: "flex", gap: 16, flexWrap: "wrap" }}>
            <span><strong>{files.length}</strong> file{files.length > 1 ? "s" : ""}</span>
            <span>{files.reduce((s, f) => s + f.rows, 0).toLocaleString()} total rows</span>
            <span>{(files.length === 1 ? allColumnsList : allColumns).length} {files.length > 1 ? "common " : ""}columns</span>
          </div>

          {/* Key column */}
          <div style={{ marginBottom: 24 }}>
            <div className="cm-t">Key column for deduplication</div>
            <div className="cm-s">Pick the column that uniquely identifies each row.</div>
            {allColumns.length === 0 && files.length > 1 ? (
              <div className="cm-err">No common columns found. Check headers or use full-row dedup.</div>
            ) : (
              <select className="cm-sel" style={{ width: "100%", maxWidth: 400 }}
                value={noKeyColumn ? "__none" : (keyColumn || "")}
                onChange={e => {
                  if (e.target.value === "__none") { setNoKeyColumn(true); setKeyColumn(null); }
                  else { setNoKeyColumn(false); setKeyColumn(e.target.value); }
                }}>
                {selectableCols.map(c => <option key={c} value={c}>{c} — {columnUniqueness[c] ?? "?"}% unique</option>)}
                <option value="__none">No key column — deduplicate on full row</option>
              </select>
            )}
          </div>

          {/* Cleaning */}
          <div style={{ marginBottom: 24 }}>
            <div className="cm-t">Auto-cleaning</div>
            {[
              ["trim", "Trim whitespace", "Remove leading/trailing spaces in every cell"],
              ["normalizeCase", "Normalize case", "Lowercase for comparison only (export unchanged)"],
              ["removeEmpty", "Remove empty rows", "Rows where all cells are blank"],
              ["removeDupes", "Remove exact duplicates", "Based on the selected key column"],
              ["fuzzy", "Fuzzy deduplication", "Detect near-duplicates (typos, extra spaces…)"],
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
                  Similarity threshold: <span className="cm-m">{fuzzyThreshold}%</span>
                </div>
                <input type="range" className="cm-sl" min={70} max={99}
                  value={fuzzyThreshold} onChange={e => setFuzzyThreshold(Number(e.target.value))} />
                <div style={{ fontSize: 12, color: "#888", marginTop: 6, fontStyle: "italic" }}>{fuzzyLabel}</div>
              </div>
            )}
          </div>

          {/* Columns */}
          {!columnsAreSame && files.length > 1 && (
            <div style={{ marginBottom: 24 }}>
              <div className="cm-t">Column handling</div>
              <div className="cm-s">Files have different columns.</div>
              <div style={{ display: "flex", gap: 16 }}>
                <label className="cm-r"><input type="radio" checked={keepAllCols} onChange={() => setKeepAllCols(true)} /> Keep all columns</label>
                <label className="cm-r"><input type="radio" checked={!keepAllCols} onChange={() => setKeepAllCols(false)} /> Common only ({allColumns.length})</label>
              </div>
            </div>
          )}

          {/* Conflict */}
          <div style={{ marginBottom: 24 }}>
            <div className="cm-t">Value conflicts</div>
            <div className="cm-s">When two rows share the same key but differ in other columns.</div>
            {[
              ["first", "Keep first file", "Priority to the file listed first"],
              ["last", "Keep last file", "Priority to the last file added"],
              ["both", "Keep both rows", "Preserves all rows, even conflicts"],
            ].map(([v, label, desc]) => (
              <label key={v} className="cm-r">
                <input type="radio" checked={conflictMode === v} onChange={() => setConflictMode(v)} />
                <div><div style={{ fontWeight: 500 }}>{label}</div><div style={{ fontSize: 12, color: "#888" }}>{desc}</div></div>
              </label>
            ))}
          </div>

          {/* Delimiter out */}
          <div style={{ marginBottom: 8 }}>
            <div className="cm-t">Export delimiter</div>
            <div style={{ display: "flex", gap: 16 }}>
              <label className="cm-r"><input type="radio" checked={delimiterOut === ","} onChange={() => setDelimiterOut(",")} /> <span className="cm-m">,</span>&nbsp;comma</label>
              <label className="cm-r"><input type="radio" checked={delimiterOut === ";"} onChange={() => setDelimiterOut(";")} /> <span className="cm-m">;</span>&nbsp;semicolon (Excel EU)</label>
            </div>
          </div>

          {error && <div className="cm-err">{error}</div>}

          {processing && (
            <div style={{ marginTop: 16 }}>
              <div className="cm-pb"><div className="cm-pf" style={{ width: `${progress}%` }} /></div>
              <div style={{ fontSize: 12, color: "#888", marginTop: 6, textAlign: "center" }}>Processing… {progress}%</div>
            </div>
          )}

          <div className="cm-foot">
            <button className="cm-b cm-bg2" onClick={() => setStep("import")}><IcoLeft /> Back</button>
            <button className="cm-b cm-bp" onClick={processMerge} disabled={processing || !files.length}>
              {processing ? "Processing…" : "Run merge →"}
            </button>
          </div>
        </div>
      )}

      {/* ═══ STEP 3 — PREVIEW ═══ */}
      {step === "preview" && result && stats && (
        <div className="cm-panel" key="preview">
          <div style={{ display: "grid", gap: 8, marginBottom: 28 }}>
            <div className="cm-st">
              <span className="cm-sti">📥</span>
              <span>{stats.filesCount} file{stats.filesCount > 1 ? "s" : ""} — <strong>{stats.totalInputRows.toLocaleString()}</strong> input rows</span>
            </div>
            {stats.encodingsCorrected > 0 && (
              <div className="cm-st"><span className="cm-sti">🔧</span><span>Encoding fixed on {stats.encodingsCorrected} file{stats.encodingsCorrected > 1 ? "s" : ""}</span></div>
            )}
            {(stats.trimmed > 0 || stats.emptyRemoved > 0) && (
              <div className="cm-st"><span className="cm-sti">🧹</span><span>{stats.trimmed.toLocaleString()} spaces trimmed, {stats.emptyRemoved} empty rows removed</span></div>
            )}
            {stats.dupesRemoved > 0 && (
              <div className="cm-st"><span className="cm-sti">🔁</span><span>{stats.dupesRemoved.toLocaleString()} exact duplicates removed</span></div>
            )}
            {stats.fuzzyDupes > 0 && (
              <div className="cm-st"><span className="cm-sti">〰️</span><span>{stats.fuzzyDupes} fuzzy duplicates ({fuzzyThreshold}% threshold)</span></div>
            )}
            <div className="cm-st" style={{ background: "#dcfce7" }}>
              <span className="cm-sti">✅</span>
              <span><strong>{stats.finalRows.toLocaleString()}</strong> unique rows</span>
            </div>
          </div>

          <div style={{ marginBottom: 24 }}>
            <div className="cm-t">Preview — first 10 rows</div>
            <div style={{ overflowX: "auto", border: "1px solid #e5e7eb", borderRadius: 10 }}>
              <table className="cm-tbl">
                <thead><tr><th style={{ color: "#aaa", width: 40 }}>#</th>{result.columns.map(c => <th key={c}>{c}</th>)}</tr></thead>
                <tbody>
                  {result.data.slice(0, 10).map((row, i) => (
                    <tr key={i}><td style={{ color: "#ccc" }}>{i + 1}</td>{result.columns.map(c => <td key={c}>{row[c]}</td>)}</tr>
                  ))}
                </tbody>
              </table>
            </div>
            {result.data.length > 10 && (
              <div style={{ fontSize: 12, color: "#999", marginTop: 6, textAlign: "center" }}>
                … and {(result.data.length - 10).toLocaleString()} more rows
              </div>
            )}
          </div>

          <div className="cm-foot">
            <button className="cm-b cm-bg2" onClick={() => setStep("config")}><IcoLeft /> Edit settings</button>
            <div style={{ display: "flex", gap: 10 }}>
              <button className="cm-b cm-bs" onClick={downloadReport}>Report .txt</button>
              <button className="cm-b cm-bp" onClick={downloadCSV}><IcoDl /> Download CSV</button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ STEP 4 — EXPORT DONE ═══ */}
      {step === "export" && (
        <div className="cm-panel" key="export" style={{ textAlign: "center", padding: "48px 0" }}>
          <div style={{ width: 56, height: 56, borderRadius: "50%", background: "#dcfce7", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px", fontSize: 28 }}>✓</div>
          <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>File downloaded</div>
          <div style={{ fontSize: 14, color: "#888", marginBottom: 28 }}>
            {stats?.finalRows.toLocaleString()} rows · {result?.columns.length} columns · {delimLabel(delimiterOut)}
          </div>
          <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
            <button className="cm-b cm-bs" onClick={() => setStep("preview")}>← Review</button>
            <button className="cm-b cm-bs" onClick={downloadReport}>Download report</button>
            <button className="cm-b cm-bp" onClick={reset}>New merge</button>
          </div>
        </div>
      )}
    </div>
  );
}
