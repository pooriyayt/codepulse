"use strict";

/**
 * Orchestrates the full project analysis and builds the report consumed
 * by the frontend dashboard.
 */

const fs = require("fs");

const { scanProject } = require("./scanner");
const { analyzeSource } = require("./jsAnalyzer");
const { findDuplicates } = require("./duplicates");
const { buildDependencyGraph } = require("./depGraph");
const { analyzeGraphql } = require("./graphqlAnalyzer");
const { parseKnowledgeGraph } = require("./knowledgeGraph");
const { computeScore } = require("./score");

// Thresholds (documented in README)
const THRESHOLDS = {
  complexity: 10, // cyclomatic complexity above this = high risk
  functionLines: 50,
  fileLines: 300,
  nesting: 4,
};

const MAX_FUNCTIONS_IN_REPORT = 500;

function countCodeLines(content) {
  let count = 0;
  for (const raw of content.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("//") || line.startsWith("*") || line.startsWith("/*")) continue;
    count += 1;
  }
  return count;
}

function round1(value) {
  return Math.round(value * 10) / 10;
}

async function analyzeProject(rootDir, options = {}) {
  const startedAt = Date.now();
  const scan = scanProject(rootDir);

  const fileReports = [];
  const allFunctions = [];
  const codeContents = []; // for duplicate detection + resolver scan
  const fileInfosForGraph = [];
  const gqlTemplates = [];
  const parseErrors = [];
  let totalLines = 0;
  let totalCodeLines = 0;
  let usesDataLoader = false;

  for (const file of scan.code) {
    let content;
    try {
      content = fs.readFileSync(file.fullPath, "utf8");
    } catch (_err) {
      continue;
    }

    const lines = content.length === 0 ? 0 : content.split("\n").length;
    const codeLines = countCodeLines(content);
    totalLines += lines;
    totalCodeLines += codeLines;

    const analysis = analyzeSource(content, file.path);
    if (analysis.parseError) {
      parseErrors.push({ file: file.path, message: analysis.parseError.split("\n")[0] });
    }
    if (analysis.usesDataLoader) usesDataLoader = true;

    for (const tpl of analysis.gqlTemplates) {
      gqlTemplates.push({ file: file.path, content: tpl.content, line: tpl.line });
    }

    codeContents.push({ path: file.path, content });
    fileInfosForGraph.push({ path: file.path, imports: analysis.imports });

    const fnMetrics = analysis.functions;
    for (const fn of fnMetrics) {
      allFunctions.push({ ...fn, file: file.path });
    }

    const riskyFns = fnMetrics.filter((f) => f.complexity > THRESHOLDS.complexity);
    const longFns = fnMetrics.filter((f) => f.lines > THRESHOLDS.functionLines);
    const deepFns = fnMetrics.filter((f) => f.nesting > THRESHOLDS.nesting);
    const complexities = fnMetrics.map((f) => f.complexity);

    const warnings = [];
    if (lines > THRESHOLDS.fileLines) warnings.push(`File is ${lines} lines (limit ${THRESHOLDS.fileLines})`);
    if (riskyFns.length > 0) warnings.push(`${riskyFns.length} high-complexity function${riskyFns.length === 1 ? "" : "s"} (CC > ${THRESHOLDS.complexity})`);
    if (longFns.length > 0) warnings.push(`${longFns.length} long function${longFns.length === 1 ? "" : "s"} (> ${THRESHOLDS.functionLines} lines)`);
    if (deepFns.length > 0) warnings.push(`${deepFns.length} deeply nested function${deepFns.length === 1 ? "" : "s"} (depth > ${THRESHOLDS.nesting})`);

    fileReports.push({
      path: file.path,
      lines,
      codeLines,
      functionCount: fnMetrics.length,
      avgComplexity: complexities.length ? round1(complexities.reduce((a, b) => a + b, 0) / complexities.length) : 0,
      maxComplexity: complexities.length ? Math.max(...complexities) : 0,
      maxNesting: fnMetrics.length ? Math.max(...fnMetrics.map((f) => f.nesting)) : 0,
      riskyFunctions: riskyFns.length,
      longFunctions: longFns.length,
      isLongFile: lines > THRESHOLDS.fileLines,
      warnings,
      parseError: analysis.parseError ? analysis.parseError.split("\n")[0] : null,
    });
  }

  // --- Duplicates ---
  const duplicates = findDuplicates(codeContents);

  // --- Dependency graph ---
  const dependencyGraph = buildDependencyGraph(fileInfosForGraph);

  // mark files in cycles
  const cyclicSet = new Set(dependencyGraph.cyclicFiles);
  for (const report of fileReports) {
    if (cyclicSet.has(report.path)) {
      report.inCycle = true;
      report.warnings.push("Part of a circular dependency");
    }
  }

  // --- GraphQL ---
  const sdlFiles = [];
  for (const f of scan.graphql) {
    try {
      sdlFiles.push({ path: f.path, content: fs.readFileSync(f.fullPath, "utf8") });
    } catch (_err) { /* ignore */ }
  }
  const schemaJsonFiles = [];
  for (const f of scan.schemaJson) {
    try {
      schemaJsonFiles.push({ path: f.path, content: fs.readFileSync(f.fullPath, "utf8") });
    } catch (_err) { /* ignore */ }
  }
  const graphql = analyzeGraphql({
    sdlFiles,
    templates: gqlTemplates,
    schemaJsonFiles,
    codeFiles: codeContents,
    usesDataLoader,
  });

  // --- Graphify / generic knowledge graph (graph.json) ---
  const knowledgeGraph = parseKnowledgeGraph(schemaJsonFiles);

  // --- Aggregates & score ---
  const complexities = allFunctions.map((f) => f.complexity);
  const avgComplexity = complexities.length
    ? complexities.reduce((a, b) => a + b, 0) / complexities.length
    : 0;
  const riskyFunctionCount = allFunctions.filter((f) => f.complexity > THRESHOLDS.complexity).length;
  const longFunctionCount = allFunctions.filter((f) => f.lines > THRESHOLDS.functionLines).length;
  const deepFunctionCount = allFunctions.filter((f) => f.nesting > THRESHOLDS.nesting).length;
  const longFileCount = fileReports.filter((f) => f.isLongFile).length;

  const score = computeScore({
    functionCount: allFunctions.length,
    fileCount: fileReports.length,
    avgComplexity,
    riskyFunctionCount,
    longFunctionCount,
    longFileCount,
    deepFunctionCount,
    duplicationPercentage: duplicates.percentage,
    cycleCount: dependencyGraph.cycles.length,
  });

  // Complexity histogram buckets
  const histogram = [
    { label: "1-2", min: 1, max: 2, count: 0 },
    { label: "3-5", min: 3, max: 5, count: 0 },
    { label: "6-10", min: 6, max: 10, count: 0 },
    { label: "11-20", min: 11, max: 20, count: 0 },
    { label: "21+", min: 21, max: Infinity, count: 0 },
  ];
  for (const c of complexities) {
    const bucket = histogram.find((b) => c >= b.min && c <= b.max);
    if (bucket) bucket.count += 1;
  }

  const topFunctions = [...allFunctions]
    .sort((a, b) => b.complexity - a.complexity || b.lines - a.lines)
    .slice(0, MAX_FUNCTIONS_IN_REPORT)
    .map((f) => ({
      ...f,
      risky: f.complexity > THRESHOLDS.complexity,
      long: f.lines > THRESHOLDS.functionLines,
      deep: f.nesting > THRESHOLDS.nesting,
    }));

  fileReports.sort((a, b) => (b.riskyFunctions - a.riskyFunctions) || (b.maxComplexity - a.maxComplexity) || (b.lines - a.lines));

  return {
    meta: {
      name: options.name || "project",
      analyzedAt: new Date().toISOString(),
      durationMs: Date.now() - startedAt,
      skippedFiles: scan.skipped,
      thresholds: THRESHOLDS,
    },
    summary: {
      fileCount: fileReports.length,
      totalLines,
      codeLines: totalCodeLines,
      functionCount: allFunctions.length,
      avgComplexity: round1(avgComplexity),
      maxComplexity: complexities.length ? Math.max(...complexities) : 0,
      riskyFunctionCount,
      longFunctionCount,
      longFileCount,
      deepFunctionCount,
      duplicationPercentage: duplicates.percentage,
      cycleCount: dependencyGraph.cycles.length,
      parseErrorCount: parseErrors.length,
      graphqlDetected: graphql.present,
      knowledgeGraphDetected: knowledgeGraph.present,
    },
    score,
    histogram: histogram.map(({ label, count }) => ({ label, count })),
    files: fileReports,
    functions: topFunctions,
    duplicates,
    dependencyGraph: {
      nodes: dependencyGraph.nodes,
      edges: dependencyGraph.edges,
      cycles: dependencyGraph.cycles,
      externalDependencies: dependencyGraph.externalDependencies,
      truncated: dependencyGraph.truncated,
      totalFilesWithDeps: dependencyGraph.totalFilesWithDeps,
    },
    graphql,
    knowledgeGraph,
    parseErrors: parseErrors.slice(0, 50),
  };
}

module.exports = { analyzeProject, THRESHOLDS };
