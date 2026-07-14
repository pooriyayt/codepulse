"use strict";

/**
 * GraphQL schema analysis - pure static parsing, no graphql-js dependency.
 * Sources:
 *  - .graphql / .gql SDL files
 *  - gql`...` template literals found in JS/TS files (extracted by jsAnalyzer)
 *  - schema.json introspection results
 * Produces: types, root operations, type-relation graph, design warnings
 * (oversized types, fields without resolvers, potential N+1 queries).
 */

const BUILTIN_SCALARS = new Set(["String", "Int", "Float", "Boolean", "ID"]);
const LARGE_TYPE_FIELDS = 20;

function stripSdl(source) {
  return String(source)
    .replace(/"""[\s\S]*?"""/g, " ")
    .replace(/"(?:[^"\\\n]|\\.)*"/g, " ")
    .replace(/#[^\n]*/g, " ");
}

function parseFieldType(typeStr) {
  const baseMatch = typeStr.match(/[A-Za-z_]\w*/);
  return {
    raw: typeStr.replace(/\s+/g, " ").trim(),
    baseType: baseMatch ? baseMatch[0] : "",
    isList: typeStr.includes("["),
    isNonNull: /!\s*$/.test(typeStr),
  };
}

/** Parses SDL text and merges definitions into the shared registry. */
function parseSdl(source, sourceFile, registry) {
  const text = stripSdl(source);

  // schema { query: RootQuery ... }
  const schemaMatch = text.match(/\bschema\s*(?:@[\w\s(),:="]*)?\{([^}]*)\}/);
  if (schemaMatch) {
    const rootRe = /\b(query|mutation|subscription)\s*:\s*([A-Za-z_]\w*)/g;
    let m;
    while ((m = rootRe.exec(schemaMatch[1])) !== null) {
      registry.rootTypes[m[1]] = m[2];
    }
  }

  // type / interface / input / enum definitions with a body
  const defRe = /\b(?:extend\s+)?(type|interface|input|enum)\s+([A-Za-z_]\w*)([^{]*)\{([^{}]*)\}/g;
  let match;
  while ((match = defRe.exec(text)) !== null) {
    const kind = match[1] === "input" ? "input" : match[1];
    const name = match[2];
    const header = match[3] || "";
    const body = match[4] || "";

    const type = getOrCreateType(registry, name, kind, sourceFile);

    const implementsMatch = header.match(/\bimplements\s+([\w\s&,]+)/);
    if (implementsMatch) {
      type.interfaces = [
        ...new Set([
          ...(type.interfaces || []),
          ...implementsMatch[1].split(/[\s&,]+/).filter(Boolean),
        ]),
      ];
    }

    if (kind === "enum") {
      const valueRe = /[A-Za-z_]\w*/g;
      let v;
      while ((v = valueRe.exec(body)) !== null) {
        if (!type.fields.some((f) => f.name === v[0])) {
          type.fields.push({ name: v[0], type: "", baseType: "", isList: false, isEnumValue: true });
        }
      }
      continue;
    }

    // fieldName(args): [Type!]!
    const fieldRe = /([A-Za-z_]\w*)\s*(\(([^()]*(?:\([^()]*\)[^()]*)*)\))?\s*:\s*([\[\]!\s]*[A-Za-z_]\w*[\[\]!\s]*)/g;
    let f;
    while ((f = fieldRe.exec(body)) !== null) {
      const fieldName = f[1];
      const parsed = parseFieldType(f[4]);
      if (!type.fields.some((existing) => existing.name === fieldName)) {
        type.fields.push({
          name: fieldName,
          type: parsed.raw,
          baseType: parsed.baseType,
          isList: parsed.isList,
          hasArgs: Boolean(f[2] && f[3] && f[3].trim()),
        });
      }
    }
  }

  // union U = A | B
  const unionRe = /\bunion\s+([A-Za-z_]\w*)\s*=\s*([\w\s|]+)/g;
  while ((match = unionRe.exec(text)) !== null) {
    const type = getOrCreateType(registry, match[1], "union", sourceFile);
    type.unionMembers = [
      ...new Set([...(type.unionMembers || []), ...match[2].split(/[|\s]+/).filter(Boolean)]),
    ];
  }

  // scalar Custom
  const scalarRe = /\bscalar\s+([A-Za-z_]\w*)/g;
  while ((match = scalarRe.exec(text)) !== null) {
    getOrCreateType(registry, match[1], "scalar", sourceFile);
  }
}

function getOrCreateType(registry, name, kind, sourceFile) {
  if (!registry.types.has(name)) {
    registry.types.set(name, { name, kind, fields: [], sourceFiles: [] });
  }
  const type = registry.types.get(name);
  if (kind && type.kind === "type" && kind !== "type") {
    // keep the first concrete kind
  } else if (kind) {
    type.kind = type.kind || kind;
  }
  if (sourceFile && !type.sourceFiles.includes(sourceFile)) type.sourceFiles.push(sourceFile);
  return type;
}

function unwrapIntrospectionType(typeRef) {
  let isList = false;
  let current = typeRef;
  while (current) {
    if (current.kind === "LIST") isList = true;
    if (!current.ofType) break;
    current = current.ofType;
  }
  return { baseType: (current && current.name) || "", isList };
}

/** Parses a schema.json introspection file into the registry. */
function parseIntrospection(jsonText, sourceFile, registry) {
  let data;
  try {
    data = JSON.parse(jsonText);
  } catch (_err) {
    return false;
  }
  const schema = (data && data.data && data.data.__schema) || (data && data.__schema);
  if (!schema || !Array.isArray(schema.types)) return false;

  if (schema.queryType && schema.queryType.name) registry.rootTypes.query = schema.queryType.name;
  if (schema.mutationType && schema.mutationType.name) registry.rootTypes.mutation = schema.mutationType.name;
  if (schema.subscriptionType && schema.subscriptionType.name) registry.rootTypes.subscription = schema.subscriptionType.name;

  const kindMap = {
    OBJECT: "type",
    INTERFACE: "interface",
    INPUT_OBJECT: "input",
    ENUM: "enum",
    UNION: "union",
    SCALAR: "scalar",
  };

  for (const t of schema.types) {
    if (!t || !t.name || t.name.startsWith("__")) continue;
    if (t.kind === "SCALAR" && BUILTIN_SCALARS.has(t.name)) continue;
    const type = getOrCreateType(registry, t.name, kindMap[t.kind] || "type", sourceFile);

    const fields = t.fields || t.inputFields || [];
    for (const field of fields) {
      if (type.fields.some((existing) => existing.name === field.name)) continue;
      const { baseType, isList } = unwrapIntrospectionType(field.type);
      type.fields.push({
        name: field.name,
        type: baseType + (isList ? " (list)" : ""),
        baseType,
        isList,
        hasArgs: Boolean(field.args && field.args.length),
      });
    }
    if (t.kind === "ENUM" && Array.isArray(t.enumValues)) {
      for (const v of t.enumValues) {
        if (!type.fields.some((existing) => existing.name === v.name)) {
          type.fields.push({ name: v.name, type: "", baseType: "", isList: false, isEnumValue: true });
        }
      }
    }
    if (t.kind === "UNION" && Array.isArray(t.possibleTypes)) {
      type.unionMembers = t.possibleTypes.map((p) => p.name).filter(Boolean);
    }
  }
  return true;
}

/** Extracts resolver key names from resolver source files (heuristic). */
function extractResolverKeys(content) {
  const keys = new Set();
  // `fieldName: (...` / `fieldName(args) {` / `async fieldName(`
  const keyRe = /^\s*(?:async\s+)?([A-Za-z_]\w*)\s*[:(]/gm;
  let m;
  while ((m = keyRe.exec(content)) !== null) keys.add(m[1]);
  // exports.fieldName = / const fieldName = async (
  const assignRe = /\b(?:exports\.|const\s+|let\s+|var\s+)([A-Za-z_]\w*)\s*=\s*(?:async\b|\(|function\b)/g;
  while ((m = assignRe.exec(content)) !== null) keys.add(m[1]);
  return keys;
}

/**
 * @param {object} input
 * @param {Array<{path: string, content: string}>} input.sdlFiles
 * @param {Array<{file: string, content: string, line: number}>} input.templates
 * @param {Array<{path: string, content: string}>} input.schemaJsonFiles
 * @param {Array<{path: string, content: string}>} input.codeFiles - all JS/TS files (for resolver + DataLoader detection)
 * @param {boolean} input.usesDataLoader
 */
function analyzeGraphql(input) {
  const registry = { types: new Map(), rootTypes: {} };
  const sources = [];

  for (const f of input.sdlFiles) {
    parseSdl(f.content, f.path, registry);
    sources.push({ path: f.path, kind: "SDL file" });
  }
  for (const t of input.templates) {
    // Only count templates that actually define schema types
    if (/\b(type|interface|input|enum|union|scalar|schema)\s+[A-Za-z_{]/.test(t.content)) {
      parseSdl(t.content, `${t.file}:${t.line}`, registry);
      sources.push({ path: `${t.file} (line ${t.line})`, kind: "gql template" });
    }
  }
  for (const f of input.schemaJsonFiles) {
    if (parseIntrospection(f.content, f.path, registry)) {
      sources.push({ path: f.path, kind: "introspection JSON" });
    }
  }

  const hasSchemaContent =
    Object.keys(registry.rootTypes).length > 0 ||
    [...registry.types.values()].some((t) => t.fields.length > 0);
  if (registry.types.size === 0 || !hasSchemaContent) return { present: false };

  const rootTypes = {
    query: registry.rootTypes.query || (registry.types.has("Query") ? "Query" : null),
    mutation: registry.rootTypes.mutation || (registry.types.has("Mutation") ? "Mutation" : null),
    subscription: registry.rootTypes.subscription || (registry.types.has("Subscription") ? "Subscription" : null),
  };
  const rootTypeNames = new Set(Object.values(rootTypes).filter(Boolean));

  const typeNames = new Set(registry.types.keys());
  const isObjectLike = (name) => {
    const t = registry.types.get(name);
    return Boolean(t && (t.kind === "type" || t.kind === "interface"));
  };

  // --- Resolver detection (only if a resolvers/ folder exists) ---
  const resolverFiles = input.codeFiles.filter((f) => /(^|\/)resolvers?(\/|\.)/i.test(f.path));
  const resolverKeys = new Set();
  for (const f of resolverFiles) {
    for (const key of extractResolverKeys(f.content)) resolverKeys.add(key);
  }
  const hasResolversDir = resolverFiles.length > 0;

  // --- Build type list, relations, warnings ---
  const types = [];
  const relations = [];
  const largeTypes = [];
  const missingResolvers = [];
  const nPlusOne = [];

  for (const type of registry.types.values()) {
    const fieldCount = type.fields.length;
    const isRoot = rootTypeNames.has(type.name);
    const tooLarge = !isRoot && type.kind !== "enum" && fieldCount > LARGE_TYPE_FIELDS;
    if (tooLarge) largeTypes.push({ name: type.name, fieldCount });

    for (const field of type.fields) {
      if (field.baseType && typeNames.has(field.baseType) && !BUILTIN_SCALARS.has(field.baseType)) {
        const targetKind = registry.types.get(field.baseType).kind;
        if (targetKind !== "scalar") {
          relations.push({ from: type.name, to: field.baseType, field: field.name, isList: Boolean(field.isList) });
        }
      }
      // Potential N+1: a non-root object type exposing a list of another object type
      if (!isRoot && isObjectLike(type.name) && field.isList && isObjectLike(field.baseType)) {
        nPlusOne.push({
          type: type.name,
          field: field.name,
          returns: `[${field.baseType}]`,
          mitigated: Boolean(input.usesDataLoader),
        });
      }
      // Missing resolvers: root operation fields with no matching resolver key
      if (isRoot && hasResolversDir && !resolverKeys.has(field.name)) {
        missingResolvers.push({ type: type.name, field: field.name, returns: field.type });
      }
    }

    if (type.unionMembers) {
      for (const member of type.unionMembers) {
        if (typeNames.has(member)) {
          relations.push({ from: type.name, to: member, field: "(union member)", isList: false });
        }
      }
    }
    if (type.interfaces) {
      for (const iface of type.interfaces) {
        if (typeNames.has(iface)) {
          relations.push({ from: type.name, to: iface, field: "(implements)", isList: false });
        }
      }
    }

    types.push({
      name: type.name,
      kind: type.kind,
      fieldCount,
      isRoot,
      tooLarge,
      fields: type.fields.slice(0, 60),
      sourceFiles: type.sourceFiles,
    });
  }

  types.sort((a, b) => {
    if (a.isRoot !== b.isRoot) return a.isRoot ? -1 : 1;
    return b.fieldCount - a.fieldCount;
  });

  const operationsOf = (rootName) => {
    if (!rootName || !registry.types.has(rootName)) return [];
    return registry.types.get(rootName).fields.map((f) => ({
      name: f.name,
      returns: f.type,
      hasResolver: hasResolversDir ? resolverKeys.has(f.name) : null,
    }));
  };

  return {
    present: true,
    sources,
    rootTypes,
    stats: {
      typeCount: types.filter((t) => t.kind === "type" && !t.isRoot).length,
      interfaceCount: types.filter((t) => t.kind === "interface").length,
      inputCount: types.filter((t) => t.kind === "input").length,
      enumCount: types.filter((t) => t.kind === "enum").length,
      unionCount: types.filter((t) => t.kind === "union").length,
      scalarCount: types.filter((t) => t.kind === "scalar").length,
      queryCount: operationsOf(rootTypes.query).length,
      mutationCount: operationsOf(rootTypes.mutation).length,
      subscriptionCount: operationsOf(rootTypes.subscription).length,
    },
    operations: {
      queries: operationsOf(rootTypes.query),
      mutations: operationsOf(rootTypes.mutation),
      subscriptions: operationsOf(rootTypes.subscription),
    },
    types,
    relations,
    warnings: {
      largeTypes,
      missingResolvers,
      nPlusOne,
    },
    hasResolversDir,
    hasDataLoader: Boolean(input.usesDataLoader),
  };
}

module.exports = { analyzeGraphql, LARGE_TYPE_FIELDS };
