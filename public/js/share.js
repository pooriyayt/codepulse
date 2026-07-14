"use strict";

/**
 * Share panel: renders a themed Canvas 2D "share card" summarizing the
 * current report and lets the user pick a theme and download a PNG.
 * Pure client-side canvas drawing, no server round-trip, no dependencies.
 */

window.SharePanel = (function () {
  const CARD_W = 1200;
  const CARD_H = 675;
  const SCALE = 2; // render at 2x for crisp downloads

  const PALETTE = {
    dark: {
      bg: "#191919", surface: "#202020", text: "#ffffff",
      textSecondary: "rgba(255,255,255,0.65)", textFaint: "rgba(255,255,255,0.45)",
      accent: "#5e9fe8", accentSoft: "rgba(94,159,232,0.16)",
      green: "#72bc8f", orange: "#de9255", red: "#e97366",
      gql: "#e10098", kg: "#4fc1c9",
    },
    light: {
      bg: "#ffffff", surface: "#f9f8f7", text: "#2c2c2b",
      textSecondary: "#7d7a75", textFaint: "#a5a29c",
      accent: "#2783de", accentSoft: "rgba(39,131,222,0.10)",
      green: "#46a171", orange: "#d5803b", red: "#e56458",
      gql: "#e10098", kg: "#148d96",
    },
    midnight: {
      bg: "#0f0d1d", surface: "#171430", text: "#ffffff",
      textSecondary: "rgba(255,255,255,0.65)", textFaint: "rgba(255,255,255,0.45)",
      accent: "#8b7cf8", accentSoft: "rgba(139,124,248,0.18)",
      green: "#72bc8f", orange: "#de9255", red: "#e97366",
      gql: "#e10098", kg: "#4fc1c9",
    },
    ocean: {
      bg: "#081820", surface: "#0e222c", text: "#ffffff",
      textSecondary: "rgba(255,255,255,0.65)", textFaint: "rgba(255,255,255,0.45)",
      accent: "#2dd4bf", accentSoft: "rgba(45,212,191,0.16)",
      green: "#72bc8f", orange: "#de9255", red: "#e97366",
      gql: "#e10098", kg: "#4fc1c9",
    },
    sunset: {
      bg: "#1c1210", surface: "#261915", text: "#ffffff",
      textSecondary: "rgba(255,255,255,0.65)", textFaint: "rgba(255,255,255,0.45)",
      accent: "#f59e0b", accentSoft: "rgba(245,158,11,0.18)",
      green: "#72bc8f", orange: "#de9255", red: "#e97366",
      gql: "#e10098", kg: "#4fc1c9",
    },
    nord: {
      bg: "#2e3440", surface: "#3b4252", text: "#eceff4",
      textSecondary: "rgba(236,239,244,0.65)", textFaint: "rgba(236,239,244,0.45)",
      accent: "#88c0d0", accentSoft: "rgba(136,192,208,0.18)",
      green: "#a3be8c", orange: "#d08770", red: "#bf616a",
      gql: "#e10098", kg: "#8fbcbb",
    },
    dracula: {
      bg: "#282a36", surface: "#343746", text: "#f8f8f2",
      textSecondary: "rgba(248,248,242,0.65)", textFaint: "rgba(248,248,242,0.45)",
      accent: "#bd93f9", accentSoft: "rgba(189,147,249,0.18)",
      green: "#50fa7b", orange: "#ffb86c", red: "#ff5555",
      gql: "#ff79c6", kg: "#8be9fd",
    },
    solarized: {
      bg: "#002b36", surface: "#073642", text: "#eee8d5",
      textSecondary: "rgba(238,232,213,0.65)", textFaint: "rgba(238,232,213,0.45)",
      accent: "#2aa198", accentSoft: "rgba(42,161,152,0.18)",
      green: "#859900", orange: "#cb4b16", red: "#dc322f",
      gql: "#d33682", kg: "#268bd2",
    },
    glass: {
      bg: "#eef1f6", surface: "#ffffff", text: "#1c1c1e",
      textSecondary: "rgba(28,28,30,0.62)", textFaint: "rgba(28,28,30,0.42)",
      accent: "#0a84ff", accentSoft: "rgba(10,132,255,0.14)",
      green: "#30d158", orange: "#ff9f0a", red: "#ff375f",
      gql: "#e10098", kg: "#00b8a9",
    },
  };

  let modal, canvas, ctx, closeBtn, backBtn, downloadBtn, swatchWrap;
  let currentReport = null;
  let selectedTheme = "dark";
  let wired = false;

  function $(id) { return document.getElementById(id); }
  function t(key, fallback) { return window.I18N ? window.I18N.t(key) : fallback; }

  function hexToRgba(hex, alpha) {
    if (!hex) return `rgba(0,0,0,${alpha})`;
    if (hex.startsWith("rgba") || hex.startsWith("rgb")) return hex;
    const clean = hex.replace("#", "");
    const bigint = parseInt(clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean, 16);
    const r = (bigint >> 16) & 255;
    const g = (bigint >> 8) & 255;
    const b = bigint & 255;
    return `rgba(${r},${g},${b},${alpha})`;
  }

  function roundRect(c, x, y, w, h, radius) {
    const r = Math.min(radius, w / 2, h / 2);
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }

  function gradeInfo(score) {
    const g = score && score.grade;
    if (g === "healthy") return { key: "share.healthy", fallback: "Healthy", color: "green" };
    if (g === "warning") return { key: "share.warning", fallback: "Needs attention", color: "orange" };
    return { key: "share.critical", fallback: "Critical", color: "red" };
  }

  function ensureWired() {
    if (wired) return;
    modal = $("shareModal");
    canvas = $("shareCanvas");
    if (!modal || !canvas) return;
    ctx = canvas.getContext("2d");
    closeBtn = $("shareCloseBtn");
    backBtn = $("shareBackdrop");
    downloadBtn = $("shareDownloadBtn");
    swatchWrap = $("shareThemeSwatches");

    if (closeBtn) closeBtn.addEventListener("click", close);
    if (backBtn) backBtn.addEventListener("click", close);
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && modal && !modal.hidden) close();
    });
    if (downloadBtn) downloadBtn.addEventListener("click", download);
    if (swatchWrap) {
      swatchWrap.querySelectorAll(".share-swatch").forEach((btn) => {
        btn.addEventListener("click", () => {
          selectedTheme = btn.dataset.shareTheme || "dark";
          swatchWrap.querySelectorAll(".share-swatch").forEach((b) => b.classList.toggle("active", b === btn));
          draw();
        });
      });
    }
    wired = true;
  }

  function close() {
    if (modal) modal.hidden = true;
  }

  async function open(report) {
    ensureWired();
    if (!modal || !canvas) return;
    currentReport = report || currentReport;
    if (!currentReport) return;

    let initial = "dark";
    try { initial = document.documentElement.dataset.theme || "dark"; } catch (_err) { /* ignore */ }
    if (!PALETTE[initial]) initial = "dark";
    selectedTheme = initial;
    if (swatchWrap) {
      swatchWrap.querySelectorAll(".share-swatch").forEach((b) => b.classList.toggle("active", b.dataset.shareTheme === selectedTheme));
    }

    modal.hidden = false;
    await draw();
  }

  async function draw() {
    if (!ctx || !currentReport) return;
    const palette = PALETTE[selectedTheme] || PALETTE.dark;

    canvas.width = CARD_W * SCALE;
    canvas.height = CARD_H * SCALE;
    canvas.style.width = "100%";
    canvas.style.aspectRatio = `${CARD_W} / ${CARD_H}`;
    ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0);
    ctx.clearRect(0, 0, CARD_W, CARD_H);

    try { if (document.fonts && document.fonts.ready) await document.fonts.ready; } catch (_err) { /* ignore */ }

    const lang = window.I18N ? window.I18N.current() : "en";
    const fontStack = lang === "fa"
      ? "'Vazirmatn', -apple-system, 'Segoe UI', sans-serif"
      : "-apple-system, 'Segoe UI', Roboto, Arial, sans-serif";

    // ---- background ----
    ctx.fillStyle = palette.bg;
    ctx.fillRect(0, 0, CARD_W, CARD_H);

    const glow1 = ctx.createRadialGradient(140, 30, 10, 140, 30, 460);
    glow1.addColorStop(0, palette.accentSoft);
    glow1.addColorStop(1, "transparent");
    ctx.fillStyle = glow1;
    ctx.fillRect(0, 0, CARD_W, CARD_H);

    const glow2 = ctx.createRadialGradient(CARD_W - 80, CARD_H - 40, 10, CARD_W - 80, CARD_H - 40, 420);
    glow2.addColorStop(0, hexToRgba(palette.kg, 0.14));
    glow2.addColorStop(1, "transparent");
    ctx.fillStyle = glow2;
    ctx.fillRect(0, 0, CARD_W, CARD_H);

    // outer glass frame
    roundRect(ctx, 14, 14, CARD_W - 28, CARD_H - 28, 26);
    ctx.fillStyle = hexToRgba(palette.surface, 0.28);
    ctx.fill();
    ctx.strokeStyle = hexToRgba(palette.text, 0.10);
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.textBaseline = "middle";

    // ---- header ----
    ctx.beginPath();
    ctx.arc(66, 66, 21, 0, Math.PI * 2);
    ctx.fillStyle = palette.accentSoft;
    ctx.fill();
    ctx.font = "20px sans-serif";
    ctx.fillStyle = palette.accent;
    ctx.textAlign = "center";
    ctx.fillText("\u2764", 66, 68);

    ctx.textAlign = "left";
    ctx.font = `700 25px ${fontStack}`;
    ctx.fillStyle = palette.text;
    ctx.fillText(t("brand", "CodePulse"), 100, 58);

    ctx.font = `400 14px ${fontStack}`;
    ctx.fillStyle = palette.textSecondary;
    const projectName = (currentReport.meta && currentReport.meta.name) || "project";
    ctx.fillText(projectName, 100, 82);

    const dateStr = new Date().toLocaleDateString(lang === "fa" ? "fa-IR" : "en-US", { year: "numeric", month: "short", day: "numeric" });
    ctx.font = `400 13px ${fontStack}`;
    ctx.textAlign = "right";
    ctx.fillStyle = palette.textFaint;
    ctx.fillText(dateStr, CARD_W - 52, 66);

    // ---- score ring ----
    const cx = 200, cy = 260, r = 96;
    const summary = currentReport.summary || {};
    const score = currentReport.score || { total: 0, grade: "critical" };
    const g = gradeInfo(score);
    const ringColor = palette[g.color] || palette.accent;

    ctx.lineWidth = 16;
    ctx.lineCap = "round";
    ctx.strokeStyle = hexToRgba(palette.text, 0.10);
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();

    const pct = Math.max(0, Math.min(100, score.total || 0)) / 100;
    ctx.strokeStyle = ringColor;
    ctx.beginPath();
    ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.max(pct, 0.012) * Math.PI * 2);
    ctx.stroke();
    ctx.lineCap = "butt";

    ctx.textAlign = "center";
    ctx.font = `800 56px ${fontStack}`;
    ctx.fillStyle = palette.text;
    ctx.fillText(String(Math.round(score.total || 0)), cx, cy - 6);
    ctx.font = `600 15px ${fontStack}`;
    ctx.fillStyle = palette.textFaint;
    ctx.fillText("/ 100", cx, cy + 26);

    ctx.font = `700 18px ${fontStack}`;
    ctx.fillStyle = ringColor;
    ctx.fillText(t(g.key, g.fallback), cx, cy + r + 38);

    ctx.font = `400 13px ${fontStack}`;
    ctx.fillStyle = palette.textSecondary;
    ctx.fillText(t("share.scoreCaption", "Overall health score"), cx, cy + r + 62);

    // ---- stats grid ----
    const stats = [
      { label: t("share.stat.files", "Files"), value: summary.fileCount || 0, color: palette.accent },
      { label: t("share.stat.functions", "Functions"), value: summary.functionCount || 0, color: palette.accent },
      { label: t("share.stat.avgcc", "Avg complexity"), value: summary.avgComplexity || 0, color: palette.accent },
      { label: t("share.stat.maxcc", "Max complexity"), value: summary.maxComplexity || 0, color: (summary.maxComplexity || 0) > 10 ? palette.red : palette.accent },
      { label: t("share.stat.dup", "Duplication"), value: `${summary.duplicationPercentage || 0}%`, color: (summary.duplicationPercentage || 0) > 15 ? palette.orange : palette.accent },
      { label: t("share.stat.cycles", "Dep. cycles"), value: summary.cycleCount || 0, color: (summary.cycleCount || 0) > 0 ? palette.red : palette.green },
    ];

    const gridX = 420, gridY = 138, colW = 244, rowH = 92, gap = 12;
    stats.forEach((stat, i) => {
      const col = i % 3;
      const row = Math.floor(i / 3);
      const x = gridX + col * (colW + gap);
      const y = gridY + row * (rowH + gap);

      roundRect(ctx, x, y, colW, rowH, 16);
      ctx.fillStyle = hexToRgba(palette.surface, 0.55);
      ctx.fill();
      ctx.strokeStyle = hexToRgba(palette.text, 0.08);
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(x + 22, y + 24, 5, 0, Math.PI * 2);
      ctx.fillStyle = stat.color;
      ctx.fill();

      ctx.textAlign = "left";
      ctx.font = `600 13px ${fontStack}`;
      ctx.fillStyle = palette.textSecondary;
      ctx.fillText(stat.label, x + 36, y + 24);

      ctx.font = `800 30px ${fontStack}`;
      ctx.fillStyle = palette.text;
      ctx.fillText(String(stat.value), x + 20, y + 62);
    });

    // ---- feature badges ----
    const badges = [];
    if (summary.graphqlDetected) badges.push({ label: t("share.badge.gql", "GraphQL detected"), color: palette.gql });
    if (summary.knowledgeGraphDetected) badges.push({ label: t("share.badge.kg", "Knowledge graph detected"), color: palette.kg });

    let bx = gridX;
    const by = gridY + 2 * (rowH + gap) + 6;
    ctx.font = `600 13px ${fontStack}`;
    badges.forEach((badge) => {
      const textWidth = ctx.measureText(badge.label).width;
      const pillW = textWidth + 40;
      roundRect(ctx, bx, by, pillW, 34, 17);
      ctx.fillStyle = hexToRgba(badge.color, 0.16);
      ctx.fill();
      ctx.strokeStyle = hexToRgba(badge.color, 0.4);
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(bx + 16, by + 17, 4, 0, Math.PI * 2);
      ctx.fillStyle = badge.color;
      ctx.fill();

      ctx.textAlign = "left";
      ctx.fillStyle = badge.color;
      ctx.fillText(badge.label, bx + 28, by + 18);

      bx += pillW + 12;
    });

    // ---- footer ----
    const footerY = CARD_H - 46;
    ctx.strokeStyle = hexToRgba(palette.text, 0.08);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(40, footerY - 18);
    ctx.lineTo(CARD_W - 40, footerY - 18);
    ctx.stroke();

    ctx.textAlign = "left";
    ctx.font = `600 13px ${fontStack}`;
    ctx.fillStyle = palette.accent;
    ctx.fillText("pouriyaparniyan.ir", 40, footerY);

    ctx.textAlign = "right";
    ctx.font = `400 12px ${fontStack}`;
    ctx.fillStyle = palette.textFaint;
    ctx.fillText(t("share.footerNote", "Static analysis snapshot \u2014 no AI, no external APIs"), CARD_W - 40, footerY);
  }

  function download() {
    if (!canvas) return;
    const projectName = (currentReport && currentReport.meta && currentReport.meta.name) || "project";
    const safeName = String(projectName).replace(/[^a-z0-9-_]+/gi, "-").replace(/^-+|-+$/g, "") || "project";
    const link = document.createElement("a");
    link.download = `codepulse-${safeName}-${selectedTheme}.png`;
    link.href = canvas.toDataURL("image/png");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  return { open, close, draw };
})();
