import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { parse } from "@babel/parser";

/**
 * What a pattern built at run time interpolates is usually a name or a list of names, so an
 * interpolation that cannot be read from the file stands in as this. The structure around it,
 * which is what decides backtracking, is checked as written.
 */
const UNKNOWN_INTERPOLATION = "x";

/** Every .ts file under `directory`, as paths relative to `root`. */
export function listTypeScriptFiles(root, directory) {
  return readdirSync(join(root, directory), { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".ts"))
    .map((entry) => relative(root, join(entry.parentPath, entry.name)))
    .sort();
}

/** Top-level `const NAME = …` initializers of a file, so a pattern can refer to them by name. */
function readTopLevelConstants(program) {
  const constants = new Map();
  for (const statement of program.body) {
    const declaration = statement.type === "ExportNamedDeclaration" ? statement.declaration : statement;
    if (declaration?.type !== "VariableDeclaration" || declaration.kind !== "const") continue;
    for (const declarator of declaration.declarations) {
      if (declarator.id.type !== "Identifier" || !declarator.init) continue;
      const initializer =
        declarator.init.type === "TSAsExpression" ? declarator.init.expression : declarator.init;
      constants.set(declarator.id.name, initializer);
    }
  }
  return constants;
}

function readStringList(node, constants) {
  if (node?.type === "Identifier" && constants.has(node.name))
    return readStringList(constants.get(node.name), constants);
  if (node?.type !== "ArrayExpression") return undefined;
  const values = [];
  for (const element of node.elements) {
    if (element?.type === "SpreadElement") {
      const spread = readStringList(element.argument, constants);
      if (spread === undefined) return undefined;
      values.push(...spread);
    } else if (element?.type === "StringLiteral") {
      values.push(element.value);
    } else {
      return undefined;
    }
  }
  return values;
}

/** PATTERN.source, where PATTERN is a regular expression literal in the same file. */
function readRegExpSource(node, constants) {
  const literal = node.object.type === "Identifier" ? constants.get(node.object.name) : undefined;
  const isSource = node.property.type === "Identifier" && node.property.name === "source";
  return isSource && literal?.type === "RegExpLiteral" ? literal.pattern : UNKNOWN_INTERPOLATION;
}

/** LIST.join("|") or [...A, ...B].join("|"), where the lists hold string literals. */
function readJoinedList(node, constants) {
  const callee = node.callee;
  const isJoin = callee.type === "MemberExpression" && callee.property.name === "join";
  const list = isJoin ? readStringList(callee.object, constants) : undefined;
  const separator = node.arguments[0]?.type === "StringLiteral" ? node.arguments[0].value : ",";
  return list ? list.join(separator) : UNKNOWN_INTERPOLATION;
}

/** A template literal, read cooked, or raw when it is tagged String.raw. */
function readTemplate(node, constants, text = "cooked") {
  return node.quasis
    .map((quasi, index) => {
      const expression = node.expressions[index];
      return quasi.value[text] + (expression ? readString(expression, constants) : "");
    })
    .join("");
}

function isStringRaw(tag) {
  return (
    tag.type === "MemberExpression" &&
    tag.object.type === "Identifier" &&
    tag.object.name === "String" &&
    tag.property.type === "Identifier" &&
    tag.property.name === "raw"
  );
}

/** The text a string expression evaluates to, with what cannot be read standing in as UNKNOWN_INTERPOLATION. */
function readString(node, constants) {
  switch (node?.type) {
    case "StringLiteral":
      return node.value;
    case "TemplateLiteral":
      return readTemplate(node, constants);
    case "TaggedTemplateExpression":
      return isStringRaw(node.tag) ? readTemplate(node.quasi, constants, "raw") : UNKNOWN_INTERPOLATION;
    case "BinaryExpression":
      return node.operator === "+"
        ? readString(node.left, constants) + readString(node.right, constants)
        : UNKNOWN_INTERPOLATION;
    case "Identifier": {
      const constant = constants.get(node.name);
      return constant ? readString(constant, constants) : UNKNOWN_INTERPOLATION;
    }
    case "MemberExpression":
      return readRegExpSource(node, constants);
    case "CallExpression":
      return readJoinedList(node, constants);
    default:
      return UNKNOWN_INTERPOLATION;
  }
}

/** `new RegExp(…, …)` or `RegExp(…)`, read as far as the file allows. */
function readRegExpConstruction(node, constants) {
  if (node.type !== "NewExpression" && node.type !== "CallExpression") return undefined;
  if (node.callee.type !== "Identifier" || node.callee.name !== "RegExp") return undefined;
  const [patternArgument, flagsArgument] = node.arguments;
  if (!patternArgument) return undefined;
  return {
    source: readString(patternArgument, constants),
    flags: flagsArgument ? readString(flagsArgument, constants) : "",
    builtAtRunTime: patternArgument.type !== "StringLiteral",
  };
}

function visit(node, constants, found) {
  if (Array.isArray(node)) {
    for (const child of node) visit(child, constants, found);
    return;
  }
  if (node === null || typeof node !== "object" || typeof node.type !== "string") return;
  if (node.type === "RegExpLiteral") {
    found.push({ source: node.pattern, flags: node.flags, line: node.loc.start.line, builtAtRunTime: false });
  } else {
    const construction = readRegExpConstruction(node, constants);
    if (construction) found.push({ ...construction, line: node.loc.start.line });
  }
  for (const [key, child] of Object.entries(node)) {
    if (key !== "loc" && key !== "leadingComments" && key !== "trailingComments")
      visit(child, constants, found);
  }
}

/** The regular expressions in one TypeScript file, literals and run-time constructions alike. */
export function findRegularExpressions(root, file) {
  const { program } = parse(readFileSync(join(root, file), "utf8"), {
    sourceType: "module",
    plugins: ["typescript"],
  });
  const found = [];
  visit(program, readTopLevelConstants(program), found);
  return found.map((expression) => ({ file, ...expression }));
}
