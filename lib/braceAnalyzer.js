"use strict";

/**
 * Generic analyzer for brace-delimited languages: Go, Rust, Java, C, C++,
 * C#, Kotlin and Swift. Pure Node.js - no dependencies. Strings and
 * comments are blanked first (preserving newlines), then a single token
 * scan tracks brace depth and attributes cyclomatic complexity and nesting
 * to the innermost open function. Heuristic by design: exact numbers would
 * need a real parser per language, but results are close for typical code.
 */

const KEYWORD_BLACKLIST = new Set([
  "if", "else", "for", "while", "switch", "case", "catch", "return", "do",
  "new", "sizeof", "typeof", "delete", "throw", "using", "lock", "foreach",
  "fixed", "when", "guard", "select", "defer", "assert", "synchronized",
]);

const COMPLEXITY_KEYWORDS = new Set(["if", "for", "while", "case", "catch", "foreach", "when", "guard"]);

const CONFIGS = {
  go: {
    mode: "pending",
    fn: "\\bfunc\\b(?:\\s*\\([^()]*\\))?\\s*(?<fname>[A-Za-z_]\\w*)?\\s*(?=\\()",
    cls: null,
    complexity: "\\b(?:if|for|case|select)\\b|&&|\\|\\|",
    singleQuote: true,
    backtick: true,
    hashLines: false,
  },
  rust: {
    mode: "pending",
    fn: "\\bfn\\s+(?<fname>[A-Za-z_]\\w*)",
    cls: "\\b(?:impl|trait)\\s+(?<clsname>[A-Za-z_][\\w:]*)",
    complexity: "\\b(?:if|while|for|loop|match)\\b|&&|\\|\\|",
    singleQuote: false,
    backtick: false,
    hashLines: true,
  },
  kotlin: {
    mode: "pending",
    fn: "\\bfun\\s+(?:<[^<>]*>\\s*)?(?:[\\w.]+\\.)?(?<fname>[A-Za-z_]\\w*)\\s*(?=\\()",
    cls: "\\b(?:class|interface|object)\\s+(?<clsname>[A-Za-z_]\\w*)",
    complexity: "\\b(?:if|for|while|when|catch)\\b|&&|\\|\\|",
    singleQuote: true,
    backtick: false,
    hashLines: false,
  },
  swift: {
    mode: "pending",
    fn: "\\bfunc\\s+(?<fname>[A-Za-z_]\\w*)",
    cls: "\\b(?:class|struct|enum|protocol|extension)\\s+(?<clsname>[A-Za-z_][\\w.]*)",
    complexity: "\\b(?:if|for|while|guard|case|catch)\\b|&&|\\|\\|",
    singleQuote: false,
    backtick: false,
    hashLines: false,
  },
  java: {
    mode: "inline",
    fn: "(?<fname>[A-Za-z_$]\\w*)\\s*\\((?<fargs>[^;{}()]*)\\)\\s*(?:throws\\s+[\\w.,\\s]*?)?\\{",
    cls: "\\b(?:class|interface|enum|record)\\s+(?<clsname>[A-Za-z_$]\\w*)",
    complexity: "\\b(?:if|for|while|case|catch)\\b|&&|\\|\\|",
    singleQuote: true,
    backtick: false,
    hashLines: false,
  },
  csharp: {
    mode: "inline",
    fn: "(?<fname>[A-Za-z_]\\w*)\\s*\\((?<fargs>[^;{}()]*)\\)\\s*(?:where\\s+[^{;]+)?\\{",
    cls: "\\b(?:class|interface|struct|enum|record)\\s+(?<clsname>[A-Za-z_]\\w*)",
    complexity: "\\b(?:if|for|foreach|while|case|catch)\\b|&&|\\|\\||\\?\\?",
    singleQuote: true,
    backtick: false,
    hashLines: false,
  },
  c: {
    mode: "inline",
    fn: "(?<fname>[A-Za-z_]\\w*)\\s*\\((?<fargs>[^;{}()]*)\\)\\s*\\{",
    cls: null,
    complexity: "\\b(?:if|for|while|case)\\b|&&|\\|\\|",
    singleQuote: true,
    backtick: false,
    hashLines: true,
  },
  cpp: {
    mode: "inline",
    fn: "(?<fname>[A-Za-z_][\\w:~]*)\\s*\\((?<fargs>[^;{}()]*)\\)\\s*(?:const\\b|noexcept\\b|override\\b|final\\b|\\s)*\\{",
    cls: "\\b(?:class|struct)\\s+(?<clsname>[A-Za-z_]\\w*)",
    complexity: "\\b(?:if|for|while|case|catch)\\b|&&|\\|\\|",
    singleQuote: true,
    backtick: false,
    hashLines: true,
  },
};

function sanitize(code, cfg) {
  let out = "";
  let i = 0;
  const n = code.length;
  while (i < n) {
    const ch = code[i];
    const next = i + 1 < n ? code[i + 1] : "";
    if (ch === "/" && next === "/") {
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
    if (ch === '"' || (ch === "'" && cfg.singleQuote) || (ch === "`" && cfg.backtick)) {
      const quote = ch;
      out += " ";
      i++;
      while (i < n && code[i] !== quote) {
        if (code[i] === "\\" && quote !== "`" && i + 1 < n) {
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
    out += ch;
    i++;
  }
  if (cfg.hashLines) {
    out = out.replace(/^[ \t]*#[^\n]*/gm, (mm) => mm.replace(/[^\n]/g, " "));
  }
  return out;
}

function countArgsText(argsText) {
  let s = String(argsText || "");
  for (let k = 0; k < 3; k++) {
    s = s.replace(/<[^<>]*>/g, "").replace(/\([^()]*\)/g, "").replace(/\[[^\[\]]*\]/g, "");
  }
  const parts = s.split(",").map((p) => p.trim()).filter(Boolean);
  return parts.length;
}

function countParamsFrom(text, fromIdx) {
  let i = fromIdx;
  const limit = Math.min(text.length, fromIdx + 400);
  while (i < limit && text[i] !== "(") {
    if (text[i] === "{" || text[i] === ";" || text[i] === "}") return 0;
    i++;
  }
  if (i >= limit || text[i] !== "(") return 0;
  let depth = 1;
  let start = i + 1;
  let j = start;
  while (j < text.length && depth > 0) {
    if (text[j] === "(") depth++;
    else if (text[j] === ")") depth--;
    j++;
  }
  return countArgsText(text.slice(start, j - 1));
}

function qualify(classStack, name) {
  if (!classStack.length) return name;
  return classStack[classStack.length - 1].name + "." + name;
}

function analyzeSource(code, _filePath, language) {
  const cfg = CONFIGS[language] || CONFIGS.java;
  const sanitized = sanitize(code, cfg);

  const parts = ["(?<open>\\{)", "(?<close>\\})", "(?<semi>;)"];
  if (cfg.cls) parts.push("(?<cls>" + cfg.cls + ")");
  parts.push("(?<fn>" + cfg.fn + ")");
  parts.push("(?<cx>" + cfg.complexity + ")");
  const re = new RegExp(parts.join("|"), "g");

  const functions = [];
  const funcStack = [];
  const classStack = [];
  let braceDepth = 0;
  let line = 1;
  let lastIndex = 0;
  let pendingFn = null;
  let pendingClass = null;

  function openBrace() {
    braceDepth++;
    if (pendingFn) {
      funcStack.push({
        name: pendingFn.name,
        startLine: pendingFn.line,
        openDepth: braceDepth,
        complexity: 1,
        maxDepth: braceDepth,
        params: pendingFn.params,
      });
      pendingFn = null;
      pendingClass = null;
      return;
    }
    if (pendingClass) {
      classStack.push({ name: pendingClass, openDepth: braceDepth });
      pendingClass = null;
      return;
    }
    if (funcStack.length) {
      const top = funcStack[funcStack.length - 1];
      if (braceDepth > top.maxDepth) top.maxDepth = braceDepth;
    }
  }

  function closeBrace(endLine) {
    braceDepth = Math.max(0, braceDepth - 1);
    while (funcStack.length && funcStack[funcStack.length - 1].openDepth === braceDepth + 1) {
      const f = funcStack.pop();
      functions.push({
        name: f.name,
        line: f.startLine,
        endLine,
        lines: endLine - f.startLine + 1,
        params: f.params,
        complexity: f.complexity,
        nesting: Math.max(0, f.maxDepth - f.openDepth),
        language,
      });
    }
    while (classStack.length && classStack[classStack.length - 1].openDepth === braceDepth + 1) {
      classStack.pop();
    }
  }

  let m;
  while ((m = re.exec(sanitized))) {
    for (let k = lastIndex; k < m.index; k++) if (sanitized[k] === "\n") line++;
    const startLine = line;
    let innerNewlines = 0;
    for (let k = 0; k < m[0].length; k++) if (m[0][k] === "\n") innerNewlines++;
    lastIndex = re.lastIndex;
    const g = m.groups || {};

    if (g.open !== undefined) {
      openBrace();
    } else if (g.close !== undefined) {
      closeBrace(startLine);
    } else if (g.semi !== undefined) {
      pendingFn = null;
      pendingClass = null;
    } else if (g.cls !== undefined) {
      pendingClass = g.clsname || "(anonymous)";
    } else if (g.fn !== undefined) {
      if (cfg.mode === "pending") {
        pendingFn = {
          name: qualify(classStack, g.fname || "(anonymous)"),
          line: startLine,
          params: countParamsFrom(sanitized, re.lastIndex),
        };
      } else {
        const name = g.fname || "";
        if (KEYWORD_BLACKLIST.has(name)) {
          if (funcStack.length && COMPLEXITY_KEYWORDS.has(name)) {
            funcStack[funcStack.length - 1].complexity += 1;
          }
          openBrace();
        } else {
          pendingFn = {
            name: qualify(classStack, name),
            line: startLine,
            params: countArgsText(g.fargs),
          };
          openBrace();
        }
      }
    } else if (g.cx !== undefined) {
      if (funcStack.length) funcStack[funcStack.length - 1].complexity += 1;
    }

    line += innerNewlines;
  }

  return { functions, imports: [], gqlTemplates: [], usesDataLoader: false, parseError: null };
}

module.exports = { analyzeSource, CONFIGS };
