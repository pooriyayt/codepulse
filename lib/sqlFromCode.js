"use strict";

/**
 * Extracts SQL schema information from ordinary code files (PHP, JS, Python,
 * Java, ...) by statically scanning embedded SQL strings:
 *   - full CREATE TABLE statements found inside code
 *   - table names referenced by SELECT / INSERT / UPDATE / DELETE / JOIN
 *   - relations inferred from JOIN ... ON a.x = b.y (aliases are resolved)
 * No AI, no code execution - pure text analysis.
 */

const sqlAnalyzer = require("./sqlAnalyzer");

const SQL_HINT_RE = /\b(?:SELECT\s[\s\S]{0,300}?\bFROM\b|INSERT\s+INTO\b|UPDATE\s+[`"\w]+\s+SET\b|DELETE\s+FROM\b|CREATE\s+TABLE\b|(?:INNER|LEFT|RIGHT|FULL|CROSS)\s+JOIN\b)/i;

const NON_TABLE_WORDS = new Set([
  "select", "from", "where", "join", "on", "and", "or", "as", "set", "into",
  "values", "value", "table", "index", "if", "not", "exists", "dual", "order",
  "group", "by", "limit", "offset", "having", "union", "all", "distinct",
  "the", "this", "a", "an", "is", "in", "to", "of", "for", "with", "data",
  "true", "false", "null", "key", "using", "inner", "left", "right", "outer",
]);

const FROM_JOIN_RE = /\b(FROM|JOIN)\s+[`"\[]?([A-Za-z_]\w*)[`"\]]?(?:\s+(?:AS\s+)?([a-z]\w{0,15}))?/gi;
const INSERT_RE = /\bINSERT\s+(?:IGNORE\s+)?INTO\s+[`"\[]?([A-Za-z_]\w*)/gi;
const UPDATE_RE = /\bUPDATE\s+[`"\[]?([A-Za-z_]\w*)[`"\]]?\s+SET\b/gi;
const DELETE_RE = /\bDELETE\s+FROM\s+[`"\[]?([A-Za-z_]\w*)/gi;
const ON_RE = /\bON\s+[`"\[]?([A-Za-z_]\w*)[`"\]]?\s*\.\s*[`"\[]?([A-Za-z_]\w*)[`"\]]?\s*=\s*[`"\[]?([A-Za-z_]\w*)[`"\]]?\s*\.\s*[`"\[]?([A-Za-z_]\w*)/gi;
const QUERY_COUNT_RE = /\b(?:SELECT\s[\s\S]{0,300}?\bFROM\b|INSERT\s+INTO\b|UPDATE\s+[`"\w]+\s+SET\b|DELETE\s+FROM\b)/gi;

function lineAt(text, index) {
  let line = 1;
  const cap = Math.min(index, text.length);
  for (let i = 0; i < cap; i++) if (text[i] === "\n") line++;
  return line;
}

function isLikelyTable(name) {
  if (!name) return false;
  if (!/^[A-Za-z_]\w*$/.test(name)) return false;
  if (name.length < 2 || name.length > 40) return false;
  if (NON_TABLE_WORDS.has(name.toLowerCase())) return false;
  return true;
}

/**
 * @param files Array<{ path, content, language }>
 * @returns { tables, relations, queryCount, filesWithSql }
 */
function extractSqlFromCode(files) {
  const tables = [];
  const relations = [];
  const declared = new Set(); // table names parsed from CREATE TABLE (lowercase)
  const inferred = new Map(); // lowercase name -> { name, file, line }
  let queryCount = 0;
  let filesWithSql = 0;

  for (const f of files || []) {
    if (!f || f.language === "sql") continue;
    const content = String(f.content || "");
    if (content.length > 1024 * 1024) continue;
    if (!SQL_HINT_RE.test(content)) continue;
    filesWithSql += 1;

    // 1) Full CREATE TABLE statements embedded in code strings.
    //    Single quotes are converted to double quotes so the SQL parser's
    //    string blanking does not swallow SQL kept in '...' literals.
    if (/\bCREATE\s+TABLE\b/i.test(content)) {
      let parsed = null;
      try {
        parsed = sqlAnalyzer.analyzeSource(content.replace(/'/g, '"'));
      } catch (_err) {
        parsed = null;
      }
      if (parsed) {
        for (const t of parsed.tables || []) {
          const key = String(t.name).toLowerCase();
          if (declared.has(key)) continue;
          declared.add(key);
          tables.push({ ...t, file: f.path, fromCode: true });
        }
        for (const r of parsed.relations || []) {
          relations.push({ ...r, file: f.path, fromCode: true });
        }
      }
    }

    QUERY_COUNT_RE.lastIndex = 0;
    const qMatches = content.match(QUERY_COUNT_RE);
    queryCount += qMatches ? qMatches.length : 0;

    // 2) Tables referenced by queries (with a per-file alias map).
    const aliases = new Map();
    const seenHere = new Map();
    const note = (name, index, alias) => {
      if (!isLikelyTable(name)) return;
      const key = name.toLowerCase();
      aliases.set(key, name);
      if (alias && isLikelyTable(alias)) aliases.set(alias.toLowerCase(), name);
      if (!seenHere.has(key)) seenHere.set(key, { name, index });
    };

    FROM_JOIN_RE.lastIndex = 0;
    let m;
    while ((m = FROM_JOIN_RE.exec(content))) note(m[2], m.index, m[3]);
    for (const re of [INSERT_RE, UPDATE_RE, DELETE_RE]) {
      re.lastIndex = 0;
      while ((m = re.exec(content))) note(m[1], m.index, null);
    }

    for (const [key, info] of seenHere) {
      if (declared.has(key) || inferred.has(key)) continue;
      inferred.set(key, { name: info.name, file: f.path, line: lineAt(content, info.index) });
    }

    // 3) JOIN ... ON a.x = b.y  ->  relation (aliases resolved).
    ON_RE.lastIndex = 0;
    while ((m = ON_RE.exec(content))) {
      const left = aliases.get(m[1].toLowerCase()) || m[1];
      const right = aliases.get(m[3].toLowerCase()) || m[3];
      if (!isLikelyTable(left) || !isLikelyTable(right)) continue;
      if (left.toLowerCase() === right.toLowerCase()) continue;
      relations.push({
        from: left, fromColumn: m[2], to: right, toColumn: m[4],
        file: f.path, fromCode: true, inferred: true,
      });
    }
  }

  for (const t of inferred.values()) {
    tables.push({
      name: t.name, line: t.line, columns: [],
      file: t.file, fromCode: true, inferred: true,
    });
  }

  // De-duplicate relations.
  const seenRel = new Set();
  const uniqueRelations = relations.filter((r) => {
    const key = [r.from, r.fromColumn, r.to, r.toColumn].join("|").toLowerCase();
    if (seenRel.has(key)) return false;
    seenRel.add(key);
    return true;
  });

  return {
    tables: tables.slice(0, 150),
    relations: uniqueRelations.slice(0, 300),
    queryCount,
    filesWithSql,
  };
}

module.exports = { extractSqlFromCode };
