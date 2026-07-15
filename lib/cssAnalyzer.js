"use strict";

/**
 * CSS static analysis via brace-depth scanning (pure Node.js, no extra
 * deps). Detects duplicate selectors, high-specificity selectors,
 * !important overuse, duplicate properties inside a rule, empty rules,
 * universal descendant selectors, very long selector chains and extreme
 * z-index values. Also counts vendor-prefixed declarations. Heuristic
 * (not a full CSS parser) but handles comments and everyday syntax.
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
  let maxNesting = 0;
  let vendorPrefixCount = 0;
  let buf = "";
  let segStart = 0;
  const n = sanitized.length;
  const stack = []; // open blocks: { isRule, decls, props, selector, line }

  function processDecl(declText, startIdx) {
    const decl = declText.trim();
    if (!decl) return;
    const ctx = stack.length ? stack[stack.length - 1] : null;
    const ln = lineAt(startIdx);
    if (/!\s*important/i.test(decl)) issues.push({ type: "important", line: ln });
    const colonIdx = decl.indexOf(":");
    if (colonIdx > 0 && ctx && ctx.isRule) {
      ctx.decls += 1;
      const prop = decl.slice(0, colonIdx).trim().toLowerCase();
      const value = decl.slice(colonIdx + 1).trim();
      if (/^-(webkit|moz|ms|o)-/.test(prop)) vendorPrefixCount += 1;
      if (prop && ctx.props.has(prop)) {
        issues.push({ type: "duplicate-property", property: prop, selector: ctx.selector, line: ln });
      } else if (prop) {
        ctx.props.add(prop);
      }
      if (prop === "z-index") {
        const z = parseInt(value, 10);
        if (!Number.isNaN(z) && Math.abs(z) >= 1000) issues.push({ type: "z-index", value: z, line: ln });
      }
    }
  }

  for (let i = 0; i < n; i++) {
    const ch = sanitized[i];
    if (ch === "{") {
      const selectorText = buf.trim();
      buf = "";
      const isRule = Boolean(selectorText) && !selectorText.startsWith("@");
      const ln = lineAt(segStart);
      if (isRule) {
        ruleCount++;
        const parts = selectorText.split(",").map((p) => p.trim()).filter(Boolean);
        for (const part of parts) {
          const norm = part.replace(/\s+/g, " ");
          if (selectorSeen.has(norm)) {
            issues.push({ type: "duplicate-selector", selector: norm, line: ln, firstLine: selectorSeen.get(norm) });
          } else {
            selectorSeen.set(norm, ln);
          }
          const spec = specificityOf(norm);
          if (spec >= 100) issues.push({ type: "high-specificity", selector: norm, line: ln, specificity: spec });
          if (/(\s|>)\*/.test(norm) || /^\*\s/.test(norm)) {
            issues.push({ type: "universal-selector", selector: norm, line: ln });
          }
          const chainLen = norm.split(/\s*[>+~]\s*|\s+/).filter(Boolean).length;
          if (chainLen > 4) issues.push({ type: "long-selector", selector: norm, line: ln, parts: chainLen });
        }
      }
      stack.push({ isRule, decls: 0, props: new Set(), selector: selectorText, line: ln });
      if (stack.length > maxNesting) maxNesting = stack.length;
      segStart = i + 1;
      continue;
    }
    if (ch === "}") {
      processDecl(buf, segStart); // trailing declaration without a semicolon
      buf = "";
      const ctx = stack.pop();
      if (ctx && ctx.isRule && ctx.decls === 0) {
        issues.push({ type: "empty-rule", selector: ctx.selector, line: ctx.line });
      }
      segStart = i + 1;
      continue;
    }
    if (ch === ";") {
      processDecl(buf, segStart);
      buf = "";
      segStart = i + 1;
      continue;
    }
    buf += ch;
  }

  const count = (type) => issues.filter((x) => x.type === type).length;

  return {
    issues: issues.slice(0, 120),
    ruleCount,
    importantCount: count("important"),
    duplicateSelectorCount: count("duplicate-selector"),
    highSpecificityCount: count("high-specificity"),
    duplicatePropertyCount: count("duplicate-property"),
    emptyRuleCount: count("empty-rule"),
    universalSelectorCount: count("universal-selector"),
    longSelectorCount: count("long-selector"),
    zIndexCount: count("z-index"),
    vendorPrefixCount,
    maxNesting,
  };
}

module.exports = { analyzeSource };
