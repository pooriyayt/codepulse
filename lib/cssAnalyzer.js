"use strict";

/**
 * CSS static analysis via brace-depth scanning (pure Node.js, no extra
 * deps). Detects duplicate selectors, high-specificity selectors, and
 * !important overuse. Also reports rule count and max @media/@supports
 * nesting depth. This is heuristic (not a full CSS parser) but handles
 * comments and everyday selector syntax correctly.
 */

function stripCssComments(code) {
  return code.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "));
}

function buildLineAt(text) {
  const offsets = [0];
  for (let i = 0; i < text.length; i++) if (text[i] === "\n") offsets.push(i + 1);
  return function lineAt(idx) {
    let lo = 0;
    let hi = offsets.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (offsets[mid] <= idx) lo = mid;
      else hi = mid - 1;
    }
    return lo + 1;
  };
}

function specificityOf(selector) {
  const s = selector.trim();
  const idCount = (s.match(/#[A-Za-z_-][\w-]*/g) || []).length;
  const classAttrPseudo = (s.match(/\.[A-Za-z_-][\w-]*|\[[^\]]+\]|:[a-zA-Z-]+(\([^)]*\))?/g) || []).length;
  const typeCount = (s.match(/(^|[\s>+~])[a-zA-Z][a-zA-Z0-9]*/g) || []).length;
  return idCount * 100 + classAttrPseudo * 10 + typeCount;
}

function analyzeSource(code) {
  const sanitized = stripCssComments(code);
  const lineAt = buildLineAt(sanitized);
  const issues = [];
  const selectorSeen = new Map();
  let ruleCount = 0;
  let depth = 0;
  let maxNesting = 0;
  let buf = "";
  let segStart = 0;
  const n = sanitized.length;

  for (let i = 0; i < n; i++) {
    const ch = sanitized[i];
    if (ch === "{") {
      const selectorText = buf.trim();
      buf = "";
      depth++;
      if (depth > maxNesting) maxNesting = depth;
      if (selectorText && !selectorText.startsWith("@")) {
        ruleCount++;
        const parts = selectorText.split(",").map((p) => p.trim()).filter(Boolean);
        for (const part of parts) {
          const norm = part.replace(/\s+/g, " ");
          const ln = lineAt(segStart);
          if (selectorSeen.has(norm)) {
            issues.push({ type: "duplicate-selector", selector: norm, line: ln, firstLine: selectorSeen.get(norm) });
          } else {
            selectorSeen.set(norm, ln);
          }
          const spec = specificityOf(norm);
          if (spec >= 100) issues.push({ type: "high-specificity", selector: norm, line: ln, specificity: spec });
        }
      }
      segStart = i + 1;
      continue;
    }
    if (ch === "}") {
      depth = Math.max(0, depth - 1);
      buf = "";
      segStart = i + 1;
      continue;
    }
    if (ch === ";") {
      if (/!\s*important/i.test(buf)) issues.push({ type: "important", line: lineAt(segStart) });
      buf = "";
      segStart = i + 1;
      continue;
    }
    buf += ch;
  }

  const importantCount = issues.filter((x) => x.type === "important").length;
  const duplicateSelectorCount = issues.filter((x) => x.type === "duplicate-selector").length;
  const highSpecificityCount = issues.filter((x) => x.type === "high-specificity").length;

  return {
    issues: issues.slice(0, 100),
    ruleCount,
    importantCount,
    duplicateSelectorCount,
    highSpecificityCount,
    maxNesting,
  };
}

module.exports = { analyzeSource };
