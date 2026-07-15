"use strict";

/**
 * Dashboard rendering: overview, files table, dependency graph, duplicates.
 * Vanilla JS - no frameworks. Chart.js + vis-network are loaded via CDN.
 */

window.Dashboard = (function () {
  let report = null;
  let histogramChart = null;
  let depNetwork = null;
  let filesSort = { key: "riskyFunctions", dir: "desc" };
  let filesFilter = "";

  // ---------- helpers ----------

  function esc(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function cssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  function fmt(n) {
    return Number(n).toLocaleString("en-US");
  }

  function baseName(p) {
    const idx = p.lastIndexOf("/");
    return idx === -1 ? p : p.slice(idx + 1);
  }

  const LANG_LABELS = {
    javascript: "JS", typescript: "TS", python: "PY", php: "PHP", html: "HTML", css: "CSS",
    go: "GO", rust: "RS", java: "JAVA", c: "C", cpp: "C++", csharp: "C#",
    kotlin: "KT", swift: "SWIFT", ruby: "RB", sql: "SQL",
  };

  function langBadge(language) {
    const label = LANG_LABELS[language] || (language || "").toUpperCase();
    return `<span class="pill pill-lang">${esc(label)}</span>`;
  }

  // ---------- overview ----------

  function renderScore() {
    const { score } = report;
    const ring = document.getElementById("scoreRing");
    const color = score.grade === "healthy" ? "--green" : score.grade === "warning" ? "--orange" : "--red";
    ring.style.setProperty("--ring-color", `var(${color})`);
    ring.style.setProperty("--ring-pct", String(score.total));
    document.getElementById("scoreValue").textContent = score.total;

    const badge = document.getElementById("scoreBadge");
    badge.className = `badge badge-${score.grade}`;
    badge.textContent = score.grade === "healthy" ? "Healthy" : score.grade === "warning" ? "Needs attention" : "Critical";

    const componentsEl = document.getElementById("scoreComponents");
    componentsEl.innerHTML = score.components
      .map((c) => {
        const barColor = c.score >= 80 ? "var(--green)" : c.score >= 60 ? "var(--orange)" : "var(--red)";
        return `
        <div class="score-component">
          <div class="sc-row">
            <span><span class="sc-name">${esc(c.label)}</span> <span class="sc-detail">&middot; ${esc(c.detail)} &middot; weight ${Math.round(c.weight * 100)}%</span></span>
            <span class="sc-value">${c.score}</span>
          </div>
          <div class="sc-bar"><div class="sc-bar-fill" style="width:${c.score}%;background:${barColor}"></div></div>
        </div>`;
      })
      .join("");
  }

  function renderStatCards() {
    const s = report.summary;
    const cards = [
      { label: "Files analyzed", value: fmt(s.fileCount) },
      { label: "Total lines", value: fmt(s.totalLines) },
      { label: "Functions", value: fmt(s.functionCount) },
      { label: "Avg complexity", value: s.avgComplexity, cls: s.avgComplexity > 10 ? "bad" : s.avgComplexity > 5 ? "warn" : "good" },
      { label: "High-risk functions", value: fmt(s.riskyFunctionCount), cls: s.riskyFunctionCount > 0 ? "bad" : "good" },
      { label: "Duplicated code", value: s.duplicationPercentage + "%", cls: s.duplicationPercentage > 10 ? "bad" : s.duplicationPercentage > 3 ? "warn" : "good" },
      { label: "Circular deps", value: fmt(s.cycleCount), cls: s.cycleCount > 0 ? "bad" : "good" },
      { label: "Long files (>300)", value: fmt(s.longFileCount), cls: s.longFileCount > 0 ? "warn" : "good" },
    ];
    document.getElementById("statCards").innerHTML = cards
      .map((c) => `<div class="stat-card ${c.cls || ""}"><div class="stat-value">${esc(c.value)}</div><div class="stat-label">${esc(c.label)}</div></div>`)
      .join("");
  }

  function renderHistogram() {
    const canvas = document.getElementById("histogramChart");
    if (histogramChart) {
      histogramChart.destroy();
      histogramChart = null;
    }
    const labels = report.histogram.map((b) => b.label);
    const counts = report.histogram.map((b) => b.count);
    const colors = [cssVar("--green"), cssVar("--green"), cssVar("--orange"), cssVar("--red"), cssVar("--red")];
    histogramChart = new Chart(canvas, {
      type: "bar",
      data: {
        labels,
        datasets: [{ data: counts, backgroundColor: colors, borderRadius: 4, maxBarThickness: 64 }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: {
            title: { display: true, text: "Cyclomatic complexity", color: cssVar("--text-faint"), font: { size: 11 } },
            grid: { display: false },
            ticks: { color: cssVar("--text-secondary") },
          },
          y: {
            beginAtZero: true,
            grid: { color: cssVar("--border") },
            ticks: { color: cssVar("--text-secondary"), precision: 0 },
          },
        },
      },
    });
  }

  function renderRiskyFunctions() {
    const tbody = document.querySelector("#riskyFunctionsTable tbody");
    const top = report.functions.slice(0, 15);
    if (top.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7"><div class="empty-state">No functions found.</div></td></tr>`;
      return;
    }
    tbody.innerHTML = top
      .map((f) => {
        const ccClass = f.complexity > 10 ? "cell-bad" : f.complexity > 5 ? "cell-warn" : "";
        return `<tr>
          <td class="wrap">${esc(f.name)}${f.risky ? '<span class="pill pill-red">high risk</span>' : ""}</td>
          <td>${langBadge(f.language)}</td>
          <td class="file-path wrap">${esc(f.file)}</td>
          <td class="num">${f.line}</td>
          <td class="num ${ccClass}">${f.complexity}</td>
          <td class="num ${f.long ? "cell-warn" : ""}">${f.lines}</td>
          <td class="num ${f.deep ? "cell-warn" : ""}">${f.nesting}</td>
        </tr>`;
      })
      .join("");
  }

  function renderMarkupStyleIssues() {
    const card = document.getElementById("markupStyleCard");
    const list = document.getElementById("markupStyleList");
    const markupIssues = report.markupIssues || [];
    const styleIssues = report.styleIssues || [];
    if (markupIssues.length === 0 && styleIssues.length === 0) {
      card.hidden = true;
      return;
    }
    card.hidden = false;

    const markupItems = markupIssues.slice(0, 25).map((issue) => {
      let text;
      switch (issue.type) {
        case "missing-alt": text = "&lt;img&gt; is missing alt text"; break;
        case "duplicate-id": return `<li><span class="file-path">${esc(issue.file)}</span> &mdash; duplicate id "${esc(issue.id)}" (lines ${(issue.lines || []).join(", ")})</li>`;
        case "deprecated-tag": text = `deprecated tag &lt;${esc(issue.tag)}&gt;`; break;
        case "inline-handler": text = "inline event handler (onclick=...) &mdash; prefer addEventListener"; break;
        case "missing-lang": text = "&lt;html&gt; is missing the lang attribute"; break;
        case "missing-viewport": text = "missing viewport meta tag (mobile rendering)"; break;
        case "missing-title": text = "document has no &lt;title&gt;"; break;
        default: text = esc(issue.type);
      }
      return `<li><span class="file-path">${esc(issue.file)}</span> &mdash; line ${issue.line}: ${text}</li>`;
    });
    const styleItems = styleIssues.slice(0, 25).map((issue) => {
      let text;
      switch (issue.type) {
        case "duplicate-selector": text = `duplicate selector "${esc(issue.selector)}" (first seen line ${issue.firstLine})`; break;
        case "high-specificity": text = `high-specificity selector "${esc(issue.selector)}" (score ${issue.specificity})`; break;
        case "duplicate-property": text = `property "${esc(issue.property)}" repeated inside "${esc(issue.selector)}"`; break;
        case "empty-rule": text = `empty rule "${esc(issue.selector)}"`; break;
        case "universal-selector": text = `universal descendant selector "${esc(issue.selector)}" (slow matching)`; break;
        case "long-selector": text = `overly long selector "${esc(issue.selector)}" (${issue.parts} parts)`; break;
        case "z-index": text = `extreme z-index value ${issue.value}`; break;
        default: text = "!important declaration";
      }
      return `<li><span class="file-path">${esc(issue.file)}</span> &mdash; line ${issue.line}: ${text}</li>`;
    });

    list.innerHTML = markupItems.concat(styleItems).join("");
  }

  function renderParseErrors() {
    const card = document.getElementById("parseErrorsCard");
    const list = document.getElementById("parseErrorsList");
    if (!report.parseErrors || report.parseErrors.length === 0) {
      card.hidden = true;
      return;
    }
    card.hidden = false;
    list.innerHTML = report.parseErrors
      .map((e) => `<li><span class="file-path">${esc(e.file)}</span> &mdash; ${esc(e.message)}</li>`)
      .join("");
  }

  // ---------- files table ----------

  function filesData() {
    return report.files.map((f) => ({ ...f, warningCount: f.warnings.length }));
  }

  function renderFilesTable() {
    const tbody = document.querySelector("#filesTable tbody");
    let rows = filesData();
    if (filesFilter) {
      const q = filesFilter.toLowerCase();
      rows = rows.filter((f) => f.path.toLowerCase().includes(q));
    }
    const { key, dir } = filesSort;
    rows.sort((a, b) => {
      const av = a[key];
      const bv = b[key];
      const cmp = typeof av === "string" ? av.localeCompare(bv) : (av || 0) - (bv || 0);
      return dir === "asc" ? cmp : -cmp;
    });

    document.querySelectorAll("#filesTable th").forEach((th) => {
      th.classList.toggle("sorted-asc", th.dataset.key === key && dir === "asc");
      th.classList.toggle("sorted-desc", th.dataset.key === key && dir === "desc");
    });

    if (rows.length === 0) {
      tbody.innerHTML = `<tr><td colspan="9"><div class="empty-state">No files match.</div></td></tr>`;
      return;
    }

    tbody.innerHTML = rows
      .map((f) => {
        const pills = [];
        if (f.riskyFunctions > 0) pills.push('<span class="pill pill-red">complexity</span>');
        if (f.isLongFile) pills.push('<span class="pill pill-orange">long</span>');
        if (f.inCycle) pills.push('<span class="pill pill-red">cycle</span>');
        if (f.parseError) pills.push('<span class="pill pill-orange">parse error</span>');
        const warnTitle = f.warnings.length ? ` title="${esc(f.warnings.join("\n"))}"` : "";
        return `<tr${warnTitle}>
          <td class="file-path wrap">${esc(f.path)}${pills.join("")}</td>
          <td>${langBadge(f.language)}</td>
          <td class="num ${f.isLongFile ? "cell-warn" : ""}">${fmt(f.lines)}</td>
          <td class="num">${f.functionCount}</td>
          <td class="num">${f.avgComplexity}</td>
          <td class="num ${f.maxComplexity > 10 ? "cell-bad" : f.maxComplexity > 5 ? "cell-warn" : ""}">${f.maxComplexity}</td>
          <td class="num ${f.maxNesting > 4 ? "cell-warn" : ""}">${f.maxNesting}</td>
          <td class="num ${f.riskyFunctions > 0 ? "cell-bad" : ""}">${f.riskyFunctions}</td>
          <td class="num ${f.warningCount > 0 ? "cell-warn" : ""}">${f.warningCount}</td>
        </tr>`;
      })
      .join("");
  }

  function bindFilesTable() {
    document.querySelectorAll("#filesTable th").forEach((th) => {
      th.addEventListener("click", () => {
        const key = th.dataset.key;
        if (filesSort.key === key) {
          filesSort.dir = filesSort.dir === "asc" ? "desc" : "asc";
        } else {
          filesSort = { key, dir: th.dataset.type === "string" ? "asc" : "desc" };
        }
        renderFilesTable();
      });
    });
    document.getElementById("fileFilter").addEventListener("input", (e) => {
      filesFilter = e.target.value.trim();
      renderFilesTable();
    });
  }

  // ---------- dependency graph ----------

  function renderDepGraph() {
    const container = document.getElementById("depGraph");
    const details = document.getElementById("nodeDetails");
    details.hidden = true;
    if (depNetwork) {
      depNetwork.destroy();
      depNetwork = null;
    }

    const graph = report.dependencyGraph;
    const notice = document.getElementById("depGraphNotice");
    if (graph.truncated) {
      notice.hidden = false;
      notice.textContent = `Showing the ${graph.nodes.length} most connected files (of ${graph.totalFilesWithDeps} with dependencies).`;
    } else {
      notice.hidden = true;
    }

    if (graph.nodes.length === 0) {
      container.innerHTML = '<div class="empty-state" style="padding:24px">No internal file dependencies were detected.</div>';
      return;
    }
    container.innerHTML = "";

    const accent = cssVar("--accent");
    const red = cssVar("--red");
    const textColor = cssVar("--text-secondary");

    const nodes = new vis.DataSet(
      graph.nodes.map((n) => ({
        id: n.id,
        label: baseName(n.id),
        title: n.id,
        color: {
          background: n.inCycle ? red : accent,
          border: n.inCycle ? red : accent,
          highlight: { background: n.inCycle ? red : accent, border: cssVar("--text") },
        },
        font: { color: textColor, size: 11, face: "Menlo, Consolas, monospace" },
      }))
    );
    const edges = new vis.DataSet(
      graph.edges.map((e, i) => ({
        id: i,
        from: e.from,
        to: e.to,
        arrows: { to: { enabled: true, scaleFactor: 0.5 } },
        color: { color: cssVar("--border-strong"), highlight: accent },
      }))
    );

    depNetwork = new vis.Network(container, { nodes, edges }, {
      nodes: { shape: "dot", size: 9, borderWidth: 1 },
      edges: { smooth: { enabled: true, type: "continuous", roundness: 0.4 }, width: 1 },
      physics: {
        solver: "forceAtlas2Based",
        forceAtlas2Based: { gravitationalConstant: -42, springLength: 110, springConstant: 0.06 },
        stabilization: { iterations: 180, fit: true },
      },
      interaction: { hover: true, tooltipDelay: 120 },
    });

    depNetwork.on("click", (params) => {
      if (!params.nodes.length) {
        details.hidden = true;
        return;
      }
      const id = params.nodes[0];
      const node = graph.nodes.find((n) => n.id === id);
      const file = report.files.find((f) => f.path === id);
      const dependents = graph.edges.filter((e) => e.to === id).length;
      let html = `<h3>${esc(id)}</h3>`;
      html += `<p>Imports <strong>${node ? node.outDegree : 0}</strong> internal file(s) &middot; imported by <strong>${dependents}</strong> file(s)${node && node.inCycle ? ' &middot; <span class="cell-bad">part of a circular dependency</span>' : ""}</p>`;
      if (file) {
        html += `<p>${fmt(file.lines)} lines &middot; ${file.functionCount} functions &middot; max complexity ${file.maxComplexity}</p>`;
        if (file.warnings.length) html += `<p class="cell-warn">${esc(file.warnings.join(" \u00b7 "))}</p>`;
      }
      details.innerHTML = html;
      details.hidden = false;
    });
  }

  function renderCycles() {
    const el = document.getElementById("cyclesList");
    const cycles = report.dependencyGraph.cycles;
    if (!cycles.length) {
      el.innerHTML = '<div class="empty-state positive">No circular dependencies found. &#10003;</div>';
      return;
    }
    el.innerHTML = cycles
      .map((cycle) => `<div class="cycle-item">${cycle.map(esc).join('<span class="cycle-arrow">&rarr;</span>')}</div>`)
      .join("");
  }

  function renderExternalDeps() {
    const el = document.getElementById("externalDeps");
    const deps = report.dependencyGraph.externalDependencies;
    if (!deps.length) {
      el.innerHTML = '<div class="empty-state">No external packages imported.</div>';
      return;
    }
    const max = deps[0].count;
    el.innerHTML = deps
      .slice(0, 12)
      .map(
        (d) => `<div class="dep-row">
          <span class="dep-name">${esc(d.name)}</span>
          <span class="dep-bar-wrap"><span class="dep-bar" style="width:${Math.max(6, (d.count / max) * 100)}%"></span></span>
          <span class="dep-count">${d.count}</span>
        </div>`
      )
      .join("");
  }

  // ---------- duplicates ----------

  function renderDuplicates() {
    const summary = document.getElementById("duplicatesSummary");
    const list = document.getElementById("duplicatesList");
    const dup = report.duplicates;

    summary.innerHTML = `${dup.percentage}% of significant lines appear in duplicated blocks &middot; ${dup.totalBlocks} duplicate block${dup.totalBlocks === 1 ? "" : "s"} found (blocks of 6+ similar lines, compared after normalization).`;

    if (!dup.blocks.length) {
      list.innerHTML = '<div class="empty-state positive">No duplicate blocks detected. &#10003;</div>';
      return;
    }

    list.innerHTML = dup.blocks
      .map(
        (b, i) => `<div class="dup-block">
          <div class="dup-head">
            <strong>Block ${i + 1}</strong>
            <span>~${b.normalizedLines} lines &times; ${b.occurrenceCount} occurrences</span>
          </div>
          <div class="dup-occurrences">
            ${b.occurrences
              .map(
                (o) => `<div class="dup-occurrence">${esc(o.file)} <span class="line-range">lines ${o.startLine}&ndash;${o.endLine}</span></div>`
              )
              .join("")}
          </div>
          <pre class="dup-snippet">${esc(b.snippet)}${b.truncatedSnippet ? "\n\u2026" : ""}</pre>
        </div>`
      )
      .join("");
  }

  // ---------- public API ----------

  let filesTableBound = false;

  function render(newReport) {
    report = newReport;
    document.getElementById("projectName").textContent = report.meta.name;
    const meta = report.meta;
    const skipped = meta.skippedFiles ? ` \u00b7 ${meta.skippedFiles} file(s) skipped (too large/minified)` : "";
    document.getElementById("projectMetaInfo").textContent =
      `Analyzed ${new Date(meta.analyzedAt).toLocaleString()} \u00b7 ${meta.durationMs} ms${skipped}`;

    renderScore();
    renderStatCards();
    renderHistogram();
    renderRiskyFunctions();
    renderMarkupStyleIssues();
    renderParseErrors();
    renderFilesTable();
    if (!filesTableBound) {
      bindFilesTable();
      filesTableBound = true;
    }
    renderDepGraph();
    renderCycles();
    renderExternalDeps();
    renderDuplicates();
  }

  /** Re-renders theme-dependent visuals (charts / graphs) after a theme switch. */
  function refreshTheme() {
    if (!report) return;
    renderHistogram();
    renderDepGraph();
  }

  return { render, refreshTheme, esc, cssVar, baseName, fmt };
})();
