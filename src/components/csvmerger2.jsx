"use client";
import { useState, useCallback, useRef, useMemo, useEffect } from "react";
import Papa from "papaparse";
import jschardet from "jschardet";
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
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return { encoding: "UTF-8", label: "UTF-8 (BOM)" };
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return { encoding: "UTF-16LE", label: "UTF-16 LE" };
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return { encoding: "UTF-16BE", label: "UTF-16 BE" };
  const sample = bytes.slice(0, 8192);
  let binaryStr = "";
  for (let i = 0; i < sample.length; i++) binaryStr += String.fromCharCode(sample[i]);
  const detected = jschardet.detect(binaryStr);
  const enc = (detected.encoding || "").toUpperCase();
  const map = {
    "ASCII": "UTF-8", "UTF-8": "UTF-8", "WINDOWS-1252": "windows-1252", "WINDOWS-1250": "windows-1250",
    "WINDOWS-1251": "windows-1251", "WINDOWS-1254": "windows-1254", "WINDOWS-1256": "windows-1256",
    "ISO-8859-1": "iso-8859-1", "ISO-8859-2": "iso-8859-2", "ISO-8859-5": "iso-8859-5",
    "ISO-8859-7": "iso-8859-7", "ISO-8859-8": "iso-8859-8", "ISO-8859-9": "iso-8859-9",
    "ISO-8859-15": "iso-8859-15", "MACROMAN": "macintosh", "IBM866": "ibm866", "KOI8-R": "koi8-r",
    "UTF-16LE": "utf-16le", "UTF-16BE": "utf-16be", "SHIFT_JIS": "shift_jis", "EUC-JP": "euc-jp",
    "GB2312": "gb18030", "GB18030": "gb18030", "BIG5": "big5", "EUC-KR": "euc-kr", "TIS-620": "windows-874",
  };
  let decoderName = "utf-8", label = enc || "UTF-8";
  for (const [key, val] of Object.entries(map)) { if (enc.includes(key)) { decoderName = val; label = key; break; } }
  if (detected.confidence < 0.5 && decoderName !== "utf-8") {
    try { new TextDecoder("utf-8", { fatal: true }).decode(sample); return { encoding: "utf-8", label: "UTF-8" }; } catch {}
  }
  return { encoding: decoderName, label };
}

function decodeBuffer(buffer, encoding) {
  try { return new TextDecoder(encoding, { fatal: false }).decode(buffer); }
  catch { return new TextDecoder("utf-8", { fatal: false }).decode(buffer); }
}

function formatSize(bytes) {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

function delimLabel(d) {
  if (d === ",") return "comma ,"; if (d === ";") return "semicolon ;";
  if (d === "\t") return "TAB"; if (d === "|") return "pipe |"; return d;
}

/* ── Icons ── */
const IcoUp = () => <svg width="28" height="28" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" /></svg>;
const IcoX = () => <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>;
const IcoChk = () => <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>;
const IcoLeft = () => <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" /></svg>;
const IcoDl = () => <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12M12 16.5V3" /></svg>;
const IcoChev = ({ open }) => <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" style={{ transition: "transform .2s", transform: open ? "rotate(180deg)" : "rotate(0)" }}><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" /></svg>;

/* ── Accordion section ── */
function Section({ title, summary, defaultOpen = true, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="cm-section">
      <button className="cm-section-head" onClick={() => setOpen(o => !o)} type="button">
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="cm-section-title">{title}</div>
          {!open && summary && <div className="cm-section-sum">{summary}</div>}
        </div>
        <IcoChev open={open} />
      </button>
      <div className="cm-section-body" style={{ display: open ? "block" : "none" }}>
        {children}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════ */
const STEPS = ["import", "config", "preview", "export"];
const STEP_LABELS = ["Import", "Configure", "Preview", "Export"];

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
        const { encoding, label: encLabel } = detectEncoding(buffer);
        const text = decodeBuffer(buffer, encoding);
        const delimiter = detectDelimiter(text);
        const parsed = Papa.parse(text, { header: true, delimiter, skipEmptyLines: true, dynamicTyping: false });
        if (!parsed.data.length) { setError(`"${file.name}" — unrecognized format.`); continue; }
        added.push({
          id: Date.now() + Math.random(), name: file.name, size: file.size,
          encoding: encLabel, encodingCorrected: encoding !== "utf-8" && encoding !== "UTF-8",
          delimiter, rows: parsed.data.length, columns: parsed.meta.fields || [], data: parsed.data,
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

  const conflictLabels = { first: "Keep first file", last: "Keep last file", both: "Keep both rows" };
  const cleanCount = Object.values(cleanOpts).filter(Boolean).length;

  /* ═══════════════════════════════════ RENDER ═══════════════════════════════════ */
  return (
    <div className="cm-root">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;1,9..40,400&family=DM+Mono:wght@400;500&display=swap');

        .cm-root{font-family:'DM Sans',-apple-system,sans-serif;max-width:860px;margin:0 auto;padding:0 16px;color:#1a1a2e}

        /* ── Stepper ── */
        .cm-stepper{display:flex;align-items:center;justify-content:center;margin-bottom:28px;gap:0}
        .cm-dot{width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:600;transition:all .3s;flex-shrink:0}
        .cm-dot.a{background:#1a1a2e;color:#fff}.cm-dot.d{background:#22c55e;color:#fff}.cm-dot.p{background:#e5e5e5;color:#999}
        .cm-step-label{font-size:11px;font-weight:500;margin-top:4px}
        .cm-step-line{width:48px;height:2px;margin:0 8px;margin-bottom:18px;border-radius:1px;flex-shrink:0}

        /* ── Dropzone ── */
        .cm-drop{border:2px dashed #d1d5db;border-radius:12px;padding:40px 20px;text-align:center;cursor:pointer;transition:all .25s;background:#fafafa}
        .cm-drop:hover,.cm-drop.ov{border-color:#1a1a2e;background:#f0f0f8}

        /* ── File cards ── */
        .cm-card{background:#fff;border:1px solid #e5e7eb;border-radius:10px;padding:12px 14px;margin-top:8px;display:flex;justify-content:space-between;align-items:flex-start;transition:all .2s;gap:8px}
        .cm-card:hover{border-color:#c5c5d0;box-shadow:0 1px 4px rgba(0,0,0,.04)}
        .cm-card-info{flex:1;min-width:0}
        .cm-card-top{display:flex;align-items:center;gap:6px;flex-wrap:wrap}
        .cm-card-meta{font-size:12px;color:#888;margin-top:5px;display:flex;gap:12px;flex-wrap:wrap}

        /* ── Badges ── */
        .cm-bg{display:inline-flex;align-items:center;gap:4px;font-size:11px;font-weight:500;padding:2px 8px;border-radius:20px}
        .cm-bg-ok{background:#dcfce7;color:#166534}.cm-bg-w{background:#fef3c7;color:#92400e}

        /* ── Buttons ── */
        .cm-b{display:inline-flex;align-items:center;justify-content:center;gap:8px;padding:10px 20px;border-radius:8px;border:none;font-family:'DM Sans',sans-serif;font-size:14px;font-weight:500;cursor:pointer;transition:all .2s;white-space:nowrap}
        .cm-bp{background:#1a1a2e;color:#fff}.cm-bp:hover{background:#2a2a4e}.cm-bp:disabled{background:#ccc;cursor:not-allowed}
        .cm-bs{background:#fff;color:#1a1a2e;border:1px solid #d1d5db}.cm-bs:hover{background:#f5f5f5}
        .cm-bg2{background:transparent;color:#666;padding:8px 12px}.cm-bg2:hover{color:#1a1a2e}

        /* ── Form elements ── */
        .cm-chk{display:flex;align-items:flex-start;gap:10px;padding:7px 0;cursor:pointer;font-size:14px}
        .cm-chk input[type="checkbox"]{width:16px;height:16px;accent-color:#1a1a2e;cursor:pointer;margin-top:2px;flex-shrink:0}
        .cm-r{display:flex;align-items:flex-start;gap:10px;padding:6px 0;cursor:pointer;font-size:14px}
        .cm-r input[type="radio"]{width:15px;height:15px;accent-color:#1a1a2e;cursor:pointer;margin-top:2px;flex-shrink:0}
        .cm-sel{font-family:'DM Sans',sans-serif;font-size:14px;padding:8px 32px 8px 12px;border:1px solid #d1d5db;border-radius:8px;background:#fff;cursor:pointer;appearance:none;background-image:url("data:image/svg+xml,%3Csvg width='12' height='12' viewBox='0 0 24 24' fill='none'%3E%3Cpath d='M6 9l6 6 6-6' stroke='%23666' stroke-width='2' stroke-linecap='round'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 10px center;width:100%;max-width:400px}
        .cm-sl{width:100%;accent-color:#1a1a2e;cursor:pointer}

        /* ── Accordion sections ── */
        .cm-section{border:1px solid #e5e7eb;border-radius:10px;margin-bottom:10px;overflow:hidden;background:#fff}
        .cm-section-head{width:100%;display:flex;align-items:center;gap:12px;padding:14px 16px;background:none;border:none;cursor:pointer;font-family:'DM Sans',sans-serif;text-align:left}
        .cm-section-head:hover{background:#fafafa}
        .cm-section-title{font-size:14px;font-weight:600;color:#1a1a2e}
        .cm-section-sum{font-size:12px;color:#888;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .cm-section-body{padding:0 16px 16px}

        /* ── Table ── */
        .cm-tbl-wrap{overflow-x:auto;border:1px solid #e5e7eb;border-radius:10px;-webkit-overflow-scrolling:touch}
        .cm-tbl{width:100%;border-collapse:collapse;font-size:13px}
        .cm-tbl th{background:#f5f5f7;font-weight:600;text-align:left;padding:8px 12px;border-bottom:2px solid #e5e7eb;font-family:'DM Mono',monospace;font-size:12px;white-space:nowrap}
        .cm-tbl td{padding:7px 12px;border-bottom:1px solid #f0f0f0;font-family:'DM Mono',monospace;font-size:12px;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
        .cm-tbl tr:hover td{background:#fafafa}

        /* ── Stats ── */
        .cm-st{display:flex;align-items:center;gap:10px;padding:10px 14px;border-radius:10px;background:#f8f8fc;font-size:13px}
        .cm-sti{font-size:16px;flex-shrink:0;width:28px;text-align:center}

        /* ── Progress ── */
        .cm-pb{width:100%;height:4px;background:#e5e5e5;border-radius:4px;overflow:hidden}
        .cm-pf{height:100%;background:#1a1a2e;border-radius:4px;transition:width .3s}

        /* ── Misc ── */
        .cm-m{font-family:'DM Mono',monospace}
        .cm-err{background:#fef2f2;border:1px solid #fecaca;color:#dc2626;padding:10px 14px;border-radius:8px;font-size:13px;margin-top:10px}
        .cm-panel{animation:cmIn .35s ease both}
        @keyframes cmIn{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
        .cm-foot{display:flex;justify-content:space-between;align-items:center;margin-top:24px;padding-top:18px;border-top:1px solid #f0f0f0;gap:12px}

        /* ── Summary bar ── */
        .cm-summary{background:#f8f8fc;border-radius:10px;padding:10px 14px;margin-bottom:16px;font-size:13px;color:#666;display:flex;gap:14px;flex-wrap:wrap}

        /* ═══ RESPONSIVE ═══ */
        @media (max-width: 640px) {
          .cm-root{padding:0 12px}

          /* Stepper compact */
          .cm-stepper{margin-bottom:20px}
          .cm-dot{width:24px;height:24px;font-size:11px}
          .cm-step-label{font-size:10px}
          .cm-step-line{width:28px;margin:0 4px;margin-bottom:16px}

          /* Dropzone */
          .cm-drop{padding:32px 16px}
          .cm-drop svg{width:24px;height:24px}

          /* Cards */
          .cm-card{padding:10px 12px}
          .cm-card-meta{gap:8px;font-size:11px}

          /* Buttons */
          .cm-b{padding:10px 16px;font-size:13px}
          .cm-foot{flex-wrap:wrap}
          .cm-foot .cm-b{flex:1;min-width:0}
          .cm-foot .cm-bg2{flex:0 0 auto}

          /* Sections */
          .cm-section-head{padding:12px 14px}
          .cm-section-body{padding:0 14px 14px}

          /* Table cells tighter */
          .cm-tbl th,.cm-tbl td{padding:6px 8px;font-size:11px}
          .cm-tbl td{max-width:120px}

          /* Stats */
          .cm-st{padding:8px 12px;font-size:12px;gap:8px}
          .cm-sti{font-size:14px;width:24px}

          /* Summary */
          .cm-summary{font-size:12px;gap:8px;padding:8px 12px}

          /* Select full width */
          .cm-sel{max-width:100%;font-size:13px}

          /* Export done */
          .cm-export-done{padding:32px 0 !important}

          /* Radio/check text */
          .cm-chk,.cm-r{font-size:13px}
        }

        @media (max-width: 380px) {
          .cm-step-label{display:none}
          .cm-step-line{width:20px;margin-bottom:0}
          .cm-dot{width:22px;height:22px;font-size:10px}
        }
      `}</style>

      {/* ── Stepper ── */}
      <div className="cm-stepper">
        {STEPS.map((s, i) => (
          <div key={s} style={{ display: "flex", alignItems: "center" }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 0 }}>
              <div className={`cm-dot ${i < stepIdx ? "d" : i === stepIdx ? "a" : "p"}`}>
                {i < stepIdx ? <IcoChk /> : i + 1}
              </div>
              <span className="cm-step-label" style={{ color: i <= stepIdx ? "#1a1a2e" : "#aaa" }}>
                {STEP_LABELS[i]}
              </span>
            </div>
            {i < 3 && <div className="cm-step-line" style={{ background: i < stepIdx ? "#22c55e" : "#e5e5e5" }} />}
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
            <div style={{ color: "#888", marginBottom: 10, display: "flex", justifyContent: "center" }}><IcoUp /></div>
            <div style={{ fontSize: 15, fontWeight: 500, color: "#444" }}>Drop your CSV files here</div>
            <div style={{ fontSize: 13, color: "#999", marginTop: 4 }}>or tap to browse</div>
          </div>

          {error && <div className="cm-err">{error}</div>}

          {files.length > 0 && (
            <div style={{ marginTop: 12 }}>
              {files.map(f => (
                <div key={f.id} className="cm-card">
                  <div className="cm-card-info">
                    <div className="cm-card-top">
                      <span className="cm-m" style={{ fontWeight: 500, fontSize: 13 }}>{f.name}</span>
                      <span style={{ fontSize: 12, color: "#999" }}>{formatSize(f.size)}</span>
                      {f.encodingCorrected
                        ? <span className="cm-bg cm-bg-w">⚠ {f.encoding} → UTF-8</span>
                        : <span className="cm-bg cm-bg-ok">✓ {f.encoding}</span>}
                    </div>
                    <div className="cm-card-meta">
                      <span>{f.rows.toLocaleString()} rows</span>
                      <span>{f.columns.length} cols</span>
                      <span>Delim: {delimLabel(f.delimiter)}</span>
                    </div>
                  </div>
                  <button onClick={e => { e.stopPropagation(); removeFile(f.id); }}
                    style={{ background: "none", border: "none", cursor: "pointer", color: "#ccc", padding: 4, flexShrink: 0 }}
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

      {/* ═══ STEP 2 — CONFIG (accordion) ═══ */}
      {step === "config" && (
        <div className="cm-panel" key="config">

          <div className="cm-summary">
            <span><strong>{files.length}</strong> file{files.length > 1 ? "s" : ""}</span>
            <span>{files.reduce((s, f) => s + f.rows, 0).toLocaleString()} total rows</span>
            <span>{selectableCols.length} {files.length > 1 ? "common " : ""}columns</span>
          </div>

          {/* Key column */}
          <Section
            title="Key column"
            summary={noKeyColumn ? "Full row deduplication" : keyColumn ? `${keyColumn} — ${columnUniqueness[keyColumn] ?? "?"}% unique` : "—"}
            defaultOpen={true}
          >
            <div style={{ fontSize: 13, color: "#666", marginBottom: 10 }}>
              Pick the column that uniquely identifies each row.
            </div>
            {allColumns.length === 0 && files.length > 1 ? (
              <div className="cm-err" style={{ margin: 0 }}>No common columns found. Check headers or use full-row dedup.</div>
            ) : (
              <select className="cm-sel"
                value={noKeyColumn ? "__none" : (keyColumn || "")}
                onChange={e => {
                  if (e.target.value === "__none") { setNoKeyColumn(true); setKeyColumn(null); }
                  else { setNoKeyColumn(false); setKeyColumn(e.target.value); }
                }}>
                {selectableCols.map(c => <option key={c} value={c}>{c} — {columnUniqueness[c] ?? "?"}% unique</option>)}
                <option value="__none">No key column — deduplicate on full row</option>
              </select>
            )}
          </Section>

          {/* Cleaning */}
          <Section
            title="Auto-cleaning"
            summary={`${cleanCount} option${cleanCount > 1 ? "s" : ""} enabled${cleanOpts.fuzzy ? ` · fuzzy ${fuzzyThreshold}%` : ""}`}
            defaultOpen={true}
          >
            {[
              ["trim", "Trim whitespace", "Remove leading/trailing spaces"],
              ["normalizeCase", "Normalize case", "Lowercase for comparison only"],
              ["removeEmpty", "Remove empty rows", "All cells blank"],
              ["removeDupes", "Remove exact duplicates", "Based on key column"],
              ["fuzzy", "Fuzzy deduplication", "Near-duplicates (typos, spaces…)"],
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
              <div style={{ marginLeft: 26, marginTop: 8, padding: "14px", background: "#f8f8fc", borderRadius: 10 }}>
                <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 8 }}>
                  Similarity: <span className="cm-m">{fuzzyThreshold}%</span>
                </div>
                <input type="range" className="cm-sl" min={70} max={99}
                  value={fuzzyThreshold} onChange={e => setFuzzyThreshold(Number(e.target.value))} />
                <div style={{ fontSize: 12, color: "#888", marginTop: 6, fontStyle: "italic" }}>{fuzzyLabel}</div>
              </div>
            )}
          </Section>

          {/* Columns — only if different */}
          {!columnsAreSame && files.length > 1 && (
            <Section
              title="Column handling"
              summary={keepAllCols ? "Keeping all columns" : `Common only (${allColumns.length})`}
              defaultOpen={false}
            >
              <div style={{ fontSize: 13, color: "#666", marginBottom: 8 }}>Files have different columns.</div>
              <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                <label className="cm-r"><input type="radio" checked={keepAllCols} onChange={() => setKeepAllCols(true)} /> Keep all columns</label>
                <label className="cm-r"><input type="radio" checked={!keepAllCols} onChange={() => setKeepAllCols(false)} /> Common only ({allColumns.length})</label>
              </div>
            </Section>
          )}

          {/* Conflict */}
          <Section
            title="Value conflicts"
            summary={conflictLabels[conflictMode]}
            defaultOpen={false}
          >
            <div style={{ fontSize: 13, color: "#666", marginBottom: 8 }}>
              When two rows share the same key but differ in other columns.
            </div>
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
          </Section>

          {/* Delimiter */}
          <Section
            title="Export delimiter"
            summary={delimiterOut === "," ? "Comma ," : "Semicolon ; (Excel EU)"}
            defaultOpen={false}
          >
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
              <label className="cm-r"><input type="radio" checked={delimiterOut === ","} onChange={() => setDelimiterOut(",")} /> <span className="cm-m">,</span>&nbsp;comma</label>
              <label className="cm-r"><input type="radio" checked={delimiterOut === ";"} onChange={() => setDelimiterOut(";")} /> <span className="cm-m">;</span>&nbsp;semicolon (Excel EU)</label>
            </div>
          </Section>

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
          <div style={{ display: "grid", gap: 8, marginBottom: 24 }}>
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
              <div className="cm-st"><span className="cm-sti">〰️</span><span>{stats.fuzzyDupes} fuzzy duplicates ({fuzzyThreshold}%)</span></div>
            )}
            <div className="cm-st" style={{ background: "#dcfce7" }}>
              <span className="cm-sti">✅</span>
              <span><strong>{stats.finalRows.toLocaleString()}</strong> unique rows</span>
            </div>
          </div>

          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>Preview — first 10 rows</div>
            <div className="cm-tbl-wrap">
              <table className="cm-tbl">
                <thead><tr><th style={{ color: "#aaa", width: 36 }}>#</th>{result.columns.map(c => <th key={c}>{c}</th>)}</tr></thead>
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
            <button className="cm-b cm-bg2" onClick={() => setStep("config")}><IcoLeft /> Edit</button>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button className="cm-b cm-bs" onClick={downloadReport}>Report</button>
              <button className="cm-b cm-bp" onClick={downloadCSV}><IcoDl /> Download CSV</button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ STEP 4 — EXPORT DONE ═══ */}
      {step === "export" && (
        <div className="cm-panel cm-export-done" key="export" style={{ textAlign: "center", padding: "48px 0" }}>
          <div style={{ width: 52, height: 52, borderRadius: "50%", background: "#dcfce7", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 18px", fontSize: 26 }}>✓</div>
          <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 6 }}>File downloaded</div>
          <div style={{ fontSize: 14, color: "#888", marginBottom: 24 }}>
            {stats?.finalRows.toLocaleString()} rows · {result?.columns.length} columns · {delimLabel(delimiterOut)}
          </div>
          <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
            <button className="cm-b cm-bs" onClick={() => setStep("preview")}>← Review</button>
            <button className="cm-b cm-bs" onClick={downloadReport}>Report</button>
            <button className="cm-b cm-bp" onClick={reset}>New merge</button>
          </div>
        </div>
      )}
    </div>
  );
}