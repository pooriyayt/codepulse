"use strict";

/**
 * File dependency graph from parsed import/require statements.
 * Resolves relative imports against the scanned file list and detects
 * circular dependencies with a DFS (back-edge detection).
 */

const RESOLVE_EXTENSIONS = ["", ".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs"];
const INDEX_SUFFIXES = ["/index.js", "/index.jsx", "/index.ts", "/index.tsx", "/index.mjs", "/index.cjs"];
const MAX_GRAPH_NODES = 400;
const MAX_CYCLES = 50;

function posixDirname(p) {
  const idx = p.lastIndexOf("/");
  return idx === -1 ? "" : p.slice(0, idx);
}

function posixNormalize(p) {
  const parts = [];
  for (const part of p.split("/")) {
    if (part === "" || part === ".") continue;
    if (part === "..") {
      if (parts.length > 0 && parts[parts.length - 1] !== "..") parts.pop();
      else parts.push("..");
    } else {
      parts.push(part);
    }
  }
  return parts.join("/");
}

/**
 * @param {Array<{path: string, imports: Array<{source: string}>}>} fileInfos
 */
function buildDependencyGraph(fileInfos) {
  const filePaths = new Set(fileInfos.map((f) => f.path));

  function resolveImport(fromPath, source) {
    if (!source.startsWith("./") && !source.startsWith("../")) return null; // external / aliased
    const base = posixNormalize(`${posixDirname(fromPath)}/${source}`);
    for (const ext of RESOLVE_EXTENSIONS) {
      if (filePaths.has(base + ext)) return base + ext;
    }
    for (const suffix of INDEX_SUFFIXES) {
      if (filePaths.has(base + suffix)) return base + suffix;
    }
    return null;
  }

  const adjacency = new Map(); // path -> Set of resolved internal deps
  const externalCounts = new Map(); // package -> import count
  const edges = [];

  for (const file of fileInfos) {
    const deps = new Set();
    for (const imp of file.imports) {
      const resolved = resolveImport(file.path, imp.source);
      if (resolved && resolved !== file.path) {
        if (!deps.has(resolved)) {
          deps.add(resolved);
          edges.push({ from: file.path, to: resolved });
        }
      } else if (!imp.source.startsWith(".")) {
        // external package: keep only the package root (handles @scope/pkg)
        const parts = imp.source.split("/");
        const pkg = imp.source.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0];
        externalCounts.set(pkg, (externalCounts.get(pkg) || 0) + 1);
      }
    }
    adjacency.set(file.path, deps);
  }

  // --- Cycle detection (DFS with colors, iterative-safe depth) ---
  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = new Map();
  const cycles = [];
  const seenCycleKeys = new Set();
  const pathStack = [];

  function dfs(node) {
    color.set(node, GRAY);
    pathStack.push(node);
    for (const next of adjacency.get(node) || []) {
      const c = color.get(next) || WHITE;
      if (c === GRAY) {
        const start = pathStack.indexOf(next);
        if (start !== -1 && cycles.length < MAX_CYCLES) {
          const cycle = pathStack.slice(start);
          const key = [...cycle].sort().join("->");
          if (!seenCycleKeys.has(key)) {
            seenCycleKeys.add(key);
            cycles.push([...cycle, next]); // closed loop for display
          }
        }
      } else if (c === WHITE) {
        dfs(next);
      }
    }
    pathStack.pop();
    color.set(node, BLACK);
  }

  for (const node of adjacency.keys()) {
    if ((color.get(node) || WHITE) === WHITE) dfs(node);
  }

  const inCycle = new Set();
  for (const cycle of cycles) for (const n of cycle) inCycle.add(n);

  // --- Nodes for visualization: only files participating in edges (capped) ---
  const connected = new Set();
  for (const e of edges) {
    connected.add(e.from);
    connected.add(e.to);
  }
  let nodeList = [...connected];
  let truncated = false;
  if (nodeList.length > MAX_GRAPH_NODES) {
    // Prefer cycle members, then most-connected files
    const degree = new Map();
    for (const e of edges) {
      degree.set(e.from, (degree.get(e.from) || 0) + 1);
      degree.set(e.to, (degree.get(e.to) || 0) + 1);
    }
    nodeList.sort((a, b) => {
      const cycleDiff = (inCycle.has(b) ? 1 : 0) - (inCycle.has(a) ? 1 : 0);
      if (cycleDiff !== 0) return cycleDiff;
      return (degree.get(b) || 0) - (degree.get(a) || 0);
    });
    nodeList = nodeList.slice(0, MAX_GRAPH_NODES);
    truncated = true;
  }
  const nodeSet = new Set(nodeList);

  const externalDependencies = [...externalCounts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 50);

  return {
    nodes: nodeList.map((p) => ({
      id: p,
      folder: posixDirname(p) || ".",
      inCycle: inCycle.has(p),
      outDegree: (adjacency.get(p) || new Set()).size,
    })),
    edges: edges.filter((e) => nodeSet.has(e.from) && nodeSet.has(e.to)),
    cycles,
    cyclicFiles: [...inCycle],
    externalDependencies,
    truncated,
    totalFilesWithDeps: connected.size,
  };
}

module.exports = { buildDependencyGraph };
