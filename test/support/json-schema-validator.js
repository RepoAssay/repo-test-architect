import assert from "node:assert/strict";

export function assertMatchesSchema(value, schema, label) {
  const errors = validate(value, schema, schema, label);

  assert.deepEqual(errors, [], `${label} did not match schema:\n${errors.join("\n")}`);
}

function validate(value, schema, rootSchema, path) {
  if (schema.$ref) {
    return validate(value, resolveRef(schema.$ref, rootSchema), rootSchema, path);
  }

  const errors = [];

  if (schema.const !== undefined && value !== schema.const) {
    errors.push(`${path}: expected const ${JSON.stringify(schema.const)}`);
  }

  if (schema.enum && !schema.enum.includes(value)) {
    errors.push(`${path}: expected one of ${schema.enum.map((item) => JSON.stringify(item)).join(", ")}`);
  }

  if (schema.type && !matchesType(value, schema.type)) {
    errors.push(`${path}: expected ${schema.type}`);
    return errors;
  }

  if (schema.oneOf) {
    errors.push(...validateOneOf(value, schema.oneOf, rootSchema, path));
  }

  if (shouldValidateObject(value, schema)) {
    errors.push(...validateObject(value, schema, rootSchema, path));
  }

  if (schema.type === "array") {
    errors.push(...validateArray(value, schema, rootSchema, path));
  }

  if (schema.type === "string" && schema.minLength !== undefined && value.length < schema.minLength) {
    errors.push(`${path}: expected length >= ${schema.minLength}`);
  }

  if (schema.type === "integer") {
    if (schema.minimum !== undefined && value < schema.minimum) {
      errors.push(`${path}: expected >= ${schema.minimum}`);
    }

    if (schema.maximum !== undefined && value > schema.maximum) {
      errors.push(`${path}: expected <= ${schema.maximum}`);
    }
  }

  return errors;
}

function validateOneOf(value, options, rootSchema, path) {
  const matchCount = options.filter((option) => validate(value, option, rootSchema, path).length === 0).length;

  if (matchCount === 1) return [];

  return [`${path}: expected exactly one matching oneOf schema, matched ${matchCount}`];
}

function shouldValidateObject(value, schema) {
  const hasObjectKeywords =
    schema.type === "object" ||
    schema.properties !== undefined ||
    schema.required !== undefined ||
    schema.additionalProperties !== undefined;

  return hasObjectKeywords && matchesType(value, "object");
}

function validateObject(value, schema, rootSchema, path) {
  const errors = [];
  const properties = schema.properties ?? {};
  const required = schema.required ?? [];

  for (const key of required) {
    if (!Object.hasOwn(value, key)) {
      errors.push(`${path}.${key}: required property missing`);
    }
  }

  for (const [key, propertyValue] of Object.entries(value)) {
    if (properties[key]) {
      errors.push(...validate(propertyValue, properties[key], rootSchema, `${path}.${key}`));
      continue;
    }

    if (schema.additionalProperties === false) {
      errors.push(`${path}.${key}: additional property not allowed`);
    }
  }

  return errors;
}

function validateArray(value, schema, rootSchema, path) {
  const errors = [];

  if (schema.minItems !== undefined && value.length < schema.minItems) {
    errors.push(`${path}: expected at least ${schema.minItems} item(s)`);
  }

  if (!schema.items) return errors;

  return errors.concat(value.flatMap((item, index) => validate(item, schema.items, rootSchema, `${path}[${index}]`)));
}

function matchesType(value, type) {
  if (type === "array") return Array.isArray(value);
  if (type === "integer") return Number.isInteger(value);
  if (type === "object") return Boolean(value) && typeof value === "object" && !Array.isArray(value);
  return typeof value === type;
}

function resolveRef(ref, rootSchema) {
  const parts = ref.split("/");

  if (parts[0] !== "#" || parts[1] !== "$defs") {
    throw new Error(`Unsupported schema ref: ${ref}`);
  }

  const def = rootSchema.$defs?.[parts[2]];
  if (!def) {
    throw new Error(`Unknown schema ref: ${ref}`);
  }

  return def;
}
