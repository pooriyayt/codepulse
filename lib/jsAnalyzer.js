"use strict";

/**
 * JavaScript / TypeScript static analysis using @babel/parser.
 * Computes, per function: cyclomatic complexity, length, max nesting depth.
 * Also extracts import/require sources and gql`...` template literals.
 * Pure static analysis - no code execution.
 */

const parser = require("@babel/parser");

const FUNCTION_TYPES = new Set([
  "FunctionDeclaration",
  "FunctionExpression",
  "ArrowFunctionExpression",
  "ObjectMethod",
  "ClassMethod",
  "ClassPrivateMethod",
]);

// Node types that add +1 to cyclomatic complexity (branches)
const NESTING_TYPES = new Set([
  "IfStatement",
  "ForStatement",
  "ForInStatement",
  "ForOfStatement",
  "WhileStatement",
  "DoWhileStatement",
  "SwitchStatement",
  "TryStatement",
]);

const SKIP_KEYS = new Set([
  "loc", "start", "end", "range", "leadingComments", "trailingComments",
  "innerComments", "comments", "extra", "tokens", "parent",
]);

function buildParserOptions(filePath) {
  const plugins = [
    "classProperties",
    "classPrivateProperties",
    "classPrivateMethods",
    "dynamicImport",
    "importMeta",
    "topLevelAwait",
    "exportDefaultFrom",
    "exportNamespaceFrom",
    "objectRestSpread",
    "optionalChaining",
    "nullishCoalescingOperator",
    ["decorators", { decoratorsBeforeExport: true }],
  ];
  if (/\.tsx$/i.test(filePath)) plugins.push("typescript", "jsx");
  else if (/\.ts$/i.test(filePath)) plugins.push("typescript");
  else plugins.push("jsx");

  return {
    sourceType: "unambiguous",
    allowReturnOutsideFunction: true,
    allowAwaitOutsideFunction: true,
    errorRecovery: true,
    plugins,
  };
}

function forEachChild(node, callback) {
  for (const key of Object.keys(node)) {
    if (SKIP_KEYS.has(key)) continue;
    const value = node[key];
    if (Array.isArray(value)) {
      for (const item of value) {
        if (item && typeof item.type === "string") callback(item);
      }
    } else if (value && typeof value.type === "string") {
      callback(value);
    }
  }
}

/** Generic AST walker with an ancestors array (nearest parent last). */
function walk(node, visitor, ancestors) {
  visitor(node, ancestors);
  ancestors.push(node);
  forEachChild(node, (child) => walk(child, visitor, ancestors));
  ancestors.pop();
}

function keyName(key) {
  if (!key) return "(anonymous)";
  if (key.type === "Identifier") return key.name;
  if (key.type === "PrivateName" && key.id) return "#" + key.id.name;
  if (key.type === "StringLiteral" || key.type === "NumericLiteral") return String(key.value);
  return "(computed)";
}

function memberToString(node) {
  if (!node) return "";
  if (node.type === "Identifier") return node.name;
  if (node.type === "ThisExpression") return "this";
  if (node.type === "MemberExpression") {
    const prop = node.computed ? "[...]" : memberToString(node.property);
    return `${memberToString(node.object)}.${prop}`;
  }
  return "(expr)";
}

function resolveFunctionName(node, ancestors) {
  if (node.type === "FunctionDeclaration") {
    return node.id ? node.id.name : "(anonymous function)";
  }
  if (node.type === "ClassMethod" || node.type === "ClassPrivateMethod" || node.type === "ObjectMethod") {
    let className = "";
    for (let i = ancestors.length - 1; i >= 0; i--) {
      const anc = ancestors[i];
      if ((anc.type === "ClassDeclaration" || anc.type === "ClassExpression") && anc.id) {
        className = anc.id.name + ".";
        break;
      }
    }
    return className + keyName(node.key);
  }
  if (node.id && node.id.name) return node.id.name;

  const parent = ancestors[ancestors.length - 1];
  if (parent) {
    if (parent.type === "VariableDeclarator" && parent.id && parent.id.type === "Identifier") {
      return parent.id.name;
    }
    if (parent.type === "ObjectProperty") return keyName(parent.key);
    if (parent.type === "ClassProperty" || parent.type === "PropertyDefinition") return keyName(parent.key);
    if (parent.type === "AssignmentExpression" && parent.left) return memberToString(parent.left);
    if (parent.type === "CallExpression") {
      const callee = memberToString(parent.callee);
      return `(callback in ${callee || "call"})`;
    }
    if (parent.type === "ExportDefaultDeclaration") return "(default export)";
  }
  return "(anonymous)";
}

/**
 * Measures a single function: cyclomatic complexity and max nesting depth.
 * Nested functions are excluded (they are measured on their own).
 */
function measureFunction(fnNode) {
  let complexity = 1;
  let maxNesting = 0;

  function visit(node, depth) {
    forEachChild(node, (child) => {
      if (FUNCTION_TYPES.has(child.type)) return; // nested functions measured separately

      switch (child.type) {
        case "IfStatement":
        case "ConditionalExpression":
        case "ForStatement":
        case "ForInStatement":
        case "ForOfStatement":
        case "WhileStatement":
        case "DoWhileStatement":
        case "CatchClause":
        case "LogicalExpression":
          complexity += 1;
          break;
        case "SwitchCase":
          if (child.test) complexity += 1; // `default:` does not branch
          break;
        default:
          break;
      }

      let nextDepth = depth;
      if (NESTING_TYPES.has(child.type)) {
        nextDepth = depth + 1;
        if (nextDepth > maxNesting) maxNesting = nextDepth;
      }
      visit(child, nextDepth);
    });
  }

  visit(fnNode, 0);
  return { complexity, maxNesting };
}

function templateToString(quasi) {
  if (!quasi || !Array.isArray(quasi.quasis)) return "";
  return quasi.quasis.map((q) => (q.value && (q.value.cooked || q.value.raw)) || "").join(" ");
}

/**
 * Analyzes one source file.
 * @returns functions, imports, gqlTemplates, usesDataLoader, parseError
 */
function analyzeSource(code, filePath) {
  const result = {
    functions: [],
    imports: [],
    gqlTemplates: [],
    usesDataLoader: false,
    parseError: null,
  };

  let ast;
  try {
    ast = parser.parse(code, buildParserOptions(filePath));
  } catch (err) {
    result.parseError = err.message;
    return result;
  }

  if (/from\s+["']dataloader["']|require\s*\(\s*["']dataloader["']\s*\)|new\s+DataLoader\b/.test(code)) {
    result.usesDataLoader = true;
  }

  walk(ast.program, (node, ancestors) => {
    if (FUNCTION_TYPES.has(node.type)) {
      const { complexity, maxNesting } = measureFunction(node);
      const startLine = node.loc ? node.loc.start.line : 0;
      const endLine = node.loc ? node.loc.end.line : 0;
      result.functions.push({
        name: resolveFunctionName(node, ancestors),
        line: startLine,
        endLine,
        lines: endLine - startLine + 1,
        params: Array.isArray(node.params) ? node.params.length : 0,
        complexity,
        nesting: maxNesting,
      });
      return;
    }

    if (node.type === "ImportDeclaration" && node.source) {
      result.imports.push({ source: node.source.value, line: node.loc ? node.loc.start.line : 0 });
      return;
    }
    if ((node.type === "ExportNamedDeclaration" || node.type === "ExportAllDeclaration") && node.source) {
      result.imports.push({ source: node.source.value, line: node.loc ? node.loc.start.line : 0 });
      return;
    }
    if (node.type === "CallExpression") {
      const callee = node.callee;
      const arg = node.arguments && node.arguments[0];
      const isRequire = callee && callee.type === "Identifier" && callee.name === "require";
      const isDynamicImport = callee && callee.type === "Import";
      if ((isRequire || isDynamicImport) && arg && arg.type === "StringLiteral") {
        result.imports.push({ source: arg.value, line: node.loc ? node.loc.start.line : 0 });
      }
      return;
    }
    if (node.type === "TaggedTemplateExpression") {
      const tag = node.tag;
      const tagName =
        tag && tag.type === "Identifier"
          ? tag.name
          : tag && tag.type === "MemberExpression"
            ? memberToString(tag)
            : "";
      if (/^(gql|graphql)(\.|$)/i.test(tagName)) {
        result.gqlTemplates.push({
          content: templateToString(node.quasi),
          line: node.loc ? node.loc.start.line : 0,
        });
      }
    }
  }, []);

  return result;
}

module.exports = { analyzeSource, FUNCTION_TYPES };
