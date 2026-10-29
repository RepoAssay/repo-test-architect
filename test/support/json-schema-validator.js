import assert from "node:assert/strict";
import { formatSchemaIssue, validateAgainstSchema } from "../../src/core/json-schema-validator.js";

export { compileSchema, validateAgainstSchema } from "../../src/core/json-schema-validator.js";

export function assertMatchesSchema(value, schema, label) {
  const errors = validateAgainstSchema(value, schema, { rootPath: label }).map(formatSchemaIssue);

  assert.deepEqual(errors, [], `${label} did not match schema:\n${errors.join("\n")}`);
}
