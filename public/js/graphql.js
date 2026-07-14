"use strict";

/**
 * GraphQL Schema tab - visually distinct (GraphQL pink/purple identity).
 * Renders the type-relation graph, operations, warnings and type table.
 */

window.GraphQLPanel = (function () {
  const { esc, cssVar, fmt } = window.Dashboard;
  let gqlNetwork = null;
  let data = null;

  const KIND_LABELS = {
    type: "Type",
    interface: "Interface",
    input: "Input",
    enum: "Enum",
    union: "Union",
    scalar: "Scalar",
  };

  function kindColor(kind, isRoot) {
    if (isRoot) return cssVar("--gql");
    switch (kind) {
      case "interface": return cssVar("--gql-purple");
      case "input": return "#8b7bd8";
      case "enum": return "#c26fc7";
      case "union": return "#d84f9e";
      case "scalar": return cssVar("--text-faint");
      default: return "#e86bb3";
    }
  }

  function renderChips() {
    const s = data.stats;
    const chips = [
      { label: "Types", value: s.typeCount },
      { label: "Queries", value: s.queryCount },
      { label: "Mutations", value: s.mutationCount },
      { label: "Subscriptions", value: s.subscriptionCount },
      { label: "Inputs", value: s.inputCount },
      { label: "Enums", value: s.enumCount },
      { label: "Interfaces", value: s.interfaceCount },
      { label: "Unions", value: s.unionCount },
    ].filter((c) => c.value > 0);
    document.getElementById("gqlChips").innerHTML = chips
      .map((c) => `<span class="gql-chip"><strong>${fmt(c.value)}</strong>${esc(c.label)}</span>`)
      .join("");

    const sources = data.sources.slice(0, 4).map((src) => `${src.path} (${src.kind})`).join(", ");
    const more = data.sources.length > 4 ? ` and ${data.sources.length - 4} more` : "";
    document.getElementById("gqlSources").textContent = `Schema found in: ${sources}${more}`;
  }

  function renderGraph() {
    const container = document.getElementById("gqlGraph");
    const details = document.getElementById("gqlNodeDetails");
    details.hidden = true;
    if (gqlNetwork) {
      gqlNetwork.destroy();
      gqlNetwork = null;
    }

    const graphTypes = data.types.filter((t) => t.kind !== "scalar");
    if (graphTypes.length === 0) {
      container.innerHTML = '<div class="empty-state" style="padding:24px">No object types found in the schema.</div>';
      return;
    }
    container.innerHTML = "";

    const typeSet = new Set(graphTypes.map((t) => t.name));
    const nodes = new vis.DataSet(
      graphTypes.map((t) => ({
        id: t.name,
        label: t.name,
        title: `${KIND_LABELS[t.kind] || t.kind} \u00b7 ${t.fieldCount} fields`,
        shape: t.isRoot ? "hexagon" : "dot",
        size: t.isRoot ? 16 : Math.min(9 + t.fieldCount * 0.4, 20),
        color: {
          background: kindColor(t.kind, t.isRoot),
          border: t.tooLarge ? cssVar("--orange") : kindColor(t.kind, t.isRoot),
          highlight: { background: kindColor(t.kind, t.isRoot), border: cssVar("--text") },
        },
        borderWidth: t.tooLarge ? 3 : 1,
        font: { color: cssVar("--text-secondary"), size: 12 },
      }))
    );

    const seen = new Set();
    const edgeList = [];
    data.relations.forEach((r, i) => {
      if (!typeSet.has(r.from) || !typeSet.has(r.to)) return;
      const key = `${r.from}->${r.to}`;
      if (seen.has(key)) return;
      seen.add(key);
      edgeList.push({
        id: i,
        from: r.from,
        to: r.to,
        arrows: { to: { enabled: true, scaleFactor: 0.5 } },
        dashes: r.field === "(implements)" || r.field === "(union member)",
        color: { color: "rgba(225, 0, 152, 0.45)", highlight: cssVar("--gql") },
      });
    });

    gqlNetwork = new vis.Network(container, { nodes, edges: new vis.DataSet(edgeList) }, {
      nodes: { borderWidth: 1 },
      edges: { smooth: { enabled: true, type: "continuous", roundness: 0.4 }, width: 1 },
      physics: {
        solver: "forceAtlas2Based",
        forceAtlas2Based: { gravitationalConstant: -55, springLength: 130, springConstant: 0.05 },
        stabilization: { iterations: 200, fit: true },
      },
      interaction: { hover: true, tooltipDelay: 120 },
    });

    gqlNetwork.on("click", (params) => {
      if (!params.nodes.length) {
        details.hidden = true;
        return;
      }
      const type = data.types.find((t) => t.name === params.nodes[0]);
      if (!type) return;
      const fieldsPreview = type.fields
        .slice(0, 14)
        .map((f) => (f.isEnumValue ? f.name : `${f.name}: ${f.type}`))
        .join("<br>");
      details.innerHTML = `
        <h3>${esc(type.name)} <span class="pill pill-gql">${esc(KIND_LABELS[type.kind] || type.kind)}</span>${type.tooLarge ? '<span class="pill pill-orange">large type</span>' : ""}</h3>
        <p>${type.fieldCount} field${type.fieldCount === 1 ? "" : "s"}${type.sourceFiles.length ? ` \u00b7 defined in ${esc(type.sourceFiles.join(", "))}` : ""}</p>
        <p style="font-family:var(--mono);font-size:12px;line-height:1.7">${fieldsPreview}${type.fields.length > 14 ? "<br>&hellip;" : ""}</p>`;
      details.hidden = false;
    });
  }

  function renderOperations() {
    const el = document.getElementById("gqlOperations");
    const groups = [
      { title: "Queries", items: data.operations.queries },
      { title: "Mutations", items: data.operations.mutations },
      { title: "Subscriptions", items: data.operations.subscriptions },
    ].filter((g) => g.items.length > 0);

    if (!groups.length) {
      el.innerHTML = '<div class="empty-state">No root operations (Query / Mutation / Subscription) found.</div>';
      return;
    }

    el.innerHTML = groups
      .map(
        (g) => `<div class="gql-op-group">
          <h3>${g.title} (${g.items.length})</h3>
          ${g.items
            .slice(0, 30)
            .map(
              (op) => `<div class="gql-op">
                <span>${esc(op.name)}${op.hasResolver === false ? '<span class="pill pill-red">no resolver</span>' : ""}</span>
                <span class="returns">${esc(op.returns)}</span>
              </div>`
            )
            .join("")}
          ${g.items.length > 30 ? `<div class="empty-state">&hellip; and ${g.items.length - 30} more</div>` : ""}
        </div>`
      )
      .join("");
  }

  function renderWarnings() {
    const el = document.getElementById("gqlWarnings");
    const w = data.warnings;
    const sections = [];

    if (w.largeTypes.length) {
      sections.push(`<div class="gql-warning-group">
        <h3>Oversized types (&gt; 20 fields)</h3>
        ${w.largeTypes
          .map((t) => `<div class="gql-warning"><code>${esc(t.name)}</code> has <strong>${t.fieldCount}</strong> fields &mdash; consider splitting this type.</div>`)
          .join("")}
      </div>`);
    }

    if (data.hasResolversDir && w.missingResolvers.length) {
      sections.push(`<div class="gql-warning-group">
        <h3>Fields without a matching resolver</h3>
        ${w.missingResolvers
          .slice(0, 20)
          .map((m) => `<div class="gql-warning severe"><code>${esc(m.type)}.${esc(m.field)}</code> has no matching name in the resolvers folder.</div>`)
          .join("")}
        ${w.missingResolvers.length > 20 ? `<div class="empty-state">&hellip; and ${w.missingResolvers.length - 20} more</div>` : ""}
      </div>`);
    } else if (!data.hasResolversDir) {
      sections.push(`<div class="gql-warning-group"><h3>Resolver coverage</h3><div class="gql-warning info">No <code>resolvers/</code> folder detected &mdash; resolver coverage was not checked.</div></div>`);
    }

    if (w.nPlusOne.length) {
      const mitigated = data.hasDataLoader;
      sections.push(`<div class="gql-warning-group">
        <h3>Potential N+1 queries</h3>
        ${mitigated ? '<div class="gql-warning info">DataLoader detected in the project &mdash; these list fields are likely batched, verify each one.</div>' : ""}
        ${w.nPlusOne
          .slice(0, 20)
          .map(
            (n) => `<div class="gql-warning ${mitigated ? "info" : ""}"><code>${esc(n.type)}.${esc(n.field)}</code> returns <code>${esc(n.returns)}</code>${mitigated ? "" : " with no DataLoader in the project"}.</div>`
          )
          .join("")}
        ${w.nPlusOne.length > 20 ? `<div class="empty-state">&hellip; and ${w.nPlusOne.length - 20} more</div>` : ""}
      </div>`);
    }

    if (!sections.length) {
      sections.push('<div class="empty-state positive">No schema design warnings. &#10003;</div>');
    }
    el.innerHTML = sections.join("");
  }

  function renderTypesTable() {
    const tbody = document.querySelector("#gqlTypesTable tbody");
    tbody.innerHTML = data.types
      .map((t) => {
        const notes = [];
        if (t.isRoot) notes.push('<span class="pill pill-gql">root</span>');
        if (t.tooLarge) notes.push('<span class="pill pill-orange">&gt; 20 fields</span>');
        return `<tr>
          <td>${esc(t.name)}</td>
          <td>${esc(KIND_LABELS[t.kind] || t.kind)}</td>
          <td class="num ${t.tooLarge ? "cell-warn" : ""}">${t.fieldCount}</td>
          <td class="file-path wrap">${esc(t.sourceFiles.join(", "))}</td>
          <td>${notes.join(" ") || "&mdash;"}</td>
        </tr>`;
      })
      .join("");
  }

  function render(graphqlData) {
    data = graphqlData;
    renderChips();
    renderGraph();
    renderOperations();
    renderWarnings();
    renderTypesTable();
  }

  function refreshTheme() {
    if (data) renderGraph();
  }

  return { render, refreshTheme };
})();
