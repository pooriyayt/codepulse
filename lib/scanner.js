"use strict";

const fs = require("fs");
const path = require("path");

const LANGUAGE_BY_EXT = {
  ".js": "javascript", ".jsx": "javascript", ".mjs": "javascript", ".cjs": "javascript",
  ".ts": "typescript", ".tsx": "typescript",
  ".py": "python",
  ".php": "php", ".phtml": "php",
  ".html": "html", ".htm": "html", ".vue": "html",
  ".css": "css", ".scss": "css", ".less": "css",
  ".go": "go",
  ".rs": "rust",
  ".java": "java",
  ".c": "c", ".h": "c",
  ".cpp": "cpp", ".cc": "cpp", ".cxx": "cpp", ".hpp": "cpp", ".hh": "cpp",
  ".cs": "csharp",
  ".kt": "kotlin", ".kts": "kotlin",
  ".swift": "swift",
  ".rb": "ruby",
  ".sql": "sql",
};
const CODE_EXTENSIONS = new Set(Object.keys(LANGUAGE_BY_EXT));
const GRAPHQL_EXTENSIONS = new Set([".graphql", ".gql"]);

// Any *.json file whose name suggests it may hold a GraphQL introspection
// result (e.g. schema.json, graph.json, introspection.json, my-schema.json).
// The GraphQL analyzer validates the actual content (__schema structure),
// so unrelated JSON files that happen to match are safely ignored.
const INTROSPECTION_JSON_RE = /(schema|introspection|graph)/i;

const IGNORED_DIRS = new Set([
  "node_modules", ".git", ".svn", ".hg", "dist", "build", "out", "coverage",
  "vendor", ".next", ".nuxt", ".cache", ".turbo", "__pycache__", ".idea", ".vscode",
  "venv", ".venv", "env",
  "target", "obj", "bin", "Pods", "DerivedData", ".gradle", "_build", "cmake-build-debug",
]);

const MAX_FILE_SIZE = 1024 * 1024; // 1 MB per code file
const MAX_JSON_SIZE = 5 * 1024 * 1024; // 5 MB for introspection JSON (big schemas)
const MAX_FILES = 5000;

/**
 * Recursively scans a project directory and collects analyzable files.
 * Skips node_modules, .git, build output, minified bundles and huge files.
 */
function scanProject(rootDir) {
  const result = { code: [], graphql: [], schemaJson: [], skipped: 0 };
  const stack = [rootDir];
  let count = 0;

  while (stack.length > 0) {
    const dir = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (_err) {
      continue;
    }
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (IGNORED_DIRS.has(entry.name) || entry.name.startsWith(".")) continue;
        stack.push(fullPath);
        continue;
      }
      if (!entry.isFile()) continue;
      if (count >= MAX_FILES) {
        result.skipped += 1;
        continue;
      }

      const ext = path.extname(entry.name).toLowerCase();
      const isIntrospectionCandidate =
        ext === ".json" && INTROSPECTION_JSON_RE.test(entry.name);
      if (!CODE_EXTENSIONS.has(ext) && !GRAPHQL_EXTENSIONS.has(ext) && !isIntrospectionCandidate) continue;
      if (/\.(min|bundle)\.(js|cjs|mjs|css)$/i.test(entry.name)) {
        result.skipped += 1;
        continue;
      }
      if (/\.d\.ts$/i.test(entry.name)) continue; // type declarations: not runtime code

      let stat;
      try {
        stat = fs.statSync(fullPath);
      } catch (_err) {
        continue;
      }
      if (stat.size > (isIntrospectionCandidate ? MAX_JSON_SIZE : MAX_FILE_SIZE)) {
        result.skipped += 1;
        continue;
      }

      const relPath = path.relative(rootDir, fullPath).split(path.sep).join("/");
      const record = { path: relPath, fullPath };
      if (isIntrospectionCandidate) result.schemaJson.push(record);
      else if (GRAPHQL_EXTENSIONS.has(ext)) result.graphql.push(record);
      else {
        record.language = LANGUAGE_BY_EXT[ext] || "javascript";
        result.code.push(record);
      }
      count += 1;
    }
  }

  return result;
}

module.exports = { scanProject, CODE_EXTENSIONS, IGNORED_DIRS, LANGUAGE_BY_EXT };
