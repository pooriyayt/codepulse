"use strict";

/**
 * Orchestrates the full project analysis and builds the report consumed
 * by the frontend dashboard. Dispatches each scanned file to the analyzer
 * for its language (JavaScript/TypeScript, Python, PHP, HTML, CSS) and
 * merges everything into one unified report.
 */

const fs = require("fs");

const { scanProject } = require("./scanner");
const jsAnalyzer = require("./jsAnalyzer");
const pythonAnalyzer = require("./pythonAnalyzer");
const phpAnalyzer = require("./phpAnalyzer");
const htmlAnalyzer = require("./htmlAnalyzer");
const cssAnalyzer = require("./cssAnalyzer");
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
  domDepth: 15, // HTML: warn above this element-nesting depth
};

const MAX_FUNCTIONS_IN_REPORT = 500;
const MAX_STYLE_ISSUES_IN_REPORT = 200;
const MAX_MARKUP_ISSUES_IN_REPORT = 200;

function round1(value) {
  return Math.round(value * 10) / 10;
}

function countCodeLines(content, language) {
  const isHash = language === "python";
  let count = 0;
  for (const raw of content.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    if (isHash && line.startsWith("#")) continue;
    if (!isHash && (line.startsWith("//") || line.startsWith("*") || line.startsWith("/*"))) continue;
    count += 1;
  }
  return count;
}

function analyzerFor(language) {
  switch (language) {
    case "python": return pythonAnalyzer;
    case "php": return phpAnalyzer;
    case "html": return htmlAnalyzer;
    case "css": return cssAnalyzer;
    default: return jsAnalyzer; // javascript / typescript
  }
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
  const styleIssues = [];
  const markupIssues = [];
  const languageStats = new Map(); // language -> { fileCount, lines }
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

    const language = file.language || "javascript";
    const lines = content.length === 0 ? 0 : content.split("\n").length;
    const codeLines = countCodeLines(content, language);
    totalLines += lines;
    totalCodeLines += codeLines;

    const stat = languageStats.get(language) || { language, fileCount: 0, lines: 0 };
    stat.fileCount += 1;
    stat.lines += lines;
    languageStats.set(language, stat);

    const analysis = analyzerFor(language).analyzeSource(content, file.path);
    if (analysis.parseError) {
      parseErrors.push({ file: file.path, message: analysis.parseError.split("\n")[0] });
    }
    if (analysis.usesDataLoader) usesDataLoader = true;

    for (const tpl of analysis.gqlTemplates || []) {
      gqlTemplates.push({ file: file.path, content: tpl.content, line: tpl.line });
    }

    codeContents.push({ path: file.path, content });
    if (language === "javascript" || language === "typescript") {
      fileInfosForGraph.push({ path: file.path, imports: analysis.imports });
    }

    const fnMetrics = (analysis.functions || []).map((fn) => ({ language, ...fn }));
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

    // --- HTML-specific structural issues ---
    if (language === "html") {
      if (analysis.maxDepth > THRESHOLDS.domDepth) warnings.push(`DOM nesting depth ${analysis.maxDepth} (limit ${THRESHOLDS.domDepth})`);
      if (analysis.missingAltCount > 0) warnings.push(`${analysis.missingAltCount} <img> tag${analysis.missingAltCount === 1 ? "" : "s"} missing alt text`);
      if (analysis.duplicateIds && analysis.duplicateIds.length > 0) warnings.push(`${analysis.duplicateIds.length} duplicate id attribute${analysis.duplicateIds.length === 1 ? "" : "s"}`);
      for (const line of analysis.missingAltLines || []) {
        markupIssues.push({ file: file.path, type: "missing-alt", line });
      }
      for (const dup of analysis.duplicateIds || []) {
        markupIssues.push({ file: file.path, type: "duplicate-id", id: dup.id, lines: dup.lines });
      }
      for (const issue of analysis.cssIssues || []) {
        styleIssues.push({ file: `${file.path} (inline <style>)`, ...issue });
      }
    }

    // --- CSS-specific issues ---
    if (language === "css") {
      if (analysis.duplicateSelectorCount > 0) warnings.push(`${analysis.duplicateSelectorCount} duplicate selector${analysis.duplicateSelectorCount === 1 ? "" : "s"}`);
      if (analysis.importantCount > 0) warnings.push(`${analysis.importantCount} !important declaration${analysis.importantCount === 1 ? "" : "s"}`);
      if (analysis.highSpecificityCount > 0) warnings.push(`${analysis.highSpecificityCount} high-specificity selector${analysis.highSpecificityCount === 1 ? "" : "s"}`);
      for (const issue of analysis.issues || []) {
        styleIssues.push({ file: file.path, ...issue });
      }
    }

    fileReports.push({
      path: file.path,
      language,
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

  // --- Dependency graph (JS/TS import graph) ---
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

  const languageBreakdown = [...languageStats.values()].sort((a, b) => b.lines - a.lines);

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
      languageBreakdown,
      styleIssueCount: styleIssues.length,
      markupIssueCount: markupIssues.length,
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
    styleIssues: styleIssues.slice(0, MAX_STYLE_ISSUES_IN_REPORT),
    markupIssues: markupIssues.slice(0, MAX_MARKUP_ISSUES_IN_REPORT),
    parseErrors: parseErrors.slice(0, 50),
  };
}

module.exports = { analyzeProject, THRESHOLDS };
