"use client";
import { useState, useCallback, useRef, useMemo } from "react";

/* ── Utilities ── */
function formatSize(bytes) {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

function estimateCO2(savedBytes) {
  // ~0.2g CO2 per MB transferred (average data center estimate)
  return ((savedBytes / (1024 * 1024)) * 0.2).toFixed(2);
}

/* ── Icons ── */
const IcoUp = () => <svg width="28" height="28" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" /></svg>;
const IcoX = () => <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>;
const IcoChk = () => <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>;
const IcoLeft = () => <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" /></svg>;
const IcoDl = () => <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12M12 16.5V3" /></svg>;
const IcoChev = ({ open }) => <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" style={{ transition: "transform .2s", transform: open ? "rotate(180deg)" : "rotate(0)" }}><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" /></svg>;
const IcoImg = () => <svg width="28" height="28" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0022.5 18.75V5.25A2.25 2.25 0 0020.25 3H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21z" /></svg>;

/* ── Accordion section ── */
function Section({ title, summary, defaultOpen = true, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="ic-section">
      <button className="ic-section-head" onClick={() => setOpen(o => !o)} type="button">
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="ic-section-title">{title}</div>
          {!open && summary && <div className="ic-section-sum">{summary}</div>}
        </div>
        <IcoChev open={open} />
      </button>
      <div className="ic-section-body" style={{ display: open ? "block" : "none" }}>
        {children}
      </div>
    </div>
  );
}

/* ── Templates ── */
const TEMPLATES = {
  ecommerce: {
    label: "E-commerce",
    desc: "Carré, WebP, optimisé vente",
    color: "#3b82f6",
    bg: "#dbeafe",
    icon: "🛒",
    config: { enableResize: true, resizePercent: 80, enableCrop: true, aspectRatio: "1/1", cropPosition: "center", enableConvert: true, outputFormat: "webp", quality: 85 },
    details: ["Format : 1:1", "Qualité : 85%", "Redim : 80%"],
  },
  instagram: {
    label: "Instagram",
    desc: "Pack post + story",
    color: "#a855f7",
    bg: "#f3e8ff",
    icon: "📸",
    config: { enableResize: false, resizePercent: 100, enableCrop: true, aspectRatio: "1/1", cropPosition: "center", enableConvert: true, outputFormat: "webp", quality: 90 },
    details: ["Format : 1:1", "Qualité : 90%", "WebP optimisé"],
  },
  linkedin: {
    label: "LinkedIn",
    desc: "Bannière + post pro",
    color: "#1d4ed8",
    bg: "#dbeafe",
    icon: "💼",
    config: { enableResize: true, resizePercent: 90, enableCrop: true, aspectRatio: "16/9", cropPosition: "center", enableConvert: true, outputFormat: "webp", quality: 90 },
    details: ["Format : 16:9", "Qualité : 90%", "Redim : 90%"],
  },
  web: {
    label: "Web",
    desc: "Performance maximale",
    color: "#16a34a",
    bg: "#dcfce7",
    icon: "🌐",
    config: { enableResize: true, resizePercent: 70, enableCrop: false, aspectRatio: "free", cropPosition: "center", enableConvert: true, outputFormat: "webp", quality: 80 },
    details: ["Format : Original", "WebP 80%", "Compression max"],
  },
  responsive: {
    label: "Responsive",
    desc: "Multi-tailles web moderne",
    color: "#6366f1",
    bg: "#e0e7ff",
    icon: "📱",
    config: { enableResize: true, resizePercent: 60, enableCrop: false, aspectRatio: "free", cropPosition: "center", enableConvert: true, outputFormat: "webp", quality: 82 },
    details: ["Redim : 60%", "WebP + fallback", "Optimisé mobile"],
  },
};

const ASPECT_RATIOS = [
  { value: "1/1", label: "1:1 (Carré)" },
  { value: "16/9", label: "16:9 (Paysage)" },
  { value: "4/3", label: "4:3 (Standard)" },
  { value: "3/4", label: "3:4 (Portrait)" },
  { value: "9/16", label: "9:16 (Portrait mobile)" },
  { value: "free", label: "Libre" },
];

const CROP_POSITIONS = [
  { value: "center", label: "Centre" },
  { value: "top", label: "Haut" },
  { value: "bottom", label: "Bas" },
  { value: "left", label: "Gauche" },
  { value: "right", label: "Droite" },
];

const OUTPUT_FORMATS = [
  { value: "webp", label: "WebP" },
  { value: "jpeg", label: "JPEG" },
  { value: "png", label: "PNG" },
];

/* ═══════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════ */
const STEPS = ["import", "config", "processing", "results"];
const STEP_LABELS = ["Import", "Configure", "Traitement", "Résultats"];

export default function ImageCropper() {
  /* ── State ── */
  const [files, setFiles] = useState([]);
  const [step, setStep] = useState("import");
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState(null);
  const fileInputRef = useRef(null);

  // Config
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [configMode, setConfigMode] = useState("templates"); // "templates" | "manual"
  const [enableResize, setEnableResize] = useState(false);
  const [resizePercent, setResizePercent] = useState(80);
  const [enableCrop, setEnableCrop] = useState(false);
  const [aspectRatio, setAspectRatio] = useState("1/1");
  const [cropPosition, setCropPosition] = useState("center");
  const [enableConvert, setEnableConvert] = useState(true);
  const [outputFormat, setOutputFormat] = useState("webp");
  const [quality, setQuality] = useState(90);

  // Processing
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressText, setProgressText] = useState("");
  const [cancelled, setCancelled] = useState(false);
  const cancelRef = useRef(false);

  // Results
  const [results, setResults] = useState(null);

  /* ── Derived ── */
  const totalSize = useMemo(() => files.reduce((s, f) => s + f.size, 0), [files]);

  const activeConfig = useMemo(() => {
    if (selectedTemplate && configMode === "templates") return TEMPLATES[selectedTemplate].config;
    return { enableResize, resizePercent, enableCrop, aspectRatio, cropPosition, enableConvert, outputFormat, quality };
  }, [selectedTemplate, configMode, enableResize, resizePercent, enableCrop, aspectRatio, cropPosition, enableConvert, outputFormat, quality]);

  const hasAction = activeConfig.enableResize || activeConfig.enableCrop || activeConfig.enableConvert;

  const configSummaryText = useMemo(() => {
    const parts = [];
    if (activeConfig.enableResize) parts.push(`Redim ${activeConfig.resizePercent}%`);
    if (activeConfig.enableCrop) parts.push(`Crop ${activeConfig.aspectRatio}`);
    if (activeConfig.enableConvert) parts.push(`${activeConfig.outputFormat.toUpperCase()} ${activeConfig.quality}%`);
    return parts.join(" · ") || "Aucune action";
  }, [activeConfig]);

  /* ── File handling ── */
  const handleFiles = useCallback((fileList) => {
    setError(null);
    const added = [];
    for (const file of fileList) {
      if (!file.type.startsWith("image/") && !file.name.match(/\.(jpg|jpeg|png|webp|gif|avif|tiff?|bmp|svg)$/i)) {
        setError(`"${file.name}" ignoré — format non supporté.`);
        continue;
      }
      if (file.size > 50 * 1024 * 1024) {
        setError(`"${file.name}" ignoré — taille max 50 MB.`);
        continue;
      }
      if (files.some(f => f.name === file.name) || added.some(f => f.name === file.name)) {
        setError(`"${file.name}" est déjà dans la liste.`);
        continue;
      }
      const url = URL.createObjectURL(file);
      added.push({
        id: Date.now() + Math.random(),
        name: file.name,
        size: file.size,
        type: file.type || "image/" + file.name.split(".").pop(),
        file,
        previewUrl: url,
        dimensions: null,
      });
    }

    // Load dimensions for each added file
    added.forEach((item) => {
      const img = new Image();
      img.onload = () => {
        setFiles(prev => prev.map(f =>
          f.id === item.id ? { ...f, dimensions: { w: img.naturalWidth, h: img.naturalHeight } } : f
        ));
      };
      img.src = item.previewUrl;
    });

    if (added.length) setFiles(prev => [...prev, ...added]);
  }, [files]);

  const removeFile = (id) => {
    setFiles(prev => {
      const f = prev.find(x => x.id === id);
      if (f) URL.revokeObjectURL(f.previewUrl);
      return prev.filter(x => x.id !== id);
    });
  };

  /* ── Image processing (Canvas API) ── */
  function loadImage(file) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = URL.createObjectURL(file);
    });
  }

  function cropImage(canvas, ctx, img, ratio, position) {
    const srcW = img.naturalWidth;
    const srcH = img.naturalHeight;
    let targetW, targetH;

    if (ratio === "free") {
      targetW = srcW;
      targetH = srcH;
    } else {
      const [rw, rh] = ratio.split("/").map(Number);
      const targetRatio = rw / rh;
      if (srcW / srcH > targetRatio) {
        targetH = srcH;
        targetW = Math.round(srcH * targetRatio);
      } else {
        targetW = srcW;
        targetH = Math.round(srcW / targetRatio);
      }
    }

    let sx = 0, sy = 0;
    switch (position) {
      case "top": sx = Math.round((srcW - targetW) / 2); sy = 0; break;
      case "bottom": sx = Math.round((srcW - targetW) / 2); sy = srcH - targetH; break;
      case "left": sx = 0; sy = Math.round((srcH - targetH) / 2); break;
      case "right": sx = srcW - targetW; sy = Math.round((srcH - targetH) / 2); break;
      default: sx = Math.round((srcW - targetW) / 2); sy = Math.round((srcH - targetH) / 2);
    }

    canvas.width = targetW;
    canvas.height = targetH;
    ctx.drawImage(img, sx, sy, targetW, targetH, 0, 0, targetW, targetH);
    return { w: targetW, h: targetH };
  }

  async function processImages() {
    setProcessing(true);
    setProgress(0);
    setProgressText("Initialisation...");
    setCancelled(false);
    cancelRef.current = false;

    const cfg = activeConfig;
    const processed = [];
    const errors = [];

    for (let i = 0; i < files.length; i++) {
      if (cancelRef.current) { setCancelled(true); break; }

      const f = files[i];
      setProgressText(`Traitement de ${f.name}...`);
      setProgress(Math.round(((i) / files.length) * 90));

      try {
        const img = await loadImage(f.file);
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");

        let currentW = img.naturalWidth;
        let currentH = img.naturalHeight;

        // Step 1: Crop
        if (cfg.enableCrop && cfg.aspectRatio !== "free") {
          const dims = cropImage(canvas, ctx, img, cfg.aspectRatio, cfg.cropPosition);
          currentW = dims.w;
          currentH = dims.h;
        } else {
          canvas.width = currentW;
          canvas.height = currentH;
          ctx.drawImage(img, 0, 0);
        }

        // Step 2: Resize
        if (cfg.enableResize && cfg.resizePercent !== 100) {
          const scale = cfg.resizePercent / 100;
          const newW = Math.round(currentW * scale);
          const newH = Math.round(currentH * scale);
          const tempCanvas = document.createElement("canvas");
          tempCanvas.width = newW;
          tempCanvas.height = newH;
          const tempCtx = tempCanvas.getContext("2d");
          tempCtx.drawImage(canvas, 0, 0, currentW, currentH, 0, 0, newW, newH);
          canvas.width = newW;
          canvas.height = newH;
          ctx.drawImage(tempCanvas, 0, 0);
          currentW = newW;
          currentH = newH;
        }

        // Step 3: Convert & compress
        let mimeType = f.type;
        let ext = f.name.split(".").pop();
        if (cfg.enableConvert) {
          const formatMap = { webp: "image/webp", jpeg: "image/jpeg", png: "image/png" };
          mimeType = formatMap[cfg.outputFormat] || mimeType;
          ext = cfg.outputFormat === "jpeg" ? "jpg" : cfg.outputFormat;
        }

        const qualityVal = cfg.enableConvert ? cfg.quality / 100 : 0.92;
        const blob = await new Promise(resolve => canvas.toBlob(resolve, mimeType, qualityVal));

        const baseName = f.name.replace(/\.[^.]+$/, "");
        const newName = `${baseName}_optimized.${ext}`;

        URL.revokeObjectURL(img.src);

        processed.push({
          id: f.id,
          originalName: f.name,
          name: newName,
          originalSize: f.size,
          newSize: blob.size,
          originalDims: f.dimensions || { w: img.naturalWidth, h: img.naturalHeight },
          newDims: { w: currentW, h: currentH },
          blob,
          previewUrl: URL.createObjectURL(blob),
        });
      } catch (err) {
        errors.push({ name: f.name, error: err.message });
      }
    }

    if (!cancelRef.current) {
      const totalOriginal = processed.reduce((s, p) => s + p.originalSize, 0);
      const totalNew = processed.reduce((s, p) => s + p.newSize, 0);
      const saved = totalOriginal - totalNew;

      setResults({
        files: processed,
        errors,
        stats: {
          count: processed.length,
          totalOriginal,
          totalNew,
          saved: Math.max(0, saved),
          percent: totalOriginal > 0 ? Math.max(0, Math.round((saved / totalOriginal) * 100)) : 0,
          co2: estimateCO2(Math.max(0, saved)),
        },
      });
      setProgress(100);
      setProgressText("Terminé !");
      setTimeout(() => setStep("results"), 400);
    }

    setProcessing(false);
  }

  /* ── Downloads ── */
  function downloadSingle(item) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(item.blob);
    a.download = item.name;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function downloadAll() {
    if (!results) return;
    // If only one file, download directly
    if (results.files.length === 1) {
      downloadSingle(results.files[0]);
      return;
    }
    // Otherwise download each (could add JSZip later)
    for (const item of results.files) {
      downloadSingle(item);
      await new Promise(r => setTimeout(r, 200));
    }
  }

  function downloadReport() {
    if (!results) return;
    const d = new Date().toISOString().slice(0, 10);
    const lines = [
      `Image Cropper — Rapport du ${d}`,
      "─".repeat(40),
      "",
      `Images traitées : ${results.stats.count}`,
      `Taille originale : ${formatSize(results.stats.totalOriginal)}`,
      `Taille finale : ${formatSize(results.stats.totalNew)}`,
      `Économies : ${formatSize(results.stats.saved)} (${results.stats.percent}%)`,
      `CO₂ économisé : ${results.stats.co2}g`,
      "",
      `Configuration : ${configSummaryText}`,
      "",
      "Détails :",
      ...results.files.map(f =>
        `  ${f.originalName} → ${f.name} | ${formatSize(f.originalSize)} → ${formatSize(f.newSize)} | ${f.originalDims.w}×${f.originalDims.h} → ${f.newDims.w}×${f.newDims.h}`
      ),
      ...(results.errors.length ? ["", "Erreurs :", ...results.errors.map(e => `  ${e.name} : ${e.error}`)] : []),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `rapport_images_${d}.txt`;
    a.click();
  }

  /* ── Reset ── */
  const reset = () => {
    files.forEach(f => URL.revokeObjectURL(f.previewUrl));
    if (results) results.files.forEach(f => URL.revokeObjectURL(f.previewUrl));
    setFiles([]);
    setStep("import");
    setResults(null);
    setError(null);
    setSelectedTemplate(null);
    setConfigMode("templates");
    setEnableResize(false);
    setResizePercent(80);
    setEnableCrop(false);
    setAspectRatio("1/1");
    setCropPosition("center");
    setEnableConvert(true);
    setOutputFormat("webp");
    setQuality(90);
    setProgress(0);
  };

  /* ── Apply template ── */
  function applyTemplate(key) {
    setSelectedTemplate(key);
    const cfg = TEMPLATES[key].config;
    setEnableResize(cfg.enableResize);
    setResizePercent(cfg.resizePercent);
    setEnableCrop(cfg.enableCrop);
    setAspectRatio(cfg.aspectRatio);
    setCropPosition(cfg.cropPosition);
    setEnableConvert(cfg.enableConvert);
    setOutputFormat(cfg.outputFormat);
    setQuality(cfg.quality);
  }

  const stepIdx = STEPS.indexOf(step);

  /* ═══════════════════════════════════ RENDER ═══════════════════════════════════ */
  return (
    <div className="ic-root">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;1,9..40,400&family=DM+Mono:wght@400;500&display=swap');

        .ic-root{font-family:'DM Sans',-apple-system,sans-serif;max-width:860px;margin:0 auto;padding:0 16px;color:#1a1a2e}

        /* ── Stepper ── */
        .ic-stepper{display:flex;align-items:center;justify-content:center;margin-bottom:28px;gap:0}
        .ic-dot{width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:600;transition:all .3s;flex-shrink:0}
        .ic-dot.a{background:#1a1a2e;color:#fff}.ic-dot.d{background:#22c55e;color:#fff}.ic-dot.p{background:#e5e5e5;color:#999}
        .ic-step-label{font-size:11px;font-weight:500;margin-top:4px}
        .ic-step-line{width:48px;height:2px;margin:0 8px;margin-bottom:18px;border-radius:1px;flex-shrink:0}

        /* ── Dropzone ── */
        .ic-drop{border:2px dashed #d1d5db;border-radius:12px;padding:40px 20px;text-align:center;cursor:pointer;transition:all .25s;background:#fafafa}
        .ic-drop:hover,.ic-drop.ov{border-color:#1a1a2e;background:#f0f0f8}

        /* ── File cards ── */
        .ic-card{background:#fff;border:1px solid #e5e7eb;border-radius:10px;padding:12px 14px;margin-top:8px;display:flex;justify-content:space-between;align-items:center;transition:all .2s;gap:10px}
        .ic-card:hover{border-color:#c5c5d0;box-shadow:0 1px 4px rgba(0,0,0,.04)}
        .ic-card-info{flex:1;min-width:0}
        .ic-card-top{display:flex;align-items:center;gap:6px;flex-wrap:wrap}
        .ic-card-meta{font-size:12px;color:#888;margin-top:5px;display:flex;gap:12px;flex-wrap:wrap}
        .ic-card-thumb{width:44px;height:44px;border-radius:6px;object-fit:cover;flex-shrink:0;background:#f0f0f0}

        /* ── Badges ── */
        .ic-bg{display:inline-flex;align-items:center;gap:4px;font-size:11px;font-weight:500;padding:2px 8px;border-radius:20px}
        .ic-bg-ok{background:#dcfce7;color:#166534}.ic-bg-w{background:#fef3c7;color:#92400e}

        /* ── Buttons ── */
        .ic-b{display:inline-flex;align-items:center;justify-content:center;gap:8px;padding:10px 20px;border-radius:8px;border:none;font-family:'DM Sans',sans-serif;font-size:14px;font-weight:500;cursor:pointer;transition:all .2s;white-space:nowrap}
        .ic-bp{background:#1a1a2e;color:#fff}.ic-bp:hover{background:#2a2a4e}.ic-bp:disabled{background:#ccc;cursor:not-allowed}
        .ic-bs{background:#fff;color:#1a1a2e;border:1px solid #d1d5db}.ic-bs:hover{background:#f5f5f5}
        .ic-bg2{background:transparent;color:#666;padding:8px 12px}.ic-bg2:hover{color:#1a1a2e}
        .ic-bdanger{background:#fff;color:#dc2626;border:1px solid #fca5a5}.ic-bdanger:hover{background:#fef2f2}

        /* ── Form elements ── */
        .ic-chk{display:flex;align-items:flex-start;gap:10px;padding:7px 0;cursor:pointer;font-size:14px}
        .ic-chk input[type="checkbox"]{width:16px;height:16px;accent-color:#1a1a2e;cursor:pointer;margin-top:2px;flex-shrink:0}
        .ic-sel{font-family:'DM Sans',sans-serif;font-size:14px;padding:8px 32px 8px 12px;border:1px solid #d1d5db;border-radius:8px;background:#fff;cursor:pointer;appearance:none;background-image:url("data:image/svg+xml,%3Csvg width='12' height='12' viewBox='0 0 24 24' fill='none'%3E%3Cpath d='M6 9l6 6 6-6' stroke='%23666' stroke-width='2' stroke-linecap='round'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 10px center;width:100%;max-width:400px}
        .ic-sl{width:100%;accent-color:#1a1a2e;cursor:pointer}

        /* ── Accordion sections ── */
        .ic-section{border:1px solid #e5e7eb;border-radius:10px;margin-bottom:10px;overflow:hidden;background:#fff}
        .ic-section-head{width:100%;display:flex;align-items:center;gap:12px;padding:14px 16px;background:none;border:none;cursor:pointer;font-family:'DM Sans',sans-serif;text-align:left}
        .ic-section-head:hover{background:#fafafa}
        .ic-section-title{font-size:14px;font-weight:600;color:#1a1a2e}
        .ic-section-sum{font-size:12px;color:#888;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .ic-section-body{padding:0 16px 16px}

        /* ── Template cards ── */
        .ic-tmpl{border:2px solid #e5e7eb;border-radius:10px;padding:16px;cursor:pointer;transition:all .2s;text-align:center;background:#fff}
        .ic-tmpl:hover{border-color:#c5c5d0;box-shadow:0 2px 8px rgba(0,0,0,.06)}
        .ic-tmpl.sel{border-color:#1a1a2e;background:#f8f8fc}
        .ic-tmpl-icon{width:44px;height:44px;border-radius:10px;display:flex;align-items:center;justify-content:center;margin:0 auto 10px;font-size:20px}

        /* ── Stats ── */
        .ic-st{display:flex;align-items:center;gap:10px;padding:10px 14px;border-radius:10px;background:#f8f8fc;font-size:13px}
        .ic-sti{font-size:16px;flex-shrink:0;width:28px;text-align:center}

        /* ── Progress ── */
        .ic-pb{width:100%;height:4px;background:#e5e5e5;border-radius:4px;overflow:hidden}
        .ic-pf{height:100%;background:#1a1a2e;border-radius:4px;transition:width .3s}

        /* ── Result cards ── */
        .ic-res-card{background:#fff;border:1px solid #e5e7eb;border-radius:10px;padding:14px;display:flex;gap:12px;align-items:center}
        .ic-res-card:hover{border-color:#c5c5d0;box-shadow:0 1px 4px rgba(0,0,0,.04)}
        .ic-res-thumb{width:56px;height:56px;border-radius:8px;object-fit:cover;flex-shrink:0;background:#f0f0f0}

        /* ── Misc ── */
        .ic-m{font-family:'DM Mono',monospace}
        .ic-err{background:#fef2f2;border:1px solid #fecaca;color:#dc2626;padding:10px 14px;border-radius:8px;font-size:13px;margin-top:10px}
        .ic-panel{animation:icIn .35s ease both}
        @keyframes icIn{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
        .ic-foot{display:flex;justify-content:space-between;align-items:center;margin-top:24px;padding-top:18px;border-top:1px solid #f0f0f0;gap:12px}
        .ic-summary{background:#f8f8fc;border-radius:10px;padding:10px 14px;margin-bottom:16px;font-size:13px;color:#666;display:flex;gap:14px;flex-wrap:wrap}

        /* ── Savings bar ── */
        .ic-sbar{height:6px;border-radius:3px;transition:width .5s ease}

        /* ═══ RESPONSIVE ═══ */
        @media (max-width: 640px) {
          .ic-root{padding:0 12px}
          .ic-stepper{margin-bottom:20px}
          .ic-dot{width:24px;height:24px;font-size:11px}
          .ic-step-label{font-size:10px}
          .ic-step-line{width:28px;margin:0 4px;margin-bottom:16px}
          .ic-drop{padding:32px 16px}
          .ic-card{padding:10px 12px}
          .ic-card-meta{gap:8px;font-size:11px}
          .ic-card-thumb{width:36px;height:36px}
          .ic-b{padding:10px 16px;font-size:13px}
          .ic-foot{flex-wrap:wrap}
          .ic-foot .ic-b{flex:1;min-width:0}
          .ic-foot .ic-bg2{flex:0 0 auto}
          .ic-section-head{padding:12px 14px}
          .ic-section-body{padding:0 14px 14px}
          .ic-tmpl{padding:12px}
          .ic-tmpl-icon{width:36px;height:36px;font-size:16px}
          .ic-summary{font-size:12px;gap:8px;padding:8px 12px}
          .ic-sel{max-width:100%;font-size:13px}
          .ic-chk{font-size:13px}
          .ic-st{padding:8px 12px;font-size:12px;gap:8px}
          .ic-sti{font-size:14px;width:24px}
          .ic-res-card{flex-direction:column;text-align:center}
          .ic-res-thumb{width:80px;height:80px}
        }

        @media (max-width: 380px) {
          .ic-step-label{display:none}
          .ic-step-line{width:20px;margin-bottom:0}
          .ic-dot{width:22px;height:22px;font-size:10px}
        }
      `}</style>

      {/* ── Stepper ── */}
      <div className="ic-stepper">
        {STEPS.map((s, i) => (
          <div key={s} style={{ display: "flex", alignItems: "center" }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 0 }}>
              <div className={`ic-dot ${i < stepIdx ? "d" : i === stepIdx ? "a" : "p"}`}>
                {i < stepIdx ? <IcoChk /> : i + 1}
              </div>
              <span className="ic-step-label" style={{ color: i <= stepIdx ? "#1a1a2e" : "#aaa" }}>
                {STEP_LABELS[i]}
              </span>
            </div>
            {i < STEPS.length - 1 && <div className="ic-step-line" style={{ background: i < stepIdx ? "#22c55e" : "#e5e5e5" }} />}
          </div>
        ))}
      </div>

      {/* ═══ STEP 1 — IMPORT ═══ */}
      {step === "import" && (
        <div className="ic-panel" key="import">
          <div
            className={`ic-drop ${dragOver ? "ov" : ""}`}
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={e => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files); }}
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,.avif,.tiff,.tif,.bmp,.svg"
              multiple
              style={{ display: "none" }}
              onChange={e => { handleFiles(e.target.files); e.target.value = ""; }}
            />
            <div style={{ color: "#888", marginBottom: 10, display: "flex", justifyContent: "center" }}><IcoImg /></div>
            <div style={{ fontSize: 15, fontWeight: 500, color: "#444" }}>Glissez-déposez vos images ici</div>
            <div style={{ fontSize: 13, color: "#999", marginTop: 4 }}>ou cliquez pour sélectionner · JPG, PNG, WebP, GIF, AVIF, SVG (max 50 MB)</div>
          </div>

          {error && <div className="ic-err">{error}</div>}

          {files.length > 0 && (
            <div style={{ marginTop: 12 }}>
              {files.map(f => (
                <div key={f.id} className="ic-card">
                  <img src={f.previewUrl} alt="" className="ic-card-thumb" />
                  <div className="ic-card-info">
                    <div className="ic-card-top">
                      <span className="ic-m" style={{ fontWeight: 500, fontSize: 13 }}>{f.name}</span>
                      <span style={{ fontSize: 12, color: "#999" }}>{formatSize(f.size)}</span>
                    </div>
                    <div className="ic-card-meta">
                      {f.dimensions && <span>{f.dimensions.w} × {f.dimensions.h} px</span>}
                      <span>{f.type.split("/")[1]?.toUpperCase()}</span>
                    </div>
                  </div>
                  <button
                    onClick={e => { e.stopPropagation(); removeFile(f.id); }}
                    style={{ background: "none", border: "none", cursor: "pointer", color: "#ccc", padding: 4, flexShrink: 0 }}
                    onMouseEnter={e => e.currentTarget.style.color = "#ef4444"}
                    onMouseLeave={e => e.currentTarget.style.color = "#ccc"}
                  >
                    <IcoX />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="ic-foot" style={{ justifyContent: "flex-end" }}>
            <button className="ic-b ic-bp" disabled={!files.length} onClick={() => { setError(null); setStep("config"); }}>
              Configurer →
            </button>
          </div>
        </div>
      )}

      {/* ═══ STEP 2 — CONFIG ═══ */}
      {step === "config" && (
        <div className="ic-panel" key="config">

          <div className="ic-summary">
            <span><strong>{files.length}</strong> image{files.length > 1 ? "s" : ""}</span>
            <span>{formatSize(totalSize)} au total</span>
            <span>{configSummaryText}</span>
          </div>

          {/* Toggle templates / manual */}
          <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
            <button
              className={`ic-b ${configMode === "templates" ? "ic-bp" : "ic-bs"}`}
              onClick={() => setConfigMode("templates")}
              style={{ flex: 1 }}
            >
              Templates
            </button>
            <button
              className={`ic-b ${configMode === "manual" ? "ic-bp" : "ic-bs"}`}
              onClick={() => setConfigMode("manual")}
              style={{ flex: 1 }}
            >
              Manuel
            </button>
          </div>

          {/* ── Templates mode ── */}
          {configMode === "templates" && (
            <div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 10, marginBottom: 16 }}>
                {Object.entries(TEMPLATES).map(([key, t]) => (
                  <div
                    key={key}
                    className={`ic-tmpl ${selectedTemplate === key ? "sel" : ""}`}
                    onClick={() => applyTemplate(key)}
                  >
                    <div className="ic-tmpl-icon" style={{ background: t.bg }}>{t.icon}</div>
                    <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>{t.label}</div>
                    <div style={{ fontSize: 12, color: "#888", marginBottom: 8 }}>{t.desc}</div>
                    <div style={{ fontSize: 11, color: "#aaa", lineHeight: 1.6 }}>
                      {t.details.map((d, i) => <div key={i}>{d}</div>)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Manual mode ── */}
          {configMode === "manual" && (
            <div>
              {/* Resize */}
              <Section
                title="Redimensionner"
                summary={enableResize ? `${resizePercent}% — proportions conservées` : "Désactivé"}
                defaultOpen={true}
              >
                <label className="ic-chk" style={{ marginBottom: 12 }}>
                  <input type="checkbox" checked={enableResize} onChange={e => setEnableResize(e.target.checked)} />
                  <span style={{ fontWeight: 500 }}>Activer le redimensionnement</span>
                </label>
                <div style={{ opacity: enableResize ? 1 : 0.4, pointerEvents: enableResize ? "auto" : "none" }}>
                  <div style={{ fontSize: 13, color: "#666", marginBottom: 8 }}>
                    Taille : <span className="ic-m" style={{ fontWeight: 500 }}>{resizePercent}%</span>
                  </div>
                  <input type="range" className="ic-sl" min={10} max={200} step={5}
                    value={resizePercent} onChange={e => setResizePercent(Number(e.target.value))} />
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#aaa", marginTop: 4 }}>
                    <span>10%</span><span>100%</span><span>200%</span>
                  </div>
                </div>
              </Section>

              {/* Crop */}
              <Section
                title="Recadrer"
                summary={enableCrop ? `${ASPECT_RATIOS.find(a => a.value === aspectRatio)?.label} — ${CROP_POSITIONS.find(p => p.value === cropPosition)?.label}` : "Désactivé"}
                defaultOpen={true}
              >
                <label className="ic-chk" style={{ marginBottom: 12 }}>
                  <input type="checkbox" checked={enableCrop} onChange={e => setEnableCrop(e.target.checked)} />
                  <span style={{ fontWeight: 500 }}>Activer le recadrage</span>
                </label>
                <div style={{ opacity: enableCrop ? 1 : 0.4, pointerEvents: enableCrop ? "auto" : "none", display: "grid", gap: 12 }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 6 }}>Format</div>
                    <select className="ic-sel" value={aspectRatio} onChange={e => setAspectRatio(e.target.value)}>
                      {ASPECT_RATIOS.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 6 }}>Position</div>
                    <select className="ic-sel" value={cropPosition} onChange={e => setCropPosition(e.target.value)}>
                      {CROP_POSITIONS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                    </select>
                  </div>
                </div>
              </Section>

              {/* Convert */}
              <Section
                title="Convertir & compresser"
                summary={enableConvert ? `${outputFormat.toUpperCase()} — qualité ${quality}%` : "Désactivé"}
                defaultOpen={true}
              >
                <label className="ic-chk" style={{ marginBottom: 12 }}>
                  <input type="checkbox" checked={enableConvert} onChange={e => setEnableConvert(e.target.checked)} />
                  <span style={{ fontWeight: 500 }}>Activer la conversion</span>
                </label>
                <div style={{ opacity: enableConvert ? 1 : 0.4, pointerEvents: enableConvert ? "auto" : "none", display: "grid", gap: 12 }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 6 }}>Format de sortie</div>
                    <select className="ic-sel" value={outputFormat} onChange={e => setOutputFormat(e.target.value)}>
                      {OUTPUT_FORMATS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 6 }}>
                      Qualité : <span className="ic-m">{quality}%</span>
                    </div>
                    <input type="range" className="ic-sl" min={60} max={100} step={5}
                      value={quality} onChange={e => setQuality(Number(e.target.value))} />
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#aaa", marginTop: 4 }}>
                      <span>60%</span><span>80%</span><span>100%</span>
                    </div>
                  </div>
                </div>
              </Section>
            </div>
          )}

          {error && <div className="ic-err">{error}</div>}

          <div className="ic-foot">
            <button className="ic-b ic-bg2" onClick={() => setStep("import")}><IcoLeft /> Retour</button>
            <button
              className="ic-b ic-bp"
              disabled={!hasAction}
              onClick={() => { setStep("processing"); setTimeout(processImages, 100); }}
            >
              Traiter les images →
            </button>
          </div>
        </div>
      )}

      {/* ═══ STEP 3 — PROCESSING ═══ */}
      {step === "processing" && (
        <div className="ic-panel" key="processing">
          <div style={{ textAlign: "center", padding: "20px 0" }}>
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>
              {cancelled ? "Annulé" : progressText}
            </div>
            <div className="ic-pb" style={{ marginBottom: 8 }}>
              <div className="ic-pf" style={{ width: `${progress}%` }} />
            </div>
            <div style={{ fontSize: 12, color: "#888" }}>{progress}%</div>

            {!cancelled && processing && (
              <div style={{ marginTop: 20 }}>
                <button
                  className="ic-b ic-bdanger"
                  onClick={() => { cancelRef.current = true; }}
                >
                  Annuler
                </button>
              </div>
            )}

            {cancelled && (
              <div style={{ marginTop: 20, display: "flex", gap: 8, justifyContent: "center" }}>
                <button className="ic-b ic-bs" onClick={() => setStep("config")}>← Configuration</button>
                <button className="ic-b ic-bp" onClick={reset}>Recommencer</button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══ STEP 4 — RESULTS ═══ */}
      {step === "results" && results && (
        <div className="ic-panel" key="results">
          {/* Stats summary */}
          <div style={{ textAlign: "center", marginBottom: 24 }}>
            <div style={{ width: 52, height: 52, borderRadius: "50%", background: "#dcfce7", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px", fontSize: 24 }}>✓</div>
            <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 4 }}>Traitement terminé !</div>
            <div style={{ fontSize: 13, color: "#888" }}>{configSummaryText}</div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 8, marginBottom: 24 }}>
            <div className="ic-st" style={{ flexDirection: "column", alignItems: "center", textAlign: "center", padding: 14 }}>
              <div style={{ fontSize: 22, fontWeight: 700, color: "#3b82f6" }}>{results.stats.count}</div>
              <div style={{ fontSize: 12, color: "#888" }}>Images traitées</div>
            </div>
            <div className="ic-st" style={{ flexDirection: "column", alignItems: "center", textAlign: "center", padding: 14 }}>
              <div style={{ fontSize: 22, fontWeight: 700, color: "#22c55e" }}>{formatSize(results.stats.saved)}</div>
              <div style={{ fontSize: 12, color: "#888" }}>Économisés</div>
            </div>
            <div className="ic-st" style={{ flexDirection: "column", alignItems: "center", textAlign: "center", padding: 14 }}>
              <div style={{ fontSize: 22, fontWeight: 700, color: "#a855f7" }}>{results.stats.percent}%</div>
              <div style={{ fontSize: 12, color: "#888" }}>Réduction</div>
            </div>
            <div className="ic-st" style={{ flexDirection: "column", alignItems: "center", textAlign: "center", padding: 14 }}>
              <div style={{ fontSize: 22, fontWeight: 700, color: "#f97316" }}>{results.stats.co2}g</div>
              <div style={{ fontSize: 12, color: "#888" }}>CO₂ économisé</div>
            </div>
          </div>

          {/* Individual results */}
          <div style={{ display: "grid", gap: 8, marginBottom: 20 }}>
            {results.files.map((item) => (
              <div key={item.id} className="ic-res-card">
                <img src={item.previewUrl} alt="" className="ic-res-thumb" />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="ic-card-top">
                    <span className="ic-m" style={{ fontWeight: 500, fontSize: 13 }}>{item.name}</span>
                  </div>
                  <div className="ic-card-meta" style={{ marginTop: 4 }}>
                    <span>{formatSize(item.originalSize)} → {formatSize(item.newSize)}</span>
                    <span>{item.originalDims.w}×{item.originalDims.h} → {item.newDims.w}×{item.newDims.h}</span>
                    {item.newSize < item.originalSize && (
                      <span className="ic-bg ic-bg-ok">
                        −{Math.round((1 - item.newSize / item.originalSize) * 100)}%
                      </span>
                    )}
                    {item.newSize >= item.originalSize && (
                      <span className="ic-bg ic-bg-w">+{Math.round(((item.newSize / item.originalSize) - 1) * 100)}%</span>
                    )}
                  </div>
                </div>
                <button className="ic-b ic-bs" style={{ padding: "6px 12px", fontSize: 12 }} onClick={() => downloadSingle(item)}>
                  <IcoDl />
                </button>
              </div>
            ))}
          </div>

          {results.errors.length > 0 && (
            <div className="ic-err" style={{ marginBottom: 16 }}>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>Erreurs rencontrées :</div>
              {results.errors.map((e, i) => <div key={i}>• {e.name} : {e.error}</div>)}
            </div>
          )}

          <div className="ic-foot">
            <button className="ic-b ic-bg2" onClick={() => setStep("config")}><IcoLeft /> Modifier</button>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button className="ic-b ic-bs" onClick={downloadReport}>Rapport</button>
              <button className="ic-b ic-bp" onClick={downloadAll}><IcoDl /> Tout télécharger</button>
            </div>
          </div>

          <div style={{ textAlign: "center", marginTop: 16 }}>
            <button className="ic-b ic-bs" onClick={reset}>Traiter d'autres images</button>
          </div>
        </div>
      )}
    </div>
  );
}
