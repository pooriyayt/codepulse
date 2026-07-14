"use strict";

/**
 * Knowledge Graph tab - renders code knowledge graphs such as Graphify's
 * graphify-out/graph.json (nodes = code concepts, edges = relationships).
 */

window.KnowledgePanel = (function () {
  const { esc, cssVar, fmt } = window.Dashboard;
  let network = null;
  let data = null;
  let communityIndex = new Map();
  let usingFull = false;

  const PALETTE = [
    "#4fc1c9", "#5e9fe8", "#72bc8f", "#de9255", "#c26fc7", "#e97366",
    "#a78bfa", "#d8b455", "#e86bb3", "#8b9dc3", "#66b8d8", "#6bbf8a",
  ];

  const LARGE_GRAPH_WARN_NODES = 1500;

  function t(key, fallback) {
    return window.I18N ? window.I18N.t(key) : fallback;
  }

  function communityColor(community) {
    if (community == null || community === "") return cssVar("--text-faint");
    const key = String(community);
    if (!communityIndex.has(key)) communityIndex.set(key, communityIndex.size);
    return PALETTE[communityIndex.get(key) % PALETTE.length];
  }

  function activeNodes() {
    return usingFull && Array.isArray(data.allNodes) ? data.allNodes : data.nodes;
  }
  function activeEdges() {
    return usingFull && Array.isArray(data.allEdges) ? data.allEdges : data.edges;
  }

  function renderChips() {
    const s = data.stats;
    const c = s.confidence || {};
    const chips = [
      { label: "Nodes", value: s.nodeCount },
      { label: "Edges", value: s.edgeCount },
      { label: "Communities", value: s.communityCount },
      { label: "Extracted", value: c.EXTRACTED },
      { label: "Inferred", value: c.INFERRED },
      { label: "Ambiguous", value: c.AMBIGUOUS },
    ].filter((x) => x.value > 0);
    document.getElementById("kgChips").innerHTML = chips
      .map((x) => `<span class="kg-chip"><strong>${fmt(x.value)}</strong>${esc(x.label)}</span>`)
      .join("");
    document.getElementById("kgSources").textContent = `Loaded from ${data.sourcePath}`;

    updateNotice();
  }

  function updateNotice() {
    const notice = document.getElementById("kgNotice");
    const loadFullBtn = document.getElementById("kgLoadFullBtn");

    if (usingFull) {
      const shown = activeNodes().length;
      const full = Array.isArray(data.allNodes) ? data.allNodes.length : shown;
      if (data.fullAvailable === false) {
        notice.textContent = `${t("kg.loadFullActive", "Showing full graph")}: ${fmt(shown)} of ${fmt(data.stats.nodeCount)} nodes (safety limit reached).`;
      } else {
        notice.textContent = `${t("kg.loadFullActive", "Showing full graph")}: ${fmt(full)} nodes.`;
      }
      notice.hidden = false;
      if (loadFullBtn) {
        loadFullBtn.hidden = false;
        loadFullBtn.innerHTML = `<i class="fa-solid fa-compress"></i>&nbsp;<span>${esc(t("kg.showTopOnly", "Show top nodes only"))}</span>`;
      }
    } else if (data.truncated) {
      notice.textContent = `Large graph: showing the ${fmt(data.nodes.length)} most connected of ${fmt(data.stats.nodeCount)} nodes.`;
      notice.hidden = false;
      if (loadFullBtn) {
        loadFullBtn.hidden = false;
        loadFullBtn.innerHTML = `<i class="fa-solid fa-maximize"></i>&nbsp;<span>${esc(t("kg.loadFull", "Load full graph"))}</span>`;
      }
    } else {
      notice.hidden = true;
      if (loadFullBtn) loadFullBtn.hidden = true;
    }
  }

  function renderGraph() {
    const container = document.getElementById("kgGraph");
    const details = document.getElementById("kgNodeDetails");
    details.hidden = true;
    if (network) {
      network.destroy();
      network = null;
    }
    container.innerHTML = "";

    const nodeList = activeNodes();
    const edgeList = activeEdges();

    const nodes = new vis.DataSet(
      nodeList.map((n) => {
        const color = communityColor(n.community);
        const tooltip = [n.type, `${fmt(n.degree)} connections`, n.community != null ? `community ${n.community}` : null]
          .filter(Boolean)
          .join(" \u00b7 ");
        return {
          id: n.id,
          label: n.label.length > 26 ? `${n.label.slice(0, 24)}\u2026` : n.label,
          title: tooltip,
          shape: "dot",
          size: Math.min(6 + Math.sqrt(n.degree || 1) * 2.2, 26),
          color: { background: color, border: color, highlight: { background: color, border: cssVar("--text") } },
          font: { color: cssVar("--text-secondary"), size: 11 },
        };
      })
    );

    const edges = new vis.DataSet(
      edgeList.map((e, i) => ({
        id: i,
        from: e.from,
        to: e.to,
        dashes: e.confidence === "INFERRED" || e.confidence === "AMBIGUOUS",
        color: {
          color: e.confidence === "AMBIGUOUS" ? "rgba(222, 146, 85, 0.5)" : "rgba(128, 128, 128, 0.28)",
          highlight: cssVar("--kg"),
        },
        arrows: { to: { enabled: true, scaleFactor: 0.35 } },
      }))
    );

    const isLarge = nodeList.length > LARGE_GRAPH_WARN_NODES;

    network = new vis.Network(container, { nodes, edges }, {
      edges: { smooth: { enabled: !isLarge, type: "continuous", roundness: 0.35 }, width: 1 },
      physics: {
        solver: "forceAtlas2Based",
        forceAtlas2Based: { gravitationalConstant: -42, springLength: 110, springConstant: 0.04 },
        stabilization: { iterations: isLarge ? 90 : 180, fit: true },
      },
      interaction: { hover: true, tooltipDelay: 120 },
    });

    // For large / full graphs, turn physics off once the layout settles so
    // panning and zooming stay smooth instead of continuously re-simulating.
    network.once("stabilizationIterationsDone", () => {
      if (network) network.setOptions({ physics: false });
    });

    network.on("click", (params) => {
      if (!params.nodes.length) {
        details.hidden = true;
        return;
      }
      const node = nodeList.find((n) => n.id === params.nodes[0]);
      if (!node) return;
      const edgeCount = edgeList.filter((e) => e.from === node.id || e.to === node.id).length;
      details.innerHTML = `
        <h3>${esc(node.label)}${node.type ? ` <span class="pill pill-kg">${esc(String(node.type))}</span>` : ""}</h3>
        <p>${fmt(node.degree)} connections${node.community != null ? ` \u00b7 community ${esc(String(node.community))}` : ""}${node.source ? ` \u00b7 ${esc(String(node.source))}` : ""}</p>
        <p>${fmt(edgeCount)} edge${edgeCount === 1 ? "" : "s"} shown in this view</p>`;
      details.hidden = false;
    });
  }

  function renderBars(elementId, rows, emptyText) {
    const el = document.getElementById(elementId);
    if (!rows.length) {
      el.innerHTML = `<div class="empty-state">${esc(emptyText)}</div>`;
      return;
    }
    const max = rows[0].value || 1;
    el.innerHTML = rows
      .map(
        (row) => `<div class="dep-row">
          <span class="dep-name">${esc(row.name)}${row.pill ? ` <span class="pill pill-kg">${esc(row.pill)}</span>` : ""}</span>
          <span class="dep-bar-wrap"><span class="dep-bar" style="width:${Math.max(4, Math.round((row.value / max) * 100))}%;background:var(--kg)"></span></span>
          <span class="dep-count">${fmt(row.value)}</span>
        </div>`
      )
      .join("");
  }

  async function toggleFull() {
    if (!data) return;
    if (!usingFull) {
      const nodeCount = Array.isArray(data.allNodes) ? data.allNodes.length : data.nodes.length;
      if (nodeCount > LARGE_GRAPH_WARN_NODES) {
        const confirmFn = window.AppConfirm;
        let proceed = true;
        if (typeof confirmFn === "function") {
          proceed = await confirmFn({
            title: t("kg.confirmFullTitle", "Load the full graph?"),
            message: t("kg.confirmFullMessage", "This graph has many nodes. Rendering all of them may take a moment and feel slower to pan/zoom."),
            confirmLabel: t("kg.confirmFullOk", "Load full graph"),
            cancelLabel: t("kg.confirmFullCancel", "Cancel"),
          });
        }
        if (!proceed) return;
      }
      usingFull = true;
    } else {
      usingFull = false;
    }
    updateNotice();
    renderGraph();
  }

  function wireToolbar() {
    const loadFullBtn = document.getElementById("kgLoadFullBtn");
    const exportBtn = document.getElementById("kgExportBtn");
    if (loadFullBtn && !loadFullBtn.dataset.wired) {
      loadFullBtn.dataset.wired = "1";
      loadFullBtn.addEventListener("click", toggleFull);
    }
    if (exportBtn && !exportBtn.dataset.wired) {
      exportBtn.dataset.wired = "1";
      exportBtn.addEventListener("click", exportGraphImage);
    }
  }

  function hexToRgba(hex, alpha) {
    if (!hex) return `rgba(0,0,0,${alpha})`;
    const clean = String(hex).trim();
    if (clean.startsWith("rgba") || clean.startsWith("rgb")) return clean;
    const hexClean = clean.replace("#", "");
    if (!/^[0-9a-fA-F]{3,6}$/.test(hexClean)) return clean;
    const bigint = parseInt(hexClean.length === 3 ? hexClean.split("").map((c) => c + c).join("") : hexClean, 16);
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

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
  }

  async function exportGraphImage() {
    if (!network || !data) return;
    const rawCanvas =
      (network.canvas && network.canvas.frame && network.canvas.frame.canvas) ||
      document.querySelector("#kgGraph canvas");
    if (!rawCanvas) return;

    const W = 1280, H = 900;
    const out = document.createElement("canvas");
    out.width = W * 2;
    out.height = H * 2;
    const ctx = out.getContext("2d");
    ctx.setTransform(2, 0, 0, 2, 0, 0);

    const lang = window.I18N ? window.I18N.current() : "en";
    const fontStack = lang === "fa"
      ? "'Vazirmatn', -apple-system, 'Segoe UI', sans-serif"
      : "-apple-system, 'Segoe UI', Roboto, Arial, sans-serif";

    const bg = cssVar("--canvas") || "#191919";
    const surface = cssVar("--surface") || "#202020";
    const text = cssVar("--text") || "#ffffff";
    const textSecondary = cssVar("--text-secondary") || "rgba(255,255,255,0.65)";
    const textFaint = cssVar("--text-faint") || "rgba(255,255,255,0.45)";
    const kg = cssVar("--kg") || "#4fc1c9";
    const accent = cssVar("--accent") || "#5e9fe8";

    // ---- background ----
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    const glow = ctx.createRadialGradient(120, 40, 10, 120, 40, 480);
    glow.addColorStop(0, hexToRgba(kg, 0.16));
    glow.addColorStop(1, "transparent");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, H);

    roundRect(ctx, 14, 14, W - 28, H - 28, 24);
    ctx.fillStyle = hexToRgba(surface, 0.4);
    ctx.fill();
    ctx.strokeStyle = hexToRgba(text, 0.08);
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // ---- header ----
    ctx.beginPath();
    ctx.arc(66, 62, 20, 0, Math.PI * 2);
    ctx.fillStyle = hexToRgba(kg, 0.16);
    ctx.fill();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "19px sans-serif";
    ctx.fillStyle = kg;
    ctx.fillText("\u25C8", 66, 64);

    ctx.textAlign = "left";
    ctx.font = `700 24px ${fontStack}`;
    ctx.fillStyle = text;
    ctx.fillText(t("kg.exportSummary", "Knowledge graph snapshot"), 98, 54);

    ctx.font = `400 13px ${fontStack}`;
    ctx.fillStyle = textSecondary;
    ctx.fillText(String(data.sourcePath || ""), 98, 76);

    const dateStr = new Date().toLocaleDateString(lang === "fa" ? "fa-IR" : "en-US", { year: "numeric", month: "short", day: "numeric" });
    ctx.textAlign = "right";
    ctx.font = `400 13px ${fontStack}`;
    ctx.fillStyle = textFaint;
    ctx.fillText(dateStr, W - 46, 54);

    // ---- stats summary strip ----
    const s = data.stats || {};
    const stats = [
      { label: "Nodes", value: s.nodeCount || 0 },
      { label: "Edges", value: s.edgeCount || 0 },
      { label: "Communities", value: s.communityCount || 0 },
      { label: "Extracted", value: (s.confidence && s.confidence.EXTRACTED) || 0 },
      { label: "Inferred", value: (s.confidence && s.confidence.INFERRED) || 0 },
    ];
    const chipY = 100;
    let chipX = 40;
    ctx.font = `600 13px ${fontStack}`;
    stats.forEach((stat) => {
      const label = `${stat.value.toLocaleString("en-US")} ${stat.label}`;
      const w = ctx.measureText(label).width + 30;
      roundRect(ctx, chipX, chipY, w, 32, 16);
      ctx.fillStyle = hexToRgba(kg, 0.12);
      ctx.fill();
      ctx.strokeStyle = hexToRgba(kg, 0.32);
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = kg;
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(label, chipX + 15, chipY + 16);
      chipX += w + 10;
    });

    // ---- embedded graph snapshot ----
    const frameX = 40, frameY = 148, frameW = W - 80, frameH = H - 148 - 130;
    roundRect(ctx, frameX, frameY, frameW, frameH, 18);
    ctx.fillStyle = hexToRgba(bg, 0.5);
    ctx.fill();
    ctx.strokeStyle = hexToRgba(text, 0.08);
    ctx.lineWidth = 1;
    ctx.stroke();

    try {
      const graphDataUrl = rawCanvas.toDataURL("image/png");
      const img = await loadImage(graphDataUrl);
      const pad = 10;
      const availW = frameW - pad * 2;
      const availH = frameH - pad * 2;
      const scale = Math.min(availW / img.width, availH / img.height);
      const drawW = img.width * scale;
      const drawH = img.height * scale;
      const dx = frameX + (frameW - drawW) / 2;
      const dy = frameY + (frameH - drawH) / 2;
      ctx.save();
      roundRect(ctx, frameX, frameY, frameW, frameH, 18);
      ctx.clip();
      ctx.drawImage(img, dx, dy, drawW, drawH);
      ctx.restore();
    } catch (_err) {
      ctx.textAlign = "center";
      ctx.font = `400 15px ${fontStack}`;
      ctx.fillStyle = textFaint;
      ctx.fillText("Graph preview unavailable", frameX + frameW / 2, frameY + frameH / 2);
    }

    // ---- top god nodes summary ----
    const godY = frameY + frameH + 34;
    ctx.textAlign = "left";
    ctx.font = `700 15px ${fontStack}`;
    ctx.fillStyle = text;
    ctx.fillText(t("kg.god", "God nodes"), 40, godY);

    const topGod = (data.godNodes || []).slice(0, 5);
    let gx = 40;
    const gy = godY + 26;
    ctx.font = `600 12.5px ${fontStack}`;
    topGod.forEach((n) => {
      const label = n.label.length > 22 ? `${n.label.slice(0, 20)}\u2026` : n.label;
      const full = `${label}  \u00b7 ${n.degree}`;
      const w = ctx.measureText(full).width + 26;
      roundRect(ctx, gx, gy, w, 30, 15);
      ctx.fillStyle = hexToRgba(accent, 0.1);
      ctx.fill();
      ctx.strokeStyle = hexToRgba(accent, 0.28);
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = accent;
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(full, gx + 13, gy + 15);
      gx += w + 10;
      if (gx > W - 200) { gx = 40; }
    });

    // ---- footer ----
    const footerY = H - 40;
    ctx.strokeStyle = hexToRgba(text, 0.08);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(40, footerY - 16);
    ctx.lineTo(W - 40, footerY - 16);
    ctx.stroke();

    ctx.textAlign = "left";
    ctx.font = `600 13px ${fontStack}`;
    ctx.fillStyle = accent;
    ctx.fillText("pouriyaparniyan.ir", 40, footerY);

    ctx.textAlign = "right";
    ctx.font = `400 12px ${fontStack}`;
    ctx.fillStyle = textFaint;
    ctx.fillText("CodePulse \u2014 Knowledge Graph", W - 40, footerY);

    const link = document.createElement("a");
    const safeSource = String((data.sourcePath || "knowledge-graph")).replace(/[^a-z0-9-_]+/gi, "-").replace(/^-+|-+$/g, "") || "knowledge-graph";
    link.download = `${safeSource}-graph-snapshot.png`;
    link.href = out.toDataURL("image/png");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  function render(kg) {
    data = kg;
    usingFull = false;
    communityIndex = new Map();
    wireToolbar();
    renderChips();
    renderGraph();
    renderBars(
      "kgGodNodes",
      data.godNodes.map((n) => ({ name: n.label, pill: n.type, value: n.degree })),
      "No nodes found."
    );
    renderBars(
      "kgRelations",
      data.relations.map((r) => ({ name: r.name, value: r.total })),
      "No relation labels in this graph."
    );
    const exportBtn = document.getElementById("kgExportBtn");
    if (exportBtn) exportBtn.hidden = false;
  }

  function refreshTheme() {
    if (data) render(data);
  }

  return { render, refreshTheme };
})();
