import fs from "node:fs";
import path from "node:path";

export function analyzeRepositoryGlobalJson(repoRoot) {
  const fileName = "global.json";
  const filePath = path.join(repoRoot, fileName);
  if (!fs.readdirSync(repoRoot).includes(fileName)) return { present: false, blockers: [] };
  if (fs.lstatSync(filePath).isSymbolicLink()) {
    return { present: true, path: fileName, blockers: ["symbolic global.json path"] };
  }
  if (!fs.lstatSync(filePath).isFile()) {
    return { present: true, path: fileName, blockers: ["global.json is not a regular file"] };
  }

  let value;
  try {
    value = JSON.parse(stripJsonComments(fs.readFileSync(filePath, "utf8")));
  } catch {
    return { present: true, path: fileName, blockers: ["malformed global.json"] };
  }

  if (!isObject(value)) {
    return { present: true, path: fileName, blockers: ["global.json root is not an object"] };
  }
  const blockers = [];
  const test = value.test;
  const sdk = value.sdk;
  if (test !== undefined && !isObject(test)) blockers.push("global.json test metadata is not an object");
  if (sdk !== undefined && !isObject(sdk)) blockers.push("global.json SDK metadata is not an object");
  const runner = isObject(test) && typeof test.runner === "string" ? test.runner : undefined;
  const sdkVersion = isObject(sdk) && typeof sdk.version === "string" ? sdk.version : undefined;
  const sdkMajor = sdkVersion?.match(/^(\d+)\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/)?.[1];
  if (isObject(test) && test.runner !== undefined && typeof test.runner !== "string") {
    blockers.push("global.json test runner is not a string");
  }
  if (isObject(sdk) && sdk.version !== undefined && !sdkMajor) {
    blockers.push("global.json SDK version is not a literal version");
  }

  return {
    present: true,
    path: fileName,
    runner,
    sdkVersion,
    sdkMajor: sdkMajor === undefined ? undefined : Number(sdkMajor),
    blockers
  };
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function stripJsonComments(source) {
  let result = "";
  let inString = false;
  let escaped = false;
  let lineComment = false;
  let blockComment = false;

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    const next = source[index + 1];
    if (lineComment) {
      if (character === "\n" || character === "\r") {
        lineComment = false;
        result += character;
      } else result += " ";
      continue;
    }
    if (blockComment) {
      if (character === "*" && next === "/") {
        result += "  ";
        blockComment = false;
        index += 1;
      } else result += character === "\n" || character === "\r" ? character : " ";
      continue;
    }
    if (inString) {
      result += character;
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === "\"") inString = false;
      continue;
    }
    if (character === "\"") {
      inString = true;
      result += character;
    } else if (character === "/" && next === "/") {
      lineComment = true;
      result += "  ";
      index += 1;
    } else if (character === "/" && next === "*") {
      blockComment = true;
      result += "  ";
      index += 1;
    } else result += character;
  }
  return result;
}
