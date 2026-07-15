"use strict";

/**
 * HTML static analysis via a lightweight tag-stack scanner (pure Node.js,
 * no extra deps). Computes DOM nesting depth, flags <img> tags missing
 * `alt`, duplicate `id` attributes, deprecated tags, inline event handlers
 * and inline styles, and document-level issues (missing lang / viewport /
 * title). Inline <script>/<style> bodies are handed to the JS/CSS
 * analyzers so inline code is measured too. Also used for .vue files.
 */

const jsAnalyzer = require("./jsAnalyzer");
const cssAnalyzer = require("./cssAnalyzer");

const VOID_ELEMENTS = new Set([
  "area", "base", "br", "col", "embed", "hr", "img", "input",
  "link", "meta", "param", "source", "track", "wbr",
]);

const DEPRECATED_TAGS = new Set([
  "font", "center", "marquee", "blink", "big", "strike", "tt",
  "frame", "frameset", "acronym", "applet", "basefont", "dir", "isindex",
]);

const TAG_RE = /<!--[\s\S]*?-->|<(\/)?([a-zA-Z][a-zA-Z0-9-]*)((?:\s[^<>]*)?)\/?>/g;

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

function analyzeSource(code, filePath) {
  const lineAt = buildLineAt(code);
  const functions = [];
  const cssIssues = [];
  const missingAltLines = [];
  const duplicateIds = [];
  const deprecatedTags = [];
  const inlineHandlerLines = [];
  const idLines = new Map();
  let maxDepth = 0;
  let tagCount = 0;
  let inlineHandlerCount = 0;
  let inlineStyleCount = 0;
  let hasHtmlTag = false;
  let htmlHasLang = false;
  let hasViewport = false;
  let hasTitle = false;
  const stack = [];

  TAG_RE.lastIndex = 0;
  let m;
  while ((m = TAG_RE.exec(code))) {
    const full = m[0];
    if (full.startsWith("<!--")) continue;

    const closing = !!m[1];
    const tagName = (m[2] || "").toLowerCase();
    const attrs = m[3] || "";
    const selfClosing = /\/>\s*$/.test(full);
    const startLine = lineAt(m.index);

    if (!closing && (tagName === "script" || tagName === "style") && !selfClosing) {
      const searchFrom = TAG_RE.lastIndex;
      const closeTagRe = new RegExp(`</${tagName}\\s*>`, "i");
      const closeMatch = closeTagRe.exec(code.slice(searchFrom));
      const innerEnd = closeMatch ? searchFrom + closeMatch.index : code.length;
      const inner = code.slice(searchFrom, innerEnd);
      const hasSrc = /\bsrc\s*=/i.test(attrs);

      if (tagName === "script" && !hasSrc && inner.trim()) {
        const jsResult = jsAnalyzer.analyzeSource(inner, `${filePath}.inline.js`);
        for (const fn of jsResult.functions) {
          functions.push({
            ...fn,
            name: `<script> ${fn.name}`,
            line: fn.line + startLine,
            endLine: fn.endLine + startLine,
            language: "javascript",
          });
        }
      } else if (tagName === "style" && inner.trim()) {
        const cssResult = cssAnalyzer.analyzeSource(inner);
        for (const issue of cssResult.issues) {
          cssIssues.push({ ...issue, line: (issue.line || 0) + startLine });
        }
      }

      const afterClose = closeMatch ? searchFrom + closeMatch.index + closeMatch[0].length : code.length;
      TAG_RE.lastIndex = afterClose;
      continue;
    }

    tagCount++;

    if (!closing && DEPRECATED_TAGS.has(tagName)) {
      deprecatedTags.push({ tag: tagName, line: startLine });
    }
    if (!closing && /\son\w+\s*=/i.test(attrs)) {
      inlineHandlerCount++;
      if (inlineHandlerLines.length < 20) inlineHandlerLines.push(startLine);
    }
    if (!closing && /\bstyle\s*=/i.test(attrs)) inlineStyleCount++;
    if (tagName === "html" && !closing) {
      hasHtmlTag = true;
      if (/\blang\s*=/i.test(attrs)) htmlHasLang = true;
    }
    if (tagName === "meta" && /name\s*=\s*["']viewport["']/i.test(attrs)) hasViewport = true;
    if (tagName === "title" && !closing) hasTitle = true;

    if (tagName === "img" && !closing && !/\balt\s*=/i.test(attrs)) {
      missingAltLines.push(startLine);
    }
    const idMatch = attrs.match(/\bid\s*=\s*["']([^"']+)["']/i);
    if (idMatch && !closing) {
      const idVal = idMatch[1];
      if (idLines.has(idVal)) duplicateIds.push({ id: idVal, lines: [idLines.get(idVal), startLine] });
      else idLines.set(idVal, startLine);
    }

    if (!closing && !VOID_ELEMENTS.has(tagName) && !selfClosing) {
      stack.push(tagName);
      if (stack.length > maxDepth) maxDepth = stack.length;
    } else if (closing) {
      const idx = stack.lastIndexOf(tagName);
      if (idx !== -1) stack.length = idx;
    }
  }

  const docIssues = [];
  if (hasHtmlTag) {
    if (!htmlHasLang) docIssues.push("missing-lang");
    if (!hasViewport) docIssues.push("missing-viewport");
    if (!hasTitle) docIssues.push("missing-title");
  }

  return {
    functions,
    cssIssues,
    maxDepth,
    tagCount,
    missingAltCount: missingAltLines.length,
    missingAltLines: missingAltLines.slice(0, 20),
    duplicateIds: duplicateIds.slice(0, 20),
    deprecatedTags: deprecatedTags.slice(0, 30),
    inlineHandlerCount,
    inlineHandlerLines,
    inlineStyleCount,
    docIssues,
    imports: [],
    gqlTemplates: [],
    usesDataLoader: false,
    parseError: null,
  };
}

module.exports = { analyzeSource };
