"use strict";

/**
 * SQL Schema (ER) panel. Renders the tables, foreign-key relations and SQL
 * issues extracted by the backend sqlAnalyzer - a static ER diagram of the
 * project's database, generated without AI. Uses vis-network for the graph.
 */

window.SqlSchemaPanel = (function () {
  let data = null;
  let network = null;

  function dash() { return window.Dashboard || {}; }
  function esc(s) { return dash().esc ? dash().esc(s) : String(s == null ? "" : s); }
  function fmt(v) { return dash().fmt ? dash().fmt(v) : String(v); }
  function cssVar(name) { return dash().cssVar ? dash().cssVar(name) : ""; }
  function t(key, fallback) {
    if (window.I18N && typeof window.I18N.t === "function") return window.I18N.t(key, fallback);
    return fallback;
  }

  function renderChips() {
    const chips = [
      { label: t("sql.chipTables", "Tables"), value: data.tables.length },
      { label: t("sql.chipRelations", "Relations"), value: data.relations.length },
      { label: t("sql.chipIssues", "Issues"), value: data.issues.length },
    ];
    const inferredCount = data.tables.filter((tbl) => tbl.fromCode).length;
    if (inferredCount > 0) chips.push({ label: t("sql.chipFromCode", "From code"), value: inferredCount });
    if (data.queryCount > 0) chips.push({ label: t("sql.chipQueries", "Queries in code"), value: data.queryCount });
    document.getElementById("sqlChips").innerHTML = chips
      .map((x) => `<span class="kg-chip"><strong>${fmt(x.value)}</strong>${esc(x.label)}</span>`)
      .join("");
  }

  function renderGraph() {
    const container = document.getElementById("sqlGraph");
    if (!container || typeof vis === "undefined") return;
    if (network) {
      network.destroy();
      network = null;
    }

    const accent = cssVar("--accent") || "#7c6cf5";
    const border = cssVar("--border") || "#555";
    const text = cssVar("--text-primary") || cssVar("--text") || "#ddd";
    const red = cssVar("--red") || "#e5484d";

    const known = new Set(data.tables.map((tbl) => tbl.name));
    const nodes = data.tables.map((tbl) => ({
      id: tbl.name,
      label: tbl.name + "\n" + tbl.columnCount + " col" + (tbl.columnCount === 1 ? "" : "s"),
      shape: "box",
      margin: 10,
      shapeProperties: tbl.inferred ? { borderDashes: [6, 4] } : {},
      color: {
        background: "rgba(124,108,245,0.12)",
        border: accent,
        highlight: { background: "rgba(124,108,245,0.28)", border: accent },
      },
      font: { color: text, size: 13 },
    }));
    for (const r of data.relations) {
      for (const name of [r.from, r.to]) {
        if (name && !known.has(name)) {
          known.add(name);
          nodes.push({
            id: name,
            label: name + "\n(external)",
            shape: "box",
            margin: 10,
            shapeProperties: { borderDashes: [4, 4] },
            color: { background: "transparent", border: border },
            font: { color: text, size: 12 },
          });
        }
      }
    }
    const edges = data.relations.map((r) => ({
      from: r.from,
      to: r.to,
      arrows: "to",
      label: r.fromColumn || "",
      font: { size: 10, color: text, strokeWidth: 0, align: "middle" },
      color: { color: border, highlight: red },
      smooth: { type: "cubicBezier" },
    }));

    network = new vis.Network(
      container,
      { nodes: new vis.DataSet(nodes), edges: new vis.DataSet(edges) },
      {
        physics: {
          solver: "forceAtlas2Based",
          forceAtlas2Based: { gravitationalConstant: -80, springLength: 140 },
          stabilization: { iterations: 150 },
        },
        interaction: { hover: true, zoomView: true, dragView: true },
      }
    );
  }

  function renderTables() {
    const el = document.getElementById("sqlTables");
    if (!el) return;
    if (!data.tables.length) {
      el.innerHTML = `<div class="empty-state">No CREATE TABLE statements found.</div>`;
      return;
    }
    el.innerHTML = data.tables
      .map((tbl) => {
        const cols = (tbl.columns || [])
          .map((c) => `<span class="sql-col">${c.primaryKey ? '<span class="pk"><i class="fa-solid fa-key"></i></span>' : ""}${esc(c.name)} <em>${esc((c.type || "").toLowerCase())}</em></span>`)
          .join("");
        const badge = tbl.fromCode ? ` <span class="sql-badge">${esc(t("sql.inferredBadge", "from code"))}</span>` : "";
        const body = cols || `<em class="sql-nocols">${esc(t("sql.noCols", "columns unknown - table referenced by queries"))}</em>`;
        return `<div class="sql-table${tbl.inferred ? " sql-table-inferred" : ""}"><h4><i class="fa-solid fa-table"></i> ${esc(tbl.name)}${badge}</h4><div class="sql-cols">${body}</div><div class="sql-file">${esc(tbl.file)} : ${tbl.line}</div></div>`;
      })
      .join("");
  }

  function issueText(issue) {
    switch (issue.type) {
      case "select-star": return "SELECT * (fetches every column &mdash; select only what you need)";
      case "delete-no-where": return `DELETE without WHERE${issue.table ? ` on "${esc(issue.table)}"` : ""} (removes ALL rows)`;
      case "update-no-where": return `UPDATE without WHERE${issue.table ? ` on "${esc(issue.table)}"` : ""} (updates ALL rows)`;
      case "many-joins": return `query with ${issue.count} JOINs (consider splitting it up)`;
      default: return esc(issue.type);
    }
  }

  function renderIssues() {
    const list = document.getElementById("sqlIssues");
    if (!list) return;
    if (!data.issues.length) {
      list.innerHTML = `<li class="empty-state">No SQL issues found.</li>`;
      return;
    }
    list.innerHTML = data.issues
      .map((i) => `<li><span class="file-path">${esc(i.file)}</span> &mdash; line ${i.line}: ${issueText(i)}</li>`)
      .join("");
  }

  function render(sql) {
    data = sql;
    renderChips();
    renderGraph();
    renderTables();
    renderIssues();
  }

  function refreshTheme() {
    if (data) render(data);
  }

  return { render, refreshTheme };
})();
