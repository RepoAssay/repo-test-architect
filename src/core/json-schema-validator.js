/**
 * Small, dependency-free JSON Schema validator for the subset of draft 2020-12
 * used by the published schemas in `schemas/`.
 *
 * Schemas are compiled once into closures. Any keyword outside the supported
 * set makes compilation throw, so a schema can never silently skip a rule.
 * Error messages never include instance values; they only name the failing
 * path and the expectation taken from the (trusted) schema. Property names are
 * echoed only when the schema declares them; any other key is redacted.
 *
 * Unlike the draft 2020-12 default, `format` is asserted rather than treated as
 * an annotation: a string that fails a supported format is a validation error.
 */

const ANNOTATION_KEYWORDS = new Set([
  "$schema",
  "$id",
  "$comment",
  "title",
  "description",
  "examples",
  "default",
  "deprecated",
  "readOnly",
  "writeOnly"
]);

const VALIDATION_KEYWORDS = new Set([
  "$ref",
  "$defs",
  "type",
  "const",
  "enum",
  "oneOf",
  "anyOf",
  "allOf",
  "not",
  "required",
  "properties",
  "additionalProperties",
  "items",
  "minItems",
  "maxItems",
  "uniqueItems",
  "minLength",
  "maxLength",
  "pattern",
  "format",
  "minimum",
  "maximum",
  "exclusiveMinimum",
  "exclusiveMaximum"
]);

const SUPPORTED_TYPES = new Set(["object", "array", "string", "integer", "number", "boolean", "null"]);

// RFC 3339 §5.6 date-time; calendar and leap-second rules are checked in isRfc3339DateTime.
const DATE_TIME_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})[Tt](\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:[Zz]|([+-])(\d{2}):(\d{2}))$/;

const FORMAT_CHECKS = new Map([["date-time", isRfc3339DateTime]]);

const SAFE_PROPERTY_NAME = /^[A-Za-z_$][A-Za-z0-9_$-]{0,63}$/;
const REDACTED_PROPERTY_SEGMENT = "[<property>]";
const MAX_RENDERED_PATH_LENGTH = 240;
// Bounds nested schema applications so deep or cyclic in-process values fail with
// a validation error instead of exhausting the call stack.
const MAX_VALIDATION_DEPTH = 512;

/**
 * @typedef {{ path: string, message: string }} SchemaValidationIssue
 * @typedef {(value: unknown, options?: { rootPath?: string, maxErrors?: number }) => SchemaValidationIssue[]} CompiledSchemaValidator
 */

/**
 * Compile a JSON schema into a reusable validator function.
 *
 * @param {object} schema
 * @returns {CompiledSchemaValidator}
 */
export function compileSchema(schema) {
  const compiler = new SchemaCompiler(schema);
  const validateRoot = compiler.compile(schema, "#");

  return (value, { rootPath = "$", maxErrors = Infinity } = {}) => {
    const context = { errors: [], maxErrors, depth: 0 };

    try {
      validateRoot(value, { segment: rootPath }, context);
    } catch (error) {
      if (!(error instanceof DepthExceeded)) throw error;
      fail(context, error.path, `exceeds maximum validation depth of ${MAX_VALIDATION_DEPTH}`);
    }

    return context.errors;
  };
}

/**
 * Convenience wrapper that compiles (and caches per schema object) then validates.
 *
 * @param {unknown} value
 * @param {object} schema
 * @param {{ rootPath?: string, maxErrors?: number }} [options]
 * @returns {SchemaValidationIssue[]}
 */
export function validateAgainstSchema(value, schema, options) {
  let validator = compiledSchemaCache.get(schema);

  if (!validator) {
    validator = compileSchema(schema);
    compiledSchemaCache.set(schema, validator);
  }

  return validator(value, options);
}

/**
 * @param {SchemaValidationIssue} issue
 * @returns {string}
 */
export function formatSchemaIssue(issue) {
  return `${issue.path}: ${issue.message}`;
}

const compiledSchemaCache = new WeakMap();

class SchemaCompiler {
  constructor(rootSchema) {
    this.rootSchema = rootSchema;
    this.compiled = new Map();
  }

  compile(schema, location) {
    if (schema === true) return () => true;
    if (schema === false) {
      return (value, path, context) => fail(context, path, "no value allowed");
    }

    if (!isPlainObject(schema)) {
      throw new Error(`Invalid JSON schema at ${location}: expected an object or boolean.`);
    }

    // References always resolve against the root, so a nested schema resource would be misread.
    if (schema !== this.rootSchema && Object.hasOwn(schema, "$id")) {
      throw new Error(`Unsupported nested JSON schema $id at ${location}; only the root schema may declare $id.`);
    }

    const cached = this.compiled.get(schema);
    if (cached) return cached;

    // Register a forwarding stub first so recursive $refs terminate.
    let implementation;
    const forward = (value, path, context) => implementation(value, path, context);
    this.compiled.set(schema, forward);

    implementation = withDepthGuard(this.compileKeywords(schema, location));
    this.compiled.set(schema, implementation);
    return implementation;
  }

  compileKeywords(schema, location) {
    for (const keyword of Object.keys(schema)) {
      if (!ANNOTATION_KEYWORDS.has(keyword) && !VALIDATION_KEYWORDS.has(keyword)) {
        throw new Error(`Unsupported JSON schema keyword "${keyword}" at ${location}.`);
      }
    }

    if (schema.$defs !== undefined) {
      for (const [name, definition] of Object.entries(schema.$defs)) {
        this.compile(definition, `${location}/$defs/${name}`);
      }
    }

    if (schema.$ref !== undefined) {
      const target = this.resolveRef(schema.$ref, location);
      const siblingKeywords = Object.keys(schema).filter(
        (keyword) => keyword !== "$ref" && keyword !== "$defs" && !ANNOTATION_KEYWORDS.has(keyword)
      );
      const validateRef = this.compile(target, schema.$ref);

      if (siblingKeywords.length === 0) return validateRef;

      const { $ref, ...rest } = schema;
      const validateRest = this.compileKeywords(rest, location);
      return (value, path, context) => {
        const refValid = validateRef(value, path, context);
        if (!refValid && isFull(context)) return false;
        return validateRest(value, path, context) && refValid;
      };
    }

    const checks = [];
    const typeCheck = this.compileType(schema, location);

    if (schema.const !== undefined) {
      const expected = schema.const;
      const label = JSON.stringify(expected);
      checks.push((value, path, context) => deepEqual(value, expected) || fail(context, path, `expected const ${label}`));
    }

    if (schema.enum !== undefined) {
      if (!Array.isArray(schema.enum) || schema.enum.length === 0) {
        throw new Error(`Invalid JSON schema at ${location}: enum must be a non-empty array.`);
      }

      const options = schema.enum;
      const primitiveOptions = options.every((option) => option === null || typeof option !== "object")
        ? new Set(options)
        : undefined;
      const label = options.map((option) => JSON.stringify(option)).join(", ");
      checks.push((value, path, context) => {
        const matched = primitiveOptions
          ? primitiveOptions.has(value)
          : options.some((option) => deepEqual(value, option));
        return matched || fail(context, path, `expected one of ${label}`);
      });
    }

    this.compileCombinators(schema, location, checks);
    this.compileObjectKeywords(schema, location, checks);
    this.compileArrayKeywords(schema, location, checks);
    this.compileStringKeywords(schema, location, checks);
    this.compileNumberKeywords(schema, location, checks);

    return (value, path, context) => {
      let valid = true;

      if (typeCheck && !typeCheck(value, path, context)) {
        return false;
      }

      for (const check of checks) {
        if (!check(value, path, context)) {
          valid = false;
          if (isFull(context)) return false;
        }
      }

      return valid;
    };
  }

  compileType(schema, location) {
    if (schema.type === undefined) return undefined;

    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    for (const type of types) {
      if (!SUPPORTED_TYPES.has(type)) {
        throw new Error(`Unsupported JSON schema type "${type}" at ${location}.`);
      }
    }

    const label = types.join(" or ");
    return (value, path, context) => {
      if (types.some((type) => matchesType(value, type))) return true;
      return fail(context, path, `expected ${label}, got ${describeType(value)}`);
    };
  }

  compileCombinators(schema, location, checks) {
    if (schema.oneOf !== undefined) {
      const branches = this.compileBranches(schema.oneOf, `${location}/oneOf`);
      checks.push((value, path, context) => {
        const matchCount = branches.filter((branch) => matchesSilently(branch, value, path, context)).length;
        return matchCount === 1 || fail(context, path, `expected exactly one matching oneOf schema, matched ${matchCount}`);
      });
    }

    if (schema.anyOf !== undefined) {
      const branches = this.compileBranches(schema.anyOf, `${location}/anyOf`);
      checks.push((value, path, context) =>
        branches.some((branch) => matchesSilently(branch, value, path, context)) ||
        fail(context, path, "expected at least one matching anyOf schema")
      );
    }

    if (schema.allOf !== undefined) {
      const branches = this.compileBranches(schema.allOf, `${location}/allOf`);
      checks.push((value, path, context) => {
        let valid = true;
        for (const branch of branches) {
          if (!branch(value, path, context)) {
            valid = false;
            if (isFull(context)) return false;
          }
        }
        return valid;
      });
    }

    if (schema.not !== undefined) {
      const negated = this.compile(schema.not, `${location}/not`);
      checks.push((value, path, context) =>
        !matchesSilently(negated, value, path, context) || fail(context, path, "expected value not to match the not schema")
      );
    }
  }

  compileBranches(branches, location) {
    if (!Array.isArray(branches) || branches.length === 0) {
      throw new Error(`Invalid JSON schema at ${location}: expected a non-empty array.`);
    }

    return branches.map((branch, index) => this.compile(branch, `${location}/${index}`));
  }

  compileObjectKeywords(schema, location, checks) {
    const hasObjectKeywords =
      schema.properties !== undefined ||
      schema.required !== undefined ||
      schema.additionalProperties !== undefined;

    if (!hasObjectKeywords) return;

    const required = schema.required ?? [];
    const properties = new Map(
      Object.entries(schema.properties ?? {}).map(([key, propertySchema]) => [
        key,
        this.compile(propertySchema, `${location}/properties/${key}`)
      ])
    );
    const additional = schema.additionalProperties;
    const validateAdditional =
      additional === undefined || additional === true
        ? undefined
        : additional === false
          ? false
          : this.compile(additional, `${location}/additionalProperties`);

    checks.push((value, path, context) => {
      if (!matchesType(value, "object")) return true;

      let valid = true;

      for (const key of required) {
        if (!Object.hasOwn(value, key) || value[key] === undefined) {
          valid = fail(context, childPath(path, key, true), "required property missing");
          if (isFull(context)) return false;
        }
      }

      for (const key of Object.keys(value)) {
        // Match JSON semantics: an own property holding undefined is treated as absent.
        if (value[key] === undefined) continue;

        const validateProperty = properties.get(key);
        let propertyValid = true;

        if (validateProperty) {
          propertyValid = validateProperty(value[key], childPath(path, key, true), context);
        } else if (validateAdditional === false) {
          propertyValid = fail(context, childPath(path, key, false), "additional property not allowed");
        } else if (validateAdditional) {
          propertyValid = validateAdditional(value[key], childPath(path, key, false), context);
        }

        if (!propertyValid) {
          valid = false;
          if (isFull(context)) return false;
        }
      }

      return valid;
    });
  }

  compileArrayKeywords(schema, location, checks) {
    const { minItems, maxItems, uniqueItems } = schema;
    const validateItem = schema.items === undefined ? undefined : this.compile(schema.items, `${location}/items`);

    if (minItems === undefined && maxItems === undefined && !uniqueItems && !validateItem) return;

    checks.push((value, path, context) => {
      if (!Array.isArray(value)) return true;

      let valid = true;

      if (minItems !== undefined && value.length < minItems) {
        valid = fail(context, path, `expected at least ${minItems} item(s)`);
        if (isFull(context)) return false;
      }

      if (maxItems !== undefined && value.length > maxItems) {
        valid = fail(context, path, `expected at most ${maxItems} item(s)`);
        if (isFull(context)) return false;
      }

      let itemsValid = true;
      if (validateItem) {
        for (let index = 0; index < value.length; index += 1) {
          if (!validateItem(value[index], { parent: path, index }, context)) {
            itemsValid = false;
            if (isFull(context)) return false;
          }
        }
      }

      // Item checks run first so ill-typed items fail before the pairwise uniqueness comparison.
      if (!itemsValid) return false;

      if (uniqueItems && !hasUniqueItems(value)) {
        valid = fail(context, path, "expected unique items");
        if (isFull(context)) return false;
      }

      return valid;
    });
  }

  compileStringKeywords(schema, location, checks) {
    const { minLength, maxLength, format } = schema;
    const pattern = schema.pattern === undefined ? undefined : new RegExp(schema.pattern, "u");
    let formatCheck;

    if (format !== undefined) {
      formatCheck = FORMAT_CHECKS.get(format);
      if (!formatCheck) {
        throw new Error(`Unsupported JSON schema format "${format}" at ${location}.`);
      }
    }

    if (minLength === undefined && maxLength === undefined && !pattern && !formatCheck) return;

    checks.push((value, path, context) => {
      if (typeof value !== "string") return true;

      const length = minLength !== undefined || maxLength !== undefined ? codePointLength(value) : 0;

      if (minLength !== undefined && length < minLength) {
        return fail(context, path, `expected length >= ${minLength}`);
      }

      if (maxLength !== undefined && length > maxLength) {
        return fail(context, path, `expected length <= ${maxLength}`);
      }

      if (pattern && !pattern.test(value)) {
        return fail(context, path, `expected string matching pattern ${JSON.stringify(schema.pattern)}`);
      }

      if (formatCheck && !formatCheck(value)) {
        return fail(context, path, `expected ${format} format`);
      }

      return true;
    });
  }

  compileNumberKeywords(schema, location, checks) {
    const { minimum, maximum, exclusiveMinimum, exclusiveMaximum } = schema;

    if (minimum === undefined && maximum === undefined && exclusiveMinimum === undefined && exclusiveMaximum === undefined) {
      return;
    }

    checks.push((value, path, context) => {
      if (typeof value !== "number") return true;
      if (minimum !== undefined && value < minimum) return fail(context, path, `expected >= ${minimum}`);
      if (maximum !== undefined && value > maximum) return fail(context, path, `expected <= ${maximum}`);
      if (exclusiveMinimum !== undefined && value <= exclusiveMinimum) return fail(context, path, `expected > ${exclusiveMinimum}`);
      if (exclusiveMaximum !== undefined && value >= exclusiveMaximum) return fail(context, path, `expected < ${exclusiveMaximum}`);
      return true;
    });
  }

  resolveRef(ref, location) {
    if (ref === "#") return this.rootSchema;

    const match = /^#\/\$defs\/([^/]+)$/.exec(ref);
    if (!match) {
      throw new Error(`Unsupported schema ref: ${ref} at ${location}.`);
    }

    const name = match[1].replaceAll("~1", "/").replaceAll("~0", "~");
    const definition = this.rootSchema.$defs?.[name];
    if (definition === undefined) {
      throw new Error(`Unknown schema ref: ${ref} at ${location}.`);
    }

    return definition;
  }
}

function fail(context, path, message) {
  if (context.errors.length < context.maxErrors) {
    context.errors.push({ path: renderPath(path), message });
  }

  return false;
}

function isFull(context) {
  return context.errors.length >= context.maxErrors;
}

function matchesSilently(validate, value, path, context) {
  return validate(value, path, { errors: [], maxErrors: 1, depth: context.depth });
}

// Thrown rather than reported as a mismatch so `not`/`oneOf`/`anyOf` cannot turn exhaustion into success.
class DepthExceeded {
  constructor(path) {
    this.path = path;
  }
}

function withDepthGuard(validate) {
  return (value, path, context) => {
    if (context.depth >= MAX_VALIDATION_DEPTH) throw new DepthExceeded(path);

    context.depth += 1;
    try {
      return validate(value, path, context);
    } finally {
      context.depth -= 1;
    }
  };
}

/**
 * @param {unknown} parent
 * @param {string} key
 * @param {boolean} declared whether the key comes from the schema rather than the instance
 */
function childPath(parent, key, declared) {
  return { parent, key, declared };
}

function renderPath(path) {
  const parts = [];

  for (let node = path; node; node = node.parent) {
    if (node.segment !== undefined) parts.push(node.segment);
    else if (node.index !== undefined) parts.push(`[${node.index}]`);
    else parts.push(node.declared && SAFE_PROPERTY_NAME.test(node.key) ? `.${node.key}` : REDACTED_PROPERTY_SEGMENT);
  }

  const rendered = parts.reverse().join("");
  return rendered.length > MAX_RENDERED_PATH_LENGTH
    ? `${rendered.slice(0, MAX_RENDERED_PATH_LENGTH)}...`
    : rendered;
}

function isRfc3339DateTime(value) {
  const match = DATE_TIME_PATTERN.exec(value);
  if (!match) return false;

  const [year, month, day, hour, minute, second] = match.slice(1, 7).map(Number);
  const [sign, offsetHour, offsetMinute] = [match[7], Number(match[8] ?? 0), Number(match[9] ?? 0)];

  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) return false;
  if (hour > 23 || minute > 59 || second > 60) return false;
  if (offsetHour > 23 || offsetMinute > 59) return false;

  if (second === 60) {
    // RFC 3339 §5.7: leap seconds are only inserted at 23:59:60 UTC on the last day of June or December.
    const offset = (sign === "-" ? -1 : 1) * (offsetHour * 60 + offsetMinute);
    const utc = new Date(0);
    utc.setUTCFullYear(year, month - 1, day);
    utc.setUTCHours(hour, minute - offset, 59, 0);

    const utcMonth = utc.getUTCMonth() + 1;
    const lastDayOfJuneOrDecember =
      (utcMonth === 6 || utcMonth === 12) && utc.getUTCDate() === daysInMonth(utc.getUTCFullYear(), utcMonth);
    if (!lastDayOfJuneOrDecember || utc.getUTCHours() !== 23 || utc.getUTCMinutes() !== 59) return false;
  }

  return true;
}

function daysInMonth(year, month) {
  if (month === 2) {
    const leapYear = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
    return leapYear ? 29 : 28;
  }

  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

function matchesType(value, type) {
  switch (type) {
    case "object":
      return isPlainObject(value);
    case "array":
      return Array.isArray(value);
    case "integer":
      return Number.isInteger(value);
    case "number":
      return typeof value === "number" && Number.isFinite(value);
    case "null":
      return value === null;
    default:
      return typeof value === type;
  }
}

function describeType(value) {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (typeof value === "number") return Number.isInteger(value) ? "integer" : "number";
  return typeof value;
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function codePointLength(value) {
  let length = 0;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff && index + 1 < value.length) {
      const next = value.charCodeAt(index + 1);
      if (next >= 0xdc00 && next <= 0xdfff) index += 1;
    }
    length += 1;
  }
  return length;
}

function hasUniqueItems(items) {
  if (items.every((item) => item === null || typeof item !== "object")) {
    return new Set(items).size === items.length;
  }

  for (let left = 0; left < items.length; left += 1) {
    for (let right = left + 1; right < items.length; right += 1) {
      if (deepEqual(items[left], items[right])) return false;
    }
  }

  return true;
}

function deepEqual(left, right) {
  if (left === right) return true;
  if (typeof left !== typeof right || left === null || right === null || typeof left !== "object") return false;
  if (Array.isArray(left) !== Array.isArray(right)) return false;

  if (Array.isArray(left)) {
    return left.length === right.length && left.every((item, index) => deepEqual(item, right[index]));
  }

  const leftKeys = Object.keys(left);
  if (leftKeys.length !== Object.keys(right).length) return false;
  return leftKeys.every((key) => Object.hasOwn(right, key) && deepEqual(left[key], right[key]));
}
