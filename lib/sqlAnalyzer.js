"use strict";

/**
 * SQL static analysis (pure Node.js, heuristic). Extracts CREATE TABLE
 * schemas and foreign-key relations (inline REFERENCES, table constraints
 * and ALTER TABLE ... FOREIGN KEY), and flags risky statements: SELECT *,
 * DELETE / UPDATE without WHERE, and heavily-joined queries. The extracted
 * tables + relations feed the "SQL Schema" ER graph in the dashboard.
 */

function blank(code) {
  let out = "";
  let i = 0;
  const n = code.length;
  while (i < n) {
    const ch = code[i];
    const next = i + 1 < n ? code[i + 1] : "";
    if (ch === "-" && next === "-") {
      while (i < n && code[i] !== "\n") { out += " "; i++; }
      continue;
    }
    if (ch === "/" && next === "*") {
      out += "  ";
      i += 2;
      while (i < n && !(code[i] === "*" && code[i + 1] === "/")) {
        out += code[i] === "\n" ? "\n" : " ";
        i++;
      }
      if (i < n) { out += "  "; i += 2; }
      continue;
    }
    if (ch === "'") {
      out += " ";
      i++;
      while (i < n && code[i] !== "'") {
        out += code[i] === "\n" ? "\n" : " ";
        i++;
      }
      if (i < n) { out += " "; i++; }
      continue;
    }
    out += ch;
    i++;
  }
  return out;
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

function cleanIdent(raw) {
  return String(raw || "").split(",")[0].trim().replace(/[`"\[\]]/g, "");
}

const CONSTRAINT_START_RE = /^(CONSTRAINT|PRIMARY\s|FOREIGN\s|UNIQUE\b|KEY\b|INDEX\b|CHECK\b|FULLTEXT\b|SPATIAL\b)/i;
const CREATE_TABLE_RE = /\bCREATE\s+(?:TEMPORARY\s+|TEMP\s+)?TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?[`"\[]?([\w.]+)[`"\]]?\s*\(/gi;
const ALTER_FK_RE = /\bALTER\s+TABLE\s+(?:ONLY\s+)?[`"\[]?([\w.]+)[`"\]]?[^;]*?FOREIGN\s+KEY\s*\(([^)]*)\)\s*REFERENCES\s+[`"\[]?([\w.]+)[`"\]]?\s*(?:\(([^)]*)\))?/gi;

function splitTopLevel(body) {
  const parts = [];
  let depth = 0;
  let current = "";
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      parts.push(current);
      current = "";
      continue;
    }
    current += ch;
  }
  if (current.trim()) parts.push(current);
  return parts;
}

function analyzeSource(code, _filePath) {
  const s = blank(code);
  const lineAt = buildLineAt(s);
  const tables = [];
  const relations = [];
  const issues = [];

  // ---- CREATE TABLE ----
  CREATE_TABLE_RE.lastIndex = 0;
  let m;
  while ((m = CREATE_TABLE_RE.exec(s))) {
    const tableName = cleanIdent(m[1]);
    const openIdx = CREATE_TABLE_RE.lastIndex - 1;
    let depth = 1;
    let j = openIdx + 1;
    while (j < s.length && depth > 0) {
      if (s[j] === "(") depth++;
      else if (s[j] === ")") depth--;
      j++;
    }
    const body = s.slice(openIdx + 1, j - 1);
    const columns = [];

    for (const rawDef of splitTopLevel(body)) {
      const d = rawDef.trim().replace(/\s+/g, " ");
      if (!d) continue;
      if (CONSTRAINT_START_RE.test(d)) {
        const fk = d.match(/FOREIGN\s+KEY\s*\(([^)]*)\)\s*REFERENCES\s+[`"\[]?([\w.]+)[`"\]]?\s*(?:\(([^)]*)\))?/i);
        if (fk) {
          relations.push({
            from: tableName,
            fromColumn: cleanIdent(fk[1]),
            to: cleanIdent(fk[2]),
            toColumn: fk[3] ? cleanIdent(fk[3]) : null,
          });
        }
        continue;
      }
      const cm = d.match(/^[`"\[]?(\w+)[`"\]]?\s+([A-Za-z]+(?:\s*\([^)]*\))?)/);
      if (!cm) continue;
      const col = { name: cm[1], type: cm[2].toUpperCase().replace(/\s+/g, "") };
      if (/PRIMARY\s+KEY/i.test(d)) col.primaryKey = true;
      const ref = d.match(/\bREFERENCES\s+[`"\[]?([\w.]+)[`"\]]?\s*(?:\(([^)]*)\))?/i);
      if (ref) {
        relations.push({
          from: tableName,
          fromColumn: col.name,
          to: cleanIdent(ref[1]),
          toColumn: ref[2] ? cleanIdent(ref[2]) : null,
        });
      }
      columns.push(col);
    }

    tables.push({ name: tableName, line: lineAt(m.index), columns });
  }

  // ---- ALTER TABLE ... FOREIGN KEY ----
  ALTER_FK_RE.lastIndex = 0;
  while ((m = ALTER_FK_RE.exec(s))) {
    relations.push({
      from: cleanIdent(m[1]),
      fromColumn: cleanIdent(m[2]),
      to: cleanIdent(m[3]),
      toColumn: m[4] ? cleanIdent(m[4]) : null,
    });
  }

  // ---- statement-level checks ----
  let statementCount = 0;
  let selectCount = 0;
  let offset = 0;
  for (const stmt of s.split(";")) {
    const stmtStart = offset;
    offset += stmt.length + 1;
    const trimmed = stmt.trim();
    if (!trimmed) continue;
    statementCount++;
    const line = lineAt(stmtStart + (stmt.length - stmt.trimStart().length));

    if (/\bSELECT\b/i.test(trimmed)) selectCount++;
    if (/\bSELECT\s+\*/i.test(trimmed)) {
      issues.push({ type: "select-star", line });
    }
    if (/^DELETE\s+FROM\b/i.test(trimmed) && !/\bWHERE\b/i.test(trimmed)) {
      issues.push({ type: "delete-no-where", line, table: cleanIdent((trimmed.match(/^DELETE\s+FROM\s+[`"\[]?([\w.]+)/i) || [])[1]) });
    }
    if (/^UPDATE\b/i.test(trimmed) && !/\bWHERE\b/i.test(trimmed)) {
      issues.push({ type: "update-no-where", line, table: cleanIdent((trimmed.match(/^UPDATE\s+(?:ONLY\s+)?[`"\[]?([\w.]+)/i) || [])[1]) });
    }
    const joins = (trimmed.match(/\bJOIN\b/gi) || []).length;
    if (joins >= 4) {
      issues.push({ type: "many-joins", line, count: joins });
    }
  }

  return {
    functions: [],
    tables,
    relations,
    issues: issues.slice(0, 100),
    statementCount,
    selectCount,
    imports: [],
    gqlTemplates: [],
    usesDataLoader: false,
    parseError: null,
  };
}

module.exports = { analyzeSource };
