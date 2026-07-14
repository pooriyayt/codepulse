"use strict";

/**
 * PHP static analysis via brace-depth tokenizing (pure Node.js, no extra
 * deps). Non-PHP (HTML) regions and PHP comments/strings are blanked out
 * before scanning so braces/keywords inside them are ignored. Cyclomatic
 * complexity and nesting are attributed to the innermost active
 * function/closure on a stack, so nested functions are measured separately
 * (their braces never inflate the outer function's numbers).
 * Known limitation: heredoc/nowdoc string bodies are not specially
 * unescaped, so rare edge cases inside them may be mis-counted.
 */

function sanitizePhpCode(segment) {
  let result = "";
  let i = 0;
  const n = segment.length;
  while (i < n) {
    const ch = segment[i];
    if (ch === "'" || ch === '"') {
      const quote = ch;
      result += " ";
      i++;
      while (i < n && segment[i] !== quote) {
        result += segment[i] === "\n" ? "\n" : " ";
        if (segment[i] === "\\" && i + 1 < n) { i++; result += segment[i] === "\n" ? "\n" : " "; }
        i++;
      }
      if (i < n) { result += " "; i++; }
      continue;
    }
    if (ch === "/" && segment[i + 1] === "/") {
      while (i < n && segment[i] !== "\n") { result += " "; i++; }
      continue;
    }
    if (ch === "#" && segment[i + 1] !== "[") {
      while (i < n && segment[i] !== "\n") { result += " "; i++; }
      continue;
    }
    if (ch === "/" && segment[i + 1] === "*") {
      result += "  ";
      i += 2;
      while (i < n && !(segment[i] === "*" && segment[i + 1] === "/")) { result += segment[i] === "\n" ? "\n" : " "; i++; }
      if (i < n) { result += "  "; i += 2; }
      continue;
    }
    result += ch === "\n" ? "\n" : ch;
    i++;
  }
  return result;
}

function sanitizeForScanning(code) {
  let out = "";
  let i = 0;
  let inPhp = false;
  const n = code.length;
  while (i < n) {
    if (!inPhp) {
      const openIdx = code.indexOf("<?php", i);
      const openShortIdx = code.indexOf("<?=", i);
      let nextOpen = -1;
      let tagLen = 0;
      if (openIdx !== -1 && (openShortIdx === -1 || openIdx <= openShortIdx)) { nextOpen = openIdx; tagLen = 5; }
      else if (openShortIdx !== -1) { nextOpen = openShortIdx; tagLen = 3; }
      if (nextOpen === -1) {
        out += code.slice(i).replace(/[^\n]/g, " ");
        break;
      }
      out += code.slice(i, nextOpen).replace(/[^\n]/g, " ");
      out += code.slice(nextOpen, nextOpen + tagLen).replace(/[^\n]/g, " ");
      i = nextOpen + tagLen;
      inPhp = true;
      continue;
    }
    const closeIdx = code.indexOf("?>", i);
    const segEnd = closeIdx === -1 ? n : closeIdx;
    out += sanitizePhpCode(code.slice(i, segEnd));
    i = segEnd;
    if (closeIdx !== -1) {
      out += code.slice(closeIdx, closeIdx + 2).replace(/[^\n]/g, " ");
      i = closeIdx + 2;
      inPhp = false;
    } else {
      break;
    }
  }
  return out;
}

function countParamsAhead(text, afterParenIdx) {
  let depth = 1;
  let i = afterParenIdx;
  let count = 0;
  let sawAny = false;
  while (i < text.length && depth > 0) {
    const ch = text[i];
    if (ch === "(") depth++;
    else if (ch === ")") { depth--; if (depth === 0) break; }
    else if (ch === "," && depth === 1) count++;
    else if (!/\s/.test(ch)) sawAny = true;
    i++;
  }
  return sawAny ? count + 1 : 0;
}

const TOKEN_RE = /\{|\}|;|function\s*&?\s*([A-Za-z_]\w*)?\s*\(|class\s+([A-Za-z_]\w*)|\b(if|elseif|for|foreach|while|case|catch)\b|(&&|\|\|)/g;

function analyzeSource(code, _filePath) {
  const sanitized = sanitizeForScanning(code);
  const totalLines = code.split("\n").length;
  const functions = [];
  const funcStack = [];
  const classStack = [];
  let braceDepth = 0;
  let line = 1;
  let lastIndex = 0;
  let pendingFunctionName;
  let pendingFunctionLine;
  let pendingFunctionParams;
  let pendingClassName;

  TOKEN_RE.lastIndex = 0;
  let m;
  while ((m = TOKEN_RE.exec(sanitized))) {
    if (m.index > lastIndex) {
      const chunk = sanitized.slice(lastIndex, m.index);
      for (let k = 0; k < chunk.length; k++) if (chunk[k] === "\n") line++;
    }
    lastIndex = TOKEN_RE.lastIndex;
    const matched = m[0];

    if (matched === "{") {
      braceDepth++;
      if (pendingFunctionName !== undefined) {
        funcStack.push({ name: pendingFunctionName, startLine: pendingFunctionLine, openDepth: braceDepth, complexity: 1, maxDepth: braceDepth, params: pendingFunctionParams || 0 });
        pendingFunctionName = undefined;
      } else if (pendingClassName !== undefined) {
        classStack.push({ name: pendingClassName, openDepth: braceDepth });
        pendingClassName = undefined;
      } else if (funcStack.length) {
        const top = funcStack[funcStack.length - 1];
        if (braceDepth > top.maxDepth) top.maxDepth = braceDepth;
      }
    } else if (matched === "}") {
      braceDepth = Math.max(0, braceDepth - 1);
      while (funcStack.length && funcStack[funcStack.length - 1].openDepth === braceDepth + 1) {
        const f = funcStack.pop();
        functions.push({
          name: f.name,
          line: f.startLine,
          endLine: line,
          lines: line - f.startLine + 1,
          params: f.params,
          complexity: f.complexity,
          nesting: Math.max(0, f.maxDepth - f.openDepth),
          language: "php",
        });
      }
      while (classStack.length && classStack[classStack.length - 1].openDepth === braceDepth + 1) {
        classStack.pop();
      }
    } else if (matched === ";") {
      pendingFunctionName = undefined;
      pendingClassName = undefined;
    } else if (/^function/.test(matched)) {
      const rawName = m[1];
      const cls = classStack.length ? `${classStack[classStack.length - 1].name}.` : "";
      pendingFunctionName = cls + (rawName || "(anonymous)");
      pendingFunctionLine = line;
      pendingFunctionParams = countParamsAhead(sanitized, TOKEN_RE.lastIndex);
    } else if (/^class/.test(matched)) {
      pendingClassName = m[2];
    } else {
      if (funcStack.length) funcStack[funcStack.length - 1].complexity += 1;
    }
  }

  return { functions, imports: [], gqlTemplates: [], usesDataLoader: false, parseError: null, lines: totalLines };
}

module.exports = { analyzeSource };
