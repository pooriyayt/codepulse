"use strict";

/**
 * Ruby static analysis (pure Node.js, heuristic). Strings and comments are
 * blanked first, then a line-by-line walk tracks def / class / module /
 * block openers against matching `end` keywords. Modifier-form conditionals
 * (e.g. `raise if x`) do not open blocks but still add complexity.
 * Endless defs (`def foo = expr`) are recorded as one-line functions.
 */

function blankStringsAndComments(code) {
  let out = "";
  let i = 0;
  const n = code.length;
  while (i < n) {
    const ch = code[i];
    if (ch === '"' || ch === "'") {
      const quote = ch;
      out += " ";
      i++;
      while (i < n && code[i] !== quote) {
        if (code[i] === "\\" && i + 1 < n) {
          out += " ";
          i++;
          out += code[i] === "\n" ? "\n" : " ";
          i++;
          continue;
        }
        out += code[i] === "\n" ? "\n" : " ";
        i++;
      }
      if (i < n) { out += " "; i++; }
      continue;
    }
    if (ch === "#") {
      while (i < n && code[i] !== "\n") { out += " "; i++; }
      continue;
    }
    out += ch;
    i++;
  }
  return out;
}

const TOKEN_RE = /\b(?:def|class|module|case|begin|for|if|unless|while|until|end|do)\b/g;
const DEF_NAME_RE = /^def\s+(?:self\.)?([A-Za-z_][\w.]*[?!=]?)/;
const ENDLESS_DEF_RE = /^def\s+(?:self\.)?[A-Za-z_][\w?!]*(?:\([^)]*\))?\s*=(?![=~>])/;
const CX_RE = /\b(?:if|elsif|unless|while|until|when|rescue|and|or)\b|&&|\|\|/g;

function countParams(defLine) {
  const pm = defLine.match(/\(([^)]*)\)/);
  if (!pm) return 0;
  return pm[1].split(",").map((p) => p.trim()).filter(Boolean).length;
}

function analyzeSource(code, _filePath) {
  const blanked = blankStringsAndComments(code);
  const rawLines = code.split("\n");
  const lines = blanked.split("\n");
  const functions = [];
  const defStack = [];
  const classStack = [];
  let depth = 0;
  let inBlockComment = false;

  for (let idx = 0; idx < lines.length; idx++) {
    const lineText = lines[idx];
    const trimmed = lineText.trim();
    const rawTrimmed = (rawLines[idx] || "").trim();

    if (/^=begin\b/.test(rawTrimmed)) { inBlockComment = true; continue; }
    if (inBlockComment) {
      if (/^=end\b/.test(rawTrimmed)) inBlockComment = false;
      continue;
    }
    if (!trimmed) continue;

    const cxMatches = trimmed.match(CX_RE);
    if (defStack.length && cxMatches) {
      defStack[defStack.length - 1].complexity += cxMatches.length;
    }

    if (ENDLESS_DEF_RE.test(trimmed)) {
      const dm = trimmed.match(DEF_NAME_RE);
      const prefix = classStack.length ? classStack[classStack.length - 1].name + "." : "";
      functions.push({
        name: prefix + (dm ? dm[1] : "(def)"),
        line: idx + 1,
        endLine: idx + 1,
        lines: 1,
        params: countParams(trimmed),
        complexity: 1 + (cxMatches ? cxMatches.length : 0),
        nesting: 0,
        language: "ruby",
      });
      continue;
    }

    TOKEN_RE.lastIndex = 0;
    let m;
    while ((m = TOKEN_RE.exec(trimmed))) {
      const word = m[0];
      const before = trimmed.slice(0, m.index);
      const after = trimmed.slice(m.index + word.length);

      if (/[.\w:$@]$/.test(before)) continue; // method call like x.end / symbol

      if (word === "end") {
        depth = Math.max(0, depth - 1);
        while (defStack.length && depth < defStack[defStack.length - 1].startDepth) {
          const f = defStack.pop();
          functions.push({
            name: f.name,
            line: f.line,
            endLine: idx + 1,
            lines: idx + 1 - f.line + 1,
            params: f.params,
            complexity: f.complexity,
            nesting: Math.max(0, f.maxDepth - f.startDepth),
            language: "ruby",
          });
        }
        while (classStack.length && depth < classStack[classStack.length - 1].startDepth) {
          classStack.pop();
        }
        continue;
      }

      if (word === "do") {
        if (!/^\s*(\|[^|]*\|)?\s*$/.test(after)) continue; // not a block opener
        depth++;
        if (defStack.length) {
          const top = defStack[defStack.length - 1];
          if (depth > top.maxDepth) top.maxDepth = depth;
        }
        continue;
      }

      if (word === "if" || word === "unless" || word === "while" || word === "until") {
        // opener only in statement position, not modifier form
        if (!/(^\s*|[=(,;]\s*|&&\s*|\|\|\s*|\bthen\s+.*)$/.test(before)) continue;
        depth++;
        if (defStack.length) {
          const top = defStack[defStack.length - 1];
          if (depth > top.maxDepth) top.maxDepth = depth;
        }
        continue;
      }

      if (word === "def") {
        const dm = trimmed.slice(m.index).match(DEF_NAME_RE);
        depth++;
        const prefix = classStack.length ? classStack[classStack.length - 1].name + "." : "";
        defStack.push({
          name: prefix + (dm ? dm[1] : "(def)"),
          line: idx + 1,
          startDepth: depth,
          maxDepth: depth,
          complexity: 1,
          params: countParams(trimmed.slice(m.index)),
        });
        continue;
      }

      if (word === "class" || word === "module") {
        const cm = after.match(/^\s*([A-Z]\w*(?:::\w+)*)/);
        depth++;
        classStack.push({ name: cm ? cm[1] : word, startDepth: depth });
        continue;
      }

      // case / begin / for
      depth++;
      if (defStack.length) {
        const top = defStack[defStack.length - 1];
        if (depth > top.maxDepth) top.maxDepth = depth;
      }
    }
  }

  // close any unclosed defs at EOF
  while (defStack.length) {
    const f = defStack.pop();
    functions.push({
      name: f.name,
      line: f.line,
      endLine: lines.length,
      lines: lines.length - f.line + 1,
      params: f.params,
      complexity: f.complexity,
      nesting: Math.max(0, f.maxDepth - f.startDepth),
      language: "ruby",
    });
  }

  return { functions, imports: [], gqlTemplates: [], usesDataLoader: false, parseError: null };
}

module.exports = { analyzeSource };
