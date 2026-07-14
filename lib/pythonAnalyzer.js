"use strict";

/**
 * Python static analysis via indentation-based structural parsing.
 * No AST library is used (pure Node.js, no extra deps) - functions/classes
 * are discovered from `def`/`class` headers and indentation, and cyclomatic
 * complexity is approximated by counting decision keywords/operators inside
 * each function's own body (nested def/class bodies are measured separately
 * and excluded from the parent's count, matching the JS analyzer's approach).
 * Known limitation: comment/string stripping is heuristic (not a full
 * tokenizer), so unusual quoting inside comments can rarely mislead counts.
 */

const DEF_RE = /^(?:async\s+)?def\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/;
const CLASS_RE = /^class\s+([A-Za-z_][A-Za-z0-9_]*)/;
const KEYWORD_RE = /\b(if|elif|for|while|except|and|or)\b/g;

function stripPyComment(line) {
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === "'" && !inDouble) inSingle = !inSingle;
    else if (ch === '"' && !inSingle) inDouble = !inDouble;
    else if (ch === "#" && !inSingle && !inDouble) return line.slice(0, i);
  }
  return line;
}

function indentWidth(raw) {
  let width = 0;
  for (const ch of raw) {
    if (ch === " ") width += 1;
    else if (ch === "\t") width += 4;
    else break;
  }
  return width;
}

function buildRecords(code) {
  return code.split("\n").map((raw, idx) => {
    const stripped = stripPyComment(raw);
    const trimmed = stripped.trim();
    return { lineNo: idx + 1, indent: trimmed === "" ? null : indentWidth(raw), content: trimmed };
  });
}

function detectIndentUnit(records) {
  const indents = new Set();
  for (const r of records) if (r.indent !== null && r.indent > 0) indents.add(r.indent);
  const sorted = [...indents].sort((a, b) => a - b);
  if (sorted.length === 0) return 4;
  let minDiff = sorted[0];
  for (let i = 1; i < sorted.length; i++) minDiff = Math.min(minDiff, sorted[i] - sorted[i - 1]);
  return minDiff > 0 ? minDiff : 4;
}

function paramCount(headerLine) {
  const m = headerLine.match(/\(([^)]*)\)/);
  if (!m || !m[1].trim()) return 0;
  let depth = 0;
  let count = 1;
  for (const ch of m[1]) {
    if ("([{".includes(ch)) depth++;
    else if (")]}".includes(ch)) depth--;
    else if (ch === "," && depth === 0) count++;
  }
  return count;
}

function analyzeSource(code, _filePath) {
  const records = buildRecords(code);
  const indentUnit = detectIndentUnit(records);
  const functions = [];

  function findBodyEnd(startIdx, baseIndent) {
    let j = startIdx;
    let last = startIdx - 1;
    while (j < records.length) {
      const r = records[j];
      if (r.indent === null) { j++; continue; }
      if (r.indent > baseIndent) { last = j; j++; continue; }
      break;
    }
    return { endIdx: j, lastIdx: last };
  }

  function processScope(start, end, accumulator, classNamePrefix) {
    let i = start;
    while (i < end) {
      const r = records[i];
      if (r.indent === null) { i++; continue; }
      const defMatch = r.content.match(DEF_RE);
      const classMatch = !defMatch && r.content.match(CLASS_RE);

      if (defMatch) {
        const { endIdx, lastIdx } = findBodyEnd(i + 1, r.indent);
        const fnName = classNamePrefix ? `${classNamePrefix}.${defMatch[1]}` : defMatch[1];
        const startLine = r.lineNo;
        const endLine = lastIdx >= i ? records[lastIdx].lineNo : startLine;
        const acc = { complexity: 1, maxIndent: r.indent };
        processScope(i + 1, endIdx, acc, null);
        const nesting = Math.max(0, Math.round((acc.maxIndent - r.indent) / indentUnit));
        functions.push({
          name: fnName,
          line: startLine,
          endLine,
          lines: endLine - startLine + 1,
          params: paramCount(r.content),
          complexity: acc.complexity,
          nesting,
          language: "python",
        });
        i = endIdx;
        continue;
      }

      if (classMatch) {
        const { endIdx } = findBodyEnd(i + 1, r.indent);
        processScope(i + 1, endIdx, null, classMatch[1]);
        i = endIdx;
        continue;
      }

      if (accumulator) {
        const kw = r.content.match(KEYWORD_RE);
        if (kw) accumulator.complexity += kw.length;
        if (r.indent > accumulator.maxIndent) accumulator.maxIndent = r.indent;
      }
      i++;
    }
  }

  processScope(0, records.length, null, null);

  return { functions, imports: [], gqlTemplates: [], usesDataLoader: false, parseError: null };
}

module.exports = { analyzeSource };
