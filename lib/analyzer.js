"use strict";

/**
 * Orchestrates the full project analysis and builds the report consumed
 * by the frontend dashboard. Dispatches each scanned file to the analyzer
 * for its language (JavaScript/TypeScript, Python, PHP, HTML, CSS, Go,
 * Rust, Java, C, C++, C#, Kotlin, Swift, Ruby, SQL) and merges everything
 * into one unified report, including the SQL schema (ER) graph and the
 * auto-generated project knowledge graph (Graphify-compatible).
 */

const fs = require("fs");

const { scanProject } = require("./scanner");
const jsAnalyzer = require("./jsAnalyzer");
const pythonAnalyzer = require("./pythonAnalyzer");
const phpAnalyzer = require("./phpAnalyzer");
const htmlAnalyzer = require("./htmlAnalyzer");
const cssAnalyzer = require("./cssAnalyzer");
const braceAnalyzer = require("./braceAnalyzer");
const rubyAnalyzer = require("./rubyAnalyzer");
const sqlAnalyzer = require("./sqlAnalyzer");
const { findDuplicates } = require("./duplicates");
const { buildDependencyGraph } = require("./depGraph");
const { analyzeGraphql } = require("./graphqlAnalyzer");
const { parseKnowledgeGraph } = require("./knowledgeGraph");
const { buildProjectGraph } = require("./graphify");
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

const BRACE_LANGS = new Set(["go", "rust", "java", "c", "cpp", "csharp", "kotlin", "swift"]);
const HASH_COMMENT_LANGS = new Set(["python", "ruby"]);

function round1(value) {
  return Math.round(value * 10) / 10;
}

function countCodeLines(content, language) {
  const isHash = HASH_COMMENT_LANGS.has(language);
  const isSql = language === "sql";
  let count = 0;
  for (const raw of content.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    if (isHash && line.startsWith("#")) continue;
    if (isSql && line.startsWith("--")) continue;
    if (!isHash && !isSql && (line.startsWith("//") || line.startsWith("*") || line.startsWith("/*"))) continue;
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
    case "ruby": return rubyAnalyzer;
    case "sql": return sqlAnalyzer;
    default:
      if (BRACE_LANGS.has(language)) {
        return { analyzeSource: (content, path) => braceAnalyzer.analyzeSource(content, path, language) };
      }
      return jsAnalyzer; // javascript / typescript
  }
}

function plural(n, word) {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
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
  const sqlTables = [];
  const sqlRelations = [];
  const sqlIssues = [];
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

    let analysis;
    try {
      analysis = analyzerFor(language).analyzeSource(content, file.path);
    } catch (err) {
      // A single unparseable file must never break the whole analysis.
      analysis = {
        functions: [], imports: [], gqlTemplates: [], usesDataLoader: false,
        tables: [], relations: [], issues: [],
        parseError: `Analyzer error: ${err.message}`,
      };
    }
    if (analysis.parseError) {
      parseErrors.push({ file: file.path, message: analysis.parseError.split("\n")[0] });
    }
    if (analysis.usesDataLoader) usesDataLoader = true;

    for (const tpl of analysis.gqlTemplates || []) {
      gqlTemplates.push({ file: file.path, content: tpl.content, line: tpl.line });
    }

    codeContents.push({ path: file.path, content, language });
    if (language === "javascript" || language === "typescript") {
      fileInfosForGraph.push({ path: file.path, imports: analysis.imports });
    }

    const fnMetrics = (analysis.functions || []).map((fn) => ({ language: fn.language || language, ...fn }));
    for (const fn of fnMetrics) {
      allFunctions.push({ ...fn, file: file.path });
    }

    const riskyFns = fnMetrics.filter((f) => f.complexity > THRESHOLDS.complexity);
    const longFns = fnMetrics.filter((f) => f.lines > THRESHOLDS.functionLines);
    const deepFns = fnMetrics.filter((f) => f.nesting > THRESHOLDS.nesting);
    const complexities = fnMetrics.map((f) => f.complexity);

    const warnings = [];
    if (lines > THRESHOLDS.fileLines) warnings.push(`File is ${lines} lines (limit ${THRESHOLDS.fileLines})`);
    if (riskyFns.length > 0) warnings.push(`${plural(riskyFns.length, "high-complexity function")} (CC > ${THRESHOLDS.complexity})`);
    if (longFns.length > 0) warnings.push(`${plural(longFns.length, "long function")} (> ${THRESHOLDS.functionLines} lines)`);
    if (deepFns.length > 0) warnings.push(`${plural(deepFns.length, "deeply nested function")} (depth > ${THRESHOLDS.nesting})`);

    // --- HTML-specific structural issues ---
    if (language === "html") {
      if (analysis.maxDepth > THRESHOLDS.domDepth) warnings.push(`DOM nesting depth ${analysis.maxDepth} (limit ${THRESHOLDS.domDepth})`);
      if (analysis.missingAltCount > 0) warnings.push(`${analysis.missingAltCount} <img> tag${analysis.missingAltCount === 1 ? "" : "s"} missing alt text`);
      if (analysis.duplicateIds && analysis.duplicateIds.length > 0) warnings.push(`${plural(analysis.duplicateIds.length, "duplicate id attribute")}`);
      if (analysis.deprecatedTags && analysis.deprecatedTags.length > 0) warnings.push(`${plural(analysis.deprecatedTags.length, "deprecated tag")}`);
      if (analysis.inlineHandlerCount > 0) warnings.push(`${plural(analysis.inlineHandlerCount, "inline event handler")} (onclick=...)`);
      if (analysis.inlineStyleCount > 3) warnings.push(`${analysis.inlineStyleCount} inline style attributes`);
      for (const line of analysis.missingAltLines || []) {
        markupIssues.push({ file: file.path, type: "missing-alt", line });
      }
      for (const dup of analysis.duplicateIds || []) {
        markupIssues.push({ file: file.path, type: "duplicate-id", id: dup.id, lines: dup.lines });
      }
      for (const dep of analysis.deprecatedTags || []) {
        markupIssues.push({ file: file.path, type: "deprecated-tag", tag: dep.tag, line: dep.line });
      }
      for (const line of analysis.inlineHandlerLines || []) {
        markupIssues.push({ file: file.path, type: "inline-handler", line });
      }
      for (const di of analysis.docIssues || []) {
        warnings.push(di === "missing-lang" ? "<html> missing lang attribute" : di === "missing-viewport" ? "Missing viewport meta tag" : "Missing <title>");
        markupIssues.push({ file: file.path, type: di, line: 1 });
      }
      for (const issue of analysis.cssIssues || []) {
        styleIssues.push({ file: `${file.path} (inline <style>)`, ...issue });
      }
    }

    // --- CSS-specific issues ---
    if (language === "css") {
      if (analysis.duplicateSelectorCount > 0) warnings.push(`${plural(analysis.duplicateSelectorCount, "duplicate selector")}`);
      if (analysis.importantCount > 0) warnings.push(`${plural(analysis.importantCount, "!important declaration")}`);
      if (analysis.highSpecificityCount > 0) warnings.push(`${plural(analysis.highSpecificityCount, "high-specificity selector")}`);
      if (analysis.duplicatePropertyCount > 0) warnings.push(`${plural(analysis.duplicatePropertyCount, "duplicate property")}`);
      if (analysis.emptyRuleCount > 0) warnings.push(`${plural(analysis.emptyRuleCount, "empty rule")}`);
      if (analysis.universalSelectorCount > 0) warnings.push(`${plural(analysis.universalSelectorCount, "universal (*) selector")}`);
      if (analysis.longSelectorCount > 0) warnings.push(`${plural(analysis.longSelectorCount, "overly long selector")}`);
      if (analysis.zIndexCount > 0) warnings.push(`${plural(analysis.zIndexCount, "extreme z-index value")}`);
      for (const issue of analysis.issues || []) {
        styleIssues.push({ file: file.path, ...issue });
      }
    }

    // --- SQL-specific schema + issues ---
    if (language === "sql") {
      for (const t of analysis.tables || []) sqlTables.push({ ...t, file: file.path });
      for (const r of analysis.relations || []) sqlRelations.push({ ...r, file: file.path });
      for (const issue of analysis.issues || []) sqlIssues.push({ file: file.path, ...issue });
      if ((analysis.tables || []).length > 0) warnings.push(`Defines ${plural(analysis.tables.length, "table")}`);
      if ((analysis.issues || []).length > 0) warnings.push(`${plural(analysis.issues.length, "SQL issue")} (SELECT *, missing WHERE, ...)`);
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
  let duplicates;
  try {
    duplicates = findDuplicates(codeContents);
  } catch (_err) {
    duplicates = findDuplicates([]);
  }

  // --- Dependency graph (JS/TS import graph) ---
  let dependencyGraph;
  try {
    dependencyGraph = buildDependencyGraph(fileInfosForGraph);
  } catch (_err) {
    dependencyGraph = buildDependencyGraph([]);
  }

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

  // --- Graphify / generic knowledge graph (graph.json provided by the user) ---
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

  // --- SQL schema (ER graph) ---
  // --- SQL embedded in ordinary code strings (PHP/JS/Python/...) ---
  let sqlQueryCount = 0;
  let sqlFilesWithCode = 0;
  try {
    const { extractSqlFromCode } = require("./sqlFromCode");
    const fromCode = extractSqlFromCode(codeContents);
    sqlQueryCount = fromCode.queryCount;
    sqlFilesWithCode = fromCode.filesWithSql;
    const knownTables = new Set(sqlTables.map((t) => String(t.name).toLowerCase()));
    for (const t of fromCode.tables) {
      const key = String(t.name).toLowerCase();
      if (knownTables.has(key)) continue;
      knownTables.add(key);
      sqlTables.push(t);
    }
    const seenRel = new Set(sqlRelations.map((r) => [r.from, r.fromColumn, r.to, r.toColumn].join("|").toLowerCase()));
    for (const r of fromCode.relations) {
      const key = [r.from, r.fromColumn, r.to, r.toColumn].join("|").toLowerCase();
      if (seenRel.has(key)) continue;
      seenRel.add(key);
      sqlRelations.push(r);
    }
  } catch (_err) { /* never break the report */ }

  const sqlSchema = {
    present: sqlTables.length > 0,
    tables: sqlTables.slice(0, 200).map((t) => ({
      name: t.name,
      file: t.file,
      line: t.line,
      columnCount: (t.columns || []).length,
      columns: (t.columns || []).slice(0, 40),
      fromCode: !!t.fromCode,
      inferred: !!t.inferred,
    })),
    relations: sqlRelations.slice(0, 500),
    issues: sqlIssues.slice(0, 100),
    queryCount: sqlQueryCount,
    filesWithEmbeddedSql: sqlFilesWithCode,
  };

  // --- Auto-generated project knowledge graph (Graphify-compatible, no AI) ---
  let projectGraph = { present: false };
  try {
    const rawGraph = buildProjectGraph({
      files: fileReports,
      functions: allFunctions,
      dependencyGraph,
      sqlTables,
      sqlRelations,
    });
    if (rawGraph.nodes.length >= 3) {
      const normalized = parseKnowledgeGraph([
        { path: "auto-generated from code structure", content: JSON.stringify(rawGraph) },
      ]);
      if (normalized.present) {
        projectGraph = { ...normalized, generated: true, raw: rawGraph };
      }
    }
  } catch (_err) {
    // graph generation must never break the analysis
  }

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
      sqlTableCount: sqlTables.length,
      sqlRelationCount: sqlRelations.length,
      sqlIssueCount: sqlIssues.length,
      projectGraphNodeCount: projectGraph.present && projectGraph.stats ? projectGraph.stats.nodeCount : 0,
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
    projectGraph,
    sqlSchema,
    styleIssues: styleIssues.slice(0, MAX_STYLE_ISSUES_IN_REPORT),
    markupIssues: markupIssues.slice(0, MAX_MARKUP_ISSUES_IN_REPORT),
    parseErrors: parseErrors.slice(0, 50),
  };
}

module.exports = { analyzeProject, THRESHOLDS };
