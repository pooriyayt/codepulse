"use strict";

/**
 * Duplicate code detection.
 * Approach: normalize source lines (strip comments/whitespace/trivial lines),
 * hash sliding windows of N normalized lines, then group identical hashes
 * across the project and extend matching windows into maximal blocks.
 * Pure text/math - no AI.
 */

const crypto = require("crypto");

const WINDOW = 6; // normalized lines per comparison window
const MIN_BLOCK_CHARS = 60; // ignore trivial matches
const MAX_BLOCKS = 100;

function sha1(text) {
  return crypto.createHash("sha1").update(text).digest("hex");
}

const TRIVIAL_LINES = new Set([
  "{", "}", "};", "});", ")", ");", "]", "];", "});", "},", "else {", "} else {", "try {", "return;", "break;", "continue;", "default:",
]);

/**
 * Normalizes code into significant lines while keeping original line numbers.
 */
function normalizeLines(code) {
  // Remove block comments but preserve line structure
  const withoutBlocks = code.replace(/\/\*[\s\S]*?\*\//g, (match) =>
    match.replace(/[^\n]/g, " ")
  );
  const lines = withoutBlocks.split("\n");
  const normalized = [];
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    // Strip // comments (avoid protocol strings like http://)
    line = line.replace(/(^|[^:\\])\/\/.*$/, "$1");
    line = line.trim().replace(/\s+/g, " ");
    if (!line || TRIVIAL_LINES.has(line)) continue;
    normalized.push({ text: line, lineNo: i + 1 });
  }
  return normalized;
}

/**
 * @param {Array<{path: string, content: string}>} files
 * @returns duplication report: blocks + duplicated-line percentage
 */
function findDuplicates(files) {
  const norms = new Map(); // path -> normalized lines
  const windowHashes = new Map(); // path -> array of window hashes (index-aligned)
  const hashIndex = new Map(); // hash -> [{file, idx}]
  let totalNormalizedLines = 0;

  for (const file of files) {
    const norm = normalizeLines(file.content);
    norms.set(file.path, norm);
    totalNormalizedLines += norm.length;
    const hashes = [];
    for (let i = 0; i + WINDOW <= norm.length; i++) {
      const text = norm
        .slice(i, i + WINDOW)
        .map((l) => l.text)
        .join("\n");
      if (text.length < MIN_BLOCK_CHARS) {
        hashes.push(null);
        continue;
      }
      const h = sha1(text);
      hashes.push(h);
      if (!hashIndex.has(h)) hashIndex.set(h, []);
      hashIndex.get(h).push({ file: file.path, idx: i });
    }
    windowHashes.set(file.path, hashes);
  }

  const hashAt = (file, idx) => {
    const arr = windowHashes.get(file);
    if (!arr || idx < 0 || idx >= arr.length) return null;
    return arr[idx];
  };

  const used = new Set(); // `${file}:${windowIdx}` already part of a reported block
  const blocks = [];

  // Deterministic order: iterate insertion order of hashIndex
  for (const [, occs] of hashIndex) {
    if (occs.length < 2) continue;
    if (occs.some((o) => used.has(`${o.file}:${o.idx}`))) continue;

    // Extend the match forward while ALL occurrences keep matching
    let extra = 0;
    for (let s = 0; ; s++) {
      const h0 = hashAt(occs[0].file, occs[0].idx + s);
      if (s > 0) {
        if (!h0) break;
        const allMatch = occs.every((o) => hashAt(o.file, o.idx + s) === h0);
        if (!allMatch) break;
        // occurrences of the same block within one file must not overlap themselves
        extra = s;
      }
      occs.forEach((o) => used.add(`${o.file}:${o.idx + s}`));
      if (s === 0) extra = 0;
    }

    const blockLen = WINDOW + extra;
    const occurrences = occs.map((o) => {
      const norm = norms.get(o.file);
      return {
        file: o.file,
        startLine: norm[o.idx].lineNo,
        endLine: norm[Math.min(o.idx + blockLen - 1, norm.length - 1)].lineNo,
      };
    });

    const norm0 = norms.get(occs[0].file);
    const snippet = norm0
      .slice(occs[0].idx, occs[0].idx + Math.min(blockLen, 12))
      .map((l) => l.text)
      .join("\n");

    blocks.push({
      normalizedLines: blockLen,
      occurrenceCount: occurrences.length,
      occurrences,
      snippet,
      truncatedSnippet: blockLen > 12,
    });
  }

  blocks.sort((a, b) => b.normalizedLines * b.occurrenceCount - a.normalizedLines * a.occurrenceCount);

  // Duplicated-line percentage: distinct normalized lines covered by duplicate windows
  const dupLineKeys = new Set();
  for (const key of used) {
    const sep = key.lastIndexOf(":");
    const file = key.slice(0, sep);
    const idx = Number(key.slice(sep + 1));
    for (let j = 0; j < WINDOW; j++) dupLineKeys.add(`${file}:${idx + j}`);
  }
  const percentage = totalNormalizedLines > 0 ? (dupLineKeys.size / totalNormalizedLines) * 100 : 0;

  return {
    percentage: Math.round(percentage * 10) / 10,
    totalBlocks: blocks.length,
    blocks: blocks.slice(0, MAX_BLOCKS),
  };
}

module.exports = { findDuplicates, WINDOW };
