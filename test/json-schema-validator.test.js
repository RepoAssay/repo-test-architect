import assert from "node:assert/strict";
import fs from "node:fs";
import { describe, it } from "node:test";
import { compileSchema, validateAgainstSchema } from "../src/core/json-schema-validator.js";
import { assertMatchesSchema } from "./support/json-schema-validator.js";

const markerLikeSchema = {
  type: "object",
  additionalProperties: false,
  required: ["ecosystem"],
  properties: {
    fileName: { type: "string" },
    extension: { type: "string" },
    ecosystem: { type: "string" }
  },
  oneOf: [
    { required: ["fileName"] },
    { required: ["extension"] }
  ]
};

describe("JSON schema validator", () => {
  it("accepts oneOf values that match exactly one branch", () => {
    assertMatchesSchema(
      {
        fileName: "package.json",
        ecosystem: "javascript"
      },
      markerLikeSchema,
      "marker-like"
    );
  });

  it("rejects oneOf values that match no branches", () => {
    assert.throws(
      () =>
        assertMatchesSchema(
          {
            ecosystem: "unknown"
          },
          markerLikeSchema,
          "marker-like"
        ),
      /expected exactly one matching oneOf schema, matched 0/
    );
  });

  it("rejects oneOf values that match multiple branches", () => {
    assert.throws(
      () =>
        assertMatchesSchema(
          {
            fileName: "Project.csproj",
            extension: ".csproj",
            ecosystem: "dotnet"
          },
          markerLikeSchema,
          "marker-like"
        ),
      /expected exactly one matching oneOf schema, matched 2/
    );
  });

  it("rejects strings shorter than minLength", () => {
    assert.throws(
      () => assertMatchesSchema("", { type: "string", minLength: 1 }, "non-empty-string"),
      /expected length >= 1/
    );
  });

  it("rejects arrays shorter than minItems", () => {
    assert.throws(
      () => assertMatchesSchema([], { type: "array", minItems: 1, items: { type: "string" } }, "non-empty-array"),
      /expected at least 1 item/
    );
  });
  it("compiles every shipped schema without unsupported keywords", () => {
    const schemaFiles = fs.readdirSync("schemas").filter((fileName) => fileName.endsWith(".schema.json"));

    assert.ok(schemaFiles.length > 0);
    for (const fileName of schemaFiles) {
      assert.doesNotThrow(() => compileSchema(JSON.parse(fs.readFileSync(`schemas/${fileName}`, "utf8"))), fileName);
    }
  });

  it("fails loudly on unsupported keywords and formats instead of ignoring them", () => {
    assert.throws(() => compileSchema({ type: "object", patternProperties: {} }), /Unsupported JSON schema keyword "patternProperties"/);
    assert.throws(() => compileSchema({ $defs: { nested: { if: {} } } }), /Unsupported JSON schema keyword "if"/);
    assert.throws(() => compileSchema({ type: "string", format: "email" }), /Unsupported JSON schema format "email"/);
    assert.throws(() => compileSchema({ $ref: "https://example.com/schema.json" }), /Unsupported schema ref/);
    assert.throws(() => compileSchema({ type: "decimal" }), /Unsupported JSON schema type "decimal"/);
  });

  it("enforces pattern, uniqueItems, date-time format, and type arrays", () => {
    assert.throws(() => assertMatchesSchema("abc", { type: "string", pattern: "^[0-9]+$" }, "digits"), /expected string matching pattern/);
    assert.throws(() => assertMatchesSchema(["a", "a"], { type: "array", uniqueItems: true }, "unique"), /expected unique items/);
    assert.throws(() => assertMatchesSchema([{ a: 1 }, { a: 1 }], { type: "array", uniqueItems: true }, "unique"), /expected unique items/);
    assert.throws(() => assertMatchesSchema("yesterday", { type: "string", format: "date-time" }, "when"), /expected date-time format/);
    assertMatchesSchema("2026-10-29T12:00:00.000Z", { type: "string", format: "date-time" }, "when");
    assertMatchesSchema(null, { type: ["string", "null"] }, "nullable");
    assert.throws(() => assertMatchesSchema(1, { type: ["string", "null"] }, "nullable"), /expected string or null, got integer/);
  });

  it("resolves recursive $defs references", () => {
    const tree = {
      $ref: "#/$defs/node",
      $defs: {
        node: {
          type: "object",
          additionalProperties: false,
          required: ["children"],
          properties: { children: { type: "array", items: { $ref: "#/$defs/node" } } }
        }
      }
    };

    assertMatchesSchema({ children: [{ children: [] }] }, tree, "tree");
    assert.throws(() => assertMatchesSchema({ children: [{ children: [null] }] }, tree, "tree"), /tree\.children\[0\]\.children\[0\]: expected object, got null/);
  });

  it("stops at the first issue when maxErrors is 1 and never echoes instance values", () => {
    const schema = { type: "object", properties: { a: { type: "integer" }, b: { type: "integer" } } };
    const issues = validateAgainstSchema({ a: "secret-a", b: "secret-b" }, schema, { maxErrors: 1 });

    assert.deepEqual(issues, [{ path: "$.a", message: "expected integer, got string" }]);
  });

  it("treats own properties holding undefined as absent, matching JSON serialization", () => {
    const schema = { type: "object", additionalProperties: false, required: ["a"], properties: { a: { type: "string" }, b: { type: "string" } } };

    assertMatchesSchema({ a: "x", b: undefined }, schema, "optional");
    assert.throws(() => assertMatchesSchema({ a: undefined }, schema, "optional"), /optional\.a: required property missing/);
  });
});
