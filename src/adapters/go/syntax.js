import { parser } from "@lezer/go";

const CONTROL_SCOPES = new Set([
  "ForStatement",
  "IfStatement",
  "SwitchStatement",
  "TypeSwitchStatement"
]);

export function analyzeGoSyntax(content, maskedContent = content) {
  const functionRanges = collectTopLevelGoFunctionRanges(maskedContent);
  const bindingPositions = new Map();
  const parsedFunctions = new Map();
  let parsedFile;

  function analyzeFunction(range) {
    let analysis = parsedFunctions.get(range.from);
    if (!analysis) {
      const prefix = "package scope\n";
      analysis = {
        prefixLength: prefix.length,
        syntax: parseGoSyntax(`${prefix}${content.slice(range.from, range.to)}`)
      };
      parsedFunctions.set(range.from, analysis);
    }
    return analysis;
  }

  return {
    reliable: true,
    hasVisibleBinding(name, position) {
      const callRange = functionRanges.find((range) => position >= range.from && position < range.to);
      const candidates = bindingPositions.get(name) ?? collectPotentialGoBindingPositions(maskedContent, name);
      bindingPositions.set(name, candidates);
      if (candidates.some((candidate) => !functionRanges.some((range) =>
        candidate >= range.from && candidate < range.to
      ))) return true;
      if (!callRange || !candidates.some((candidate) => candidate >= callRange.from && candidate < callRange.to)) {
        return false;
      }

      const analysis = analyzeFunction(callRange);
      if (!analysis.syntax.reliable) return true;
      return analysis.syntax.hasVisibleBinding(
        name,
        analysis.prefixLength + position - callRange.from
      );
    },
    ownsBinding(name, declarationPosition, position) {
      const callRange = functionRanges.find((range) => position >= range.from && position < range.to);
      if (!callRange || declarationPosition < callRange.from || declarationPosition >= callRange.to) return false;
      const analysis = analyzeFunction(callRange);
      if (!analysis.syntax.reliable) return false;
      const binding = analysis.syntax.bindingAt(
        name,
        analysis.prefixLength + position - callRange.from
      );
      return binding?.position === analysis.prefixLength + declarationPosition - callRange.from;
    },
    callableBody(symbol) {
      parsedFile ??= parseGoSyntax(content);
      if (!parsedFile.reliable) return undefined;
      const matches = parsedFile.callables.filter((callable) =>
        callable.kind === symbol.kind &&
        callable.name === symbol.name &&
        (callable.receiverType ?? "") === (symbol.receiverType ?? "")
      );
      return matches.length === 1 ? matches[0].body : undefined;
    }
  };
}

function parseGoSyntax(content) {
  const tree = parser.parse(content);
  const declarations = [];
  const callables = [];
  let reliable = true;

  visit(tree.topNode, (node) => {
    if (node.type.isError) reliable = false;
    if (["FunctionDecl", "MethodDecl"].includes(node.name)) {
      const callable = describeCallable(content, node);
      if (callable) callables.push(callable);
    }
    if (node.name === "DefName") {
      const declaration = describeDeclaration(content, node, tree.topNode);
      if (declaration && declaration.name !== "_") declarations.push(declaration);
      return;
    }

    if (node.name === "TypeParam") {
      const name = firstNamedChild(node, "TypeName");
      const body = enclosingFunctionBody(node);
      if (name && body) {
        declarations.push({
          name: content.slice(name.from, name.to),
          position: name.from,
          activeFrom: body.from,
          scopeFrom: body.from,
          scopeTo: body.to
        });
      }
      return;
    }

  });

  return {
    reliable,
    callables,
    hasVisibleBinding(name, position) {
      return Boolean(resolveBinding(declarations, name, position));
    },
    bindingAt(name, position) {
      return resolveBinding(declarations, name, position);
    }
  };
}

function resolveBinding(declarations, name, position) {
  return declarations
    .filter((declaration) =>
      declaration.name === name &&
      position >= declaration.activeFrom &&
      position >= declaration.scopeFrom &&
      position < declaration.scopeTo
    )
    .sort((left, right) =>
      (left.scopeTo - left.scopeFrom) - (right.scopeTo - right.scopeFrom) ||
      right.activeFrom - left.activeFrom ||
      right.position - left.position
    )[0];
}

function describeCallable(content, node) {
  const body = lastNamedChild(node, "Block");
  if (!body) return undefined;
  if (node.name === "FunctionDecl") {
    const name = firstNamedChild(node, "DefName");
    return name ? {
      kind: "function",
      name: content.slice(name.from, name.to),
      body: { from: body.from, to: body.to }
    } : undefined;
  }

  const name = firstNamedChild(node, "FieldName");
  const receiver = firstNamedChild(node, "Parameters");
  const receiverType = receiver && firstDescendant(receiver, "TypeName");
  return name && receiverType ? {
    kind: "method",
    name: content.slice(name.from, name.to),
    receiverType: content.slice(receiverType.from, receiverType.to),
    body: { from: body.from, to: body.to }
  } : undefined;
}

function collectTopLevelGoFunctionRanges(maskedContent) {
  const ranges = [];
  for (const match of maskedContent.matchAll(/(?:^|\n)[ \t]*func\b/g)) {
    const start = match.index + (match[0].startsWith("\n") ? 1 : 0);
    const bodyStart = findGoFunctionBody(maskedContent, match.index + match[0].length);
    if (bodyStart === undefined) continue;
    const end = skipBalancedGoBlock(maskedContent, bodyStart);
    if (end !== undefined) ranges.push({ from: start, to: end });
  }
  return ranges;
}

function collectPotentialGoBindingPositions(maskedContent, name) {
  const escaped = escapeRegex(name);
  const positions = [];
  for (const pattern of [
    new RegExp(`\\b${escaped}\\s*:=`, "g"),
    new RegExp(`\\b(?:var|const|type)\\s+${escaped}\\b`, "g"),
    new RegExp(`(?:\\(|,)\\s*${escaped}[ \\t]+\\*?[A-Za-z_][A-Za-z0-9_.]*`, "g")
  ]) {
    for (const match of maskedContent.matchAll(pattern)) {
      positions.push(match.index + match[0].indexOf(name));
    }
  }
  return positions;
}

function findGoFunctionBody(content, start) {
  let parentheses = 0;
  let brackets = 0;
  for (let cursor = start; cursor < content.length; cursor += 1) {
    if (content[cursor] === "(") parentheses += 1;
    else if (content[cursor] === ")") parentheses = Math.max(0, parentheses - 1);
    else if (content[cursor] === "[") brackets += 1;
    else if (content[cursor] === "]") brackets = Math.max(0, brackets - 1);
    else if (content[cursor] === "{" && parentheses === 0 && brackets === 0) return cursor;
    else if (content[cursor] === "\n" && parentheses === 0 && brackets === 0) return undefined;
  }
  return undefined;
}

function skipBalancedGoBlock(content, start) {
  let depth = 0;
  for (let cursor = start; cursor < content.length; cursor += 1) {
    if (content[cursor] === "{") depth += 1;
    else if (content[cursor] === "}") {
      depth -= 1;
      if (depth === 0) return cursor + 1;
    }
  }
  return undefined;
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function describeDeclaration(content, node, root) {
  const parent = node.parent;
  if (!parent || ["ImportSpec", "PackageClause"].includes(parent.name)) return undefined;

  if (parent.name === "FunctionDecl") {
    return fileDeclaration(content, node, root);
  }

  if (["Parameter", "Parameters"].includes(parent.name) || enclosingParameter(node)) {
    const body = enclosingFunctionBody(node);
    if (!body) return undefined;
    return scopedDeclaration(content, node, body, body.from);
  }

  const control = enclosingControlDeclaration(node);
  if (control) return scopedDeclaration(content, node, control, declarationContainer(node).to);

  const block = enclosingNode(node, "Block");
  if (block) return scopedDeclaration(content, node, block, declarationContainer(node).to);

  if (["ConstSpec", "TypeSpec", "VarSpec"].includes(parent.name) || enclosingSpec(node)) {
    return fileDeclaration(content, node, root);
  }

  return undefined;
}

function fileDeclaration(content, node, root) {
  return {
    name: content.slice(node.from, node.to),
    position: node.from,
    activeFrom: root.from,
    scopeFrom: root.from,
    scopeTo: root.to
  };
}

function scopedDeclaration(content, node, scope, activeFrom) {
  return {
    name: content.slice(node.from, node.to),
    position: node.from,
    activeFrom,
    scopeFrom: scope.from,
    scopeTo: scope.to
  };
}

function declarationContainer(node) {
  let current = node.parent;
  while (current && ["VarSpec", "ConstSpec", "TypeSpec"].includes(current.name)) current = current.parent;
  return current ?? node;
}

function enclosingControlDeclaration(node) {
  let current = node.parent;
  while (current && current.name !== "Block" && current.name !== "SourceFile") {
    if (CONTROL_SCOPES.has(current.name)) return current;
    current = current.parent;
  }
  return undefined;
}

function enclosingFunctionBody(node) {
  let current = node.parent;
  while (current) {
    if (["FunctionDecl", "MethodDecl", "FunctionLiteral"].includes(current.name)) {
      return lastNamedChild(current, "Block");
    }
    current = current.parent;
  }
  return undefined;
}

function enclosingParameter(node) {
  let current = node.parent;
  while (current && !["FunctionDecl", "MethodDecl", "FunctionLiteral", "Block", "SourceFile"].includes(current.name)) {
    if (current.name === "Parameter") return current;
    current = current.parent;
  }
  return undefined;
}

function enclosingSpec(node) {
  let current = node.parent;
  while (current && current.name !== "SourceFile" && current.name !== "Block") {
    if (["ConstSpec", "TypeSpec", "VarSpec"].includes(current.name)) return current;
    current = current.parent;
  }
  return undefined;
}

function enclosingNode(node, name) {
  let current = node.parent;
  while (current) {
    if (current.name === name) return current;
    current = current.parent;
  }
  return undefined;
}

function visit(node, callback) {
  callback(node);
  for (let child = node.firstChild; child; child = child.nextSibling) visit(child, callback);
}

function namedChildren(node) {
  const children = [];
  for (let child = node.firstChild; child; child = child.nextSibling) {
    if (!child.type.isAnonymous) children.push(child);
  }
  return children;
}

function firstNamedChild(node, name) {
  return namedChildren(node).find((child) => child.name === name);
}

function firstDescendant(node, name) {
  if (node.name === name) return node;
  for (const child of namedChildren(node)) {
    const match = firstDescendant(child, name);
    if (match) return match;
  }
  return undefined;
}

function lastNamedChild(node, name) {
  return namedChildren(node).filter((child) => child.name === name).at(-1);
}
