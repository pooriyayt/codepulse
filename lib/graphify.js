"use strict";

/**
 * Auto-generated project knowledge graph ("Graphify" style) built from
 * static analysis only - no AI, no external APIs. Nodes are files,
 * classes, functions and SQL tables; edges are imports / declares /
 * defines / references relationships. The output shape matches Graphify's
 * graph.json (nodes + edges with source/target/relation) so users can
 * download it and reuse it in any tool that reads that format.
 */

const MAX_FILE_NODES = 400;
const MAX_FUNCTION_NODES = 250;
const MAX_CLASS_NODES = 150;
const MAX_TABLE_NODES = 120;
const MAX_EDGES = 4000;

function topFolder(p) {
  return p.includes("/") ? p.split("/")[0] : "(root)";
}

function baseName(p) {
  const idx = p.lastIndexOf("/");
  return idx === -1 ? p : p.slice(idx + 1);
}

function buildProjectGraph(input) {
  const files = input.files || [];
  const functions = input.functions || [];
  const graph = input.dependencyGraph || { edges: [] };
  const sqlTables = input.sqlTables || [];
  const sqlRelations = input.sqlRelations || [];

  const nodes = [];
  const nodeIds = new Set();
  const edges = [];
  const edgeSeen = new Set();

  function addNode(node) {
    if (nodeIds.has(node.id)) return false;
    nodeIds.add(node.id);
    nodes.push(node);
    return true;
  }

  function addEdge(source, target, relation) {
    if (edges.length >= MAX_EDGES) return;
    if (!nodeIds.has(source) || !nodeIds.has(target)) return;
    const key = source + " -> " + target + " : " + relation;
    if (edgeSeen.has(key)) return;
    edgeSeen.add(key);
    edges.push({ source, target, relation, confidence: "EXTRACTED" });
  }

  // --- file nodes (report order is risky-first, keep the most interesting) ---
  for (const f of files.slice(0, MAX_FILE_NODES)) {
    addNode({
      id: "file:" + f.path,
      label: baseName(f.path),
      type: "file",
      community: topFolder(f.path),
      source: f.path,
    });
  }

  // --- import edges between files ---
  for (const e of graph.edges || []) {
    addEdge("file:" + e.from, "file:" + e.to, "imports");
  }

  // --- class + function nodes (most complex functions first) ---
  const classIds = new Set();
  const topFns = [...functions]
    .sort((a, b) => b.complexity - a.complexity || b.lines - a.lines)
    .slice(0, MAX_FUNCTION_NODES);
  for (const fn of topFns) {
    const fileId = "file:" + fn.file;
    if (!nodeIds.has(fileId)) continue;
    let parentId = fileId;
    const name = String(fn.name || "");
    const dotIdx = name.indexOf(".");
    if (dotIdx > 0 && !name.startsWith("(") && !name.startsWith("<")) {
      const cls = name.slice(0, dotIdx);
      const clsId = "class:" + fn.file + ":" + cls;
      if (!classIds.has(clsId) && classIds.size < MAX_CLASS_NODES) {
        classIds.add(clsId);
        addNode({ id: clsId, label: cls, type: "class", community: topFolder(fn.file), source: fn.file });
        addEdge(fileId, clsId, "declares");
      }
      if (nodeIds.has(clsId)) parentId = clsId;
    }
    const shortName = dotIdx > 0 ? name.slice(dotIdx + 1) : name;
    const fnId = "fn:" + fn.file + "#" + name + "@" + fn.line;
    addNode({
      id: fnId,
      label: shortName,
      type: "function",
      community: topFolder(fn.file),
      source: fn.file + ":" + fn.line,
    });
    addEdge(parentId, fnId, "defines");
  }

  // --- SQL tables + foreign-key relations ---
  for (const t of sqlTables.slice(0, MAX_TABLE_NODES)) {
    addNode({ id: "table:" + t.name, label: t.name, type: "table", community: "database", source: t.file });
    addEdge("file:" + t.file, "table:" + t.name, "defines");
  }
  for (const r of sqlRelations) {
    addNode({ id: "table:" + r.to, label: r.to, type: "table", community: "database", source: r.file });
    addNode({ id: "table:" + r.from, label: r.from, type: "table", community: "database", source: r.file });
    addEdge("table:" + r.from, "table:" + r.to, "references");
  }

  return {
    nodes,
    edges,
    meta: { generatedBy: "CodePulse static analysis", format: "graphify-compatible" },
  };
}

module.exports = { buildProjectGraph };
