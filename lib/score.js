"use strict";

/**
 * Overall project health score (0-100), a weighted formula over:
 *  - average cyclomatic complexity        (30%)
 *  - duplicated code percentage           (25%)
 *  - size violations (long funcs/files)   (20%)
 *  - circular dependencies                (15%)
 *  - deep nesting                         (10%)
 */

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function round1(value) {
  return Math.round(value * 10) / 10;
}

function computeScore(stats) {
  const {
    functionCount,
    fileCount,
    avgComplexity,
    riskyFunctionCount,
    longFunctionCount,
    longFileCount,
    deepFunctionCount,
    duplicationPercentage,
    cycleCount,
  } = stats;

  const safeFn = Math.max(functionCount, 1);
  const safeFiles = Math.max(fileCount, 1);

  const riskyPct = (riskyFunctionCount / safeFn) * 100;
  const longFnPct = (longFunctionCount / safeFn) * 100;
  const longFilePct = (longFileCount / safeFiles) * 100;
  const deepPct = (deepFunctionCount / safeFn) * 100;

  // Complexity: avg CC of 1-3 is great, 10+ is bad. Risky-function share adds pressure.
  const complexityScore = clamp(
    100 - Math.max(0, avgComplexity - 2) * 9 - riskyPct * 1.2,
    0,
    100
  );

  // Duplication: every duplicated % costs 3 points.
  const duplicationScore = clamp(100 - duplicationPercentage * 3, 0, 100);

  // Size: share of long functions and long files.
  const sizeScore = clamp(100 - longFnPct * 1.6 - longFilePct * 1.2, 0, 100);

  // Circular dependencies: each cycle costs 18 points.
  const dependencyScore = clamp(100 - cycleCount * 18, 0, 100);

  // Nesting: share of overly nested functions.
  const nestingScore = clamp(100 - deepPct * 2.2, 0, 100);

  const components = [
    { key: "complexity", label: "Complexity", score: Math.round(complexityScore), weight: 0.3, detail: `avg CC ${round1(avgComplexity)}, ${riskyFunctionCount} high-risk function${riskyFunctionCount === 1 ? "" : "s"}` },
    { key: "duplication", label: "Duplication", score: Math.round(duplicationScore), weight: 0.25, detail: `${round1(duplicationPercentage)}% duplicated lines` },
    { key: "size", label: "Size", score: Math.round(sizeScore), weight: 0.2, detail: `${longFunctionCount} long function${longFunctionCount === 1 ? "" : "s"}, ${longFileCount} long file${longFileCount === 1 ? "" : "s"}` },
    { key: "dependencies", label: "Dependencies", score: Math.round(dependencyScore), weight: 0.15, detail: `${cycleCount} circular dependenc${cycleCount === 1 ? "y" : "ies"}` },
    { key: "nesting", label: "Nesting", score: Math.round(nestingScore), weight: 0.1, detail: `${deepFunctionCount} deeply nested function${deepFunctionCount === 1 ? "" : "s"}` },
  ];

  const total = Math.round(
    components.reduce((sum, c) => sum + c.score * c.weight, 0)
  );

  const grade = total >= 80 ? "healthy" : total >= 60 ? "warning" : "critical";

  return { total, grade, components };
}

module.exports = { computeScore };
