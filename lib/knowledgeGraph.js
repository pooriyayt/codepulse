"use strict";

/**
 * Generic code knowledge-graph support (e.g. Graphify's graphify-out/graph.json).
 * Accepts any JSON file shaped like { nodes: [...], edges|links: [...] } and
 * normalizes it for the "Knowledge Graph" dashboard tab.
 * This is NOT GraphQL - GraphQL introspection JSON is handled separately.
 */

const MAX_RENDER_NODES = 400;
const MAX_RENDER_EDGES = 3000;
const MAX_GOD_NODES = 12;
const MAX_RELATIONS = 12;
// Safety ceiling for the on-demand "load full graph" view - still far below
// what would be needed for a typical Graphify export, but protects the
// browser tab from an unbounded payload / render on pathological inputs.
const MAX_FULL_NODES = 20000;
const MAX_FULL_EDGES = 150000;

function normalizeConfidence(value) {
  if (!value) return null;
  const v = String(value).toUpperCase();
  if (v.includes("EXTRACT")) return "EXTRACTED";
  if (v.includes("INFER")) return "INFERRED";
  if (v.includes("AMBIG")) return "AMBIGUOUS";
  return null;
}

function parseOne(file) {
  let data;
  try {
    data = JSON.parse(file.content);
  } catch (_err) {
    return null;
  }
  if (!data || typeof data !== "object") return null;
  // GraphQL introspection results are handled by the GraphQL analyzer instead
  if (data.__schema || (data.data && data.data.__schema)) return null;

  const rawNodes = Array.isArray(data.nodes) ? data.nodes : null;
  const rawEdges = Array.isArray(data.edges)
    ? data.edges
    : Array.isArray(data.links)
      ? data.links
      : null;
  if (!rawNodes || !rawEdges || rawNodes.length === 0) return null;

  const nodes = new Map();
  for (const raw of rawNodes) {
    if (raw == null) continue;
    if (typeof raw === "string") {
      if (!nodes.has(raw)) {
        nodes.set(raw, { id: raw, label: raw, type: null, community: null, source: null, degree: 0 });
      }
      continue;
    }
    if (typeof raw !== "object") continue;
    const id =
      raw.id != null ? String(raw.id) : raw.name != null ? String(raw.name) : raw.label != null ? String(raw.label) : null;
    if (id == null || nodes.has(id)) continue;
    nodes.set(id, {
      id,
      label: String(raw.label != null ? raw.label : raw.name != null ? raw.name : id),
      type: raw.type || raw.kind || raw.category || null,
      community:
        raw.community != null ? raw.community : raw.group != null ? raw.group : raw.cluster != null ? raw.cluster : null,
      source: raw.source || raw.file || raw.path || raw.location || null,
      degree: typeof raw.degree === "number" ? raw.degree : 0,
    });
  }
  if (nodes.size === 0) return null;

  const edges = [];
  for (const raw of rawEdges) {
    if (!raw || typeof raw !== "object") continue;
    const from = raw.source != null ? String(raw.source) : raw.from != null ? String(raw.from) : null;
    const to = raw.target != null ? String(raw.target) : raw.to != null ? String(raw.to) : null;
    if (from == null || to == null) continue;
    if (!nodes.has(from) || !nodes.has(to)) continue;
    edges.push({
      from,
      to,
      relation: raw.relation || raw.relationship || raw.label || raw.type || null,
      confidence: normalizeConfidence(raw.confidence || raw.tag || raw.status),
    });
  }

  // Compute degrees when the file does not provide them
  const hasDegrees = [...nodes.values()].some((n) => n.degree > 0);
  if (!hasDegrees) {
    for (const e of edges) {
      nodes.get(e.from).degree += 1;
      nodes.get(e.to).degree += 1;
    }
  }

  return { path: file.path, nodes, edges };
}

/**
 * Picks the largest valid knowledge graph among the JSON candidates.
 * @param {Array<{path: string, content: string}>} jsonFiles
 */
function parseKnowledgeGraph(jsonFiles) {
  let best = null;
  for (const file of jsonFiles || []) {
    const parsed = parseOne(file);
    if (parsed && (!best || parsed.nodes.size > best.nodes.size)) best = parsed;
  }
  if (!best) return { present: false };

  const allNodes = [...best.nodes.values()];
  const totalNodes = allNodes.length;
  const totalEdges = best.edges.length;

  // God nodes: the most connected concepts
  const godNodes = [...allNodes]
    .sort((a, b) => b.degree - a.degree)
    .slice(0, MAX_GOD_NODES)
    .map((n) => ({ label: n.label, type: n.type, degree: n.degree, source: n.source }));

  // Relation + confidence stats
  const relationCounts = new Map();
  const confidence = { EXTRACTED: 0, INFERRED: 0, AMBIGUOUS: 0, untagged: 0 };
  for (const e of best.edges) {
    if (e.relation) {
      const key = String(e.relation);
      relationCounts.set(key, (relationCounts.get(key) || 0) + 1);
    }
    if (e.confidence) confidence[e.confidence] += 1;
    else confidence.untagged += 1;
  }
  const relations = [...relationCounts.entries()]
    .map((entry) => ({ name: entry[0], total: entry[1] }))
    .sort((a, b) => b.total - a.total)
    .slice(0, MAX_RELATIONS);

  const communitySet = new Set(allNodes.map((n) => n.community).filter((c) => c != null));

  // Cap rendered nodes: keep the most connected ones
  const keep = new Set(
    [...allNodes]
      .sort((a, b) => b.degree - a.degree)
      .slice(0, MAX_RENDER_NODES)
      .map((n) => n.id)
  );
  const renderNodes = allNodes.filter((n) => keep.has(n.id));
  const renderEdges = best.edges
    .filter((e) => keep.has(e.from) && keep.has(e.to))
    .slice(0, MAX_RENDER_EDGES);

  // Full (on-demand) view: much higher cap, still keeping the most
  // connected nodes first if the safety ceiling is ever hit.
  const fullKeep = new Set(
    [...allNodes]
      .sort((a, b) => b.degree - a.degree)
      .slice(0, MAX_FULL_NODES)
      .map((n) => n.id)
  );
  const fullNodes = allNodes.filter((n) => fullKeep.has(n.id));
  const fullEdges = best.edges
    .filter((e) => fullKeep.has(e.from) && fullKeep.has(e.to))
    .slice(0, MAX_FULL_EDGES);

  return {
    present: true,
    sourcePath: best.path,
    stats: {
      nodeCount: totalNodes,
      edgeCount: totalEdges,
      communityCount: communitySet.size,
      confidence,
    },
    godNodes,
    relations,
    nodes: renderNodes,
    edges: renderEdges,
    allNodes: fullNodes,
    allEdges: fullEdges,
    truncated: totalNodes > renderNodes.length || totalEdges > renderEdges.length,
    fullAvailable: fullNodes.length === totalNodes && fullEdges.length === totalEdges,
  };
}

module.exports = { parseKnowledgeGraph };
