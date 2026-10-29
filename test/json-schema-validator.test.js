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

  it("validates date-time against RFC 3339 calendar, leap-year, leap-second, and offset rules", () => {
    const dateTime = { type: "string", format: "date-time" };
    const valid = [
      "2024-02-29T12:00:00Z",
      "2000-02-29T00:00:00Z",
      "2016-12-31T23:59:60Z",
      "2016-12-31T15:59:60-08:00",
      "2026-10-29t12:00:00.5+05:30",
      "2026-10-29T12:00:00z"
    ];
    const invalid = [
      "2026-02-30T12:00:00Z",
      "2025-02-29T12:00:00Z",
      "1900-02-29T12:00:00Z",
      "2026-04-31T12:00:00Z",
      "2026-10-29T12:00:60Z",
      "2016-12-31T23:59:60+01:00",
      "2026-10-29T24:00:00Z",
      "2026-10-29T12:00:00+24:00",
      "2026-10-29T12:00:00+05:60",
      "2026-10-29T12:00:00",
      "2026-10-29 12:00:00Z"
    ];

    for (const value of valid) assert.deepEqual(validateAgainstSchema(value, dateTime), [], value);
    for (const value of invalid) {
      assert.deepEqual(validateAgainstSchema(value, dateTime), [{ path: "$", message: "expected date-time format" }], value);
    }
  });

  it("rejects inherited object members as format names", () => {
    for (const format of ["constructor", "toString", "__proto__", "hasOwnProperty"]) {
      assert.throws(() => compileSchema({ type: "string", format }), /Unsupported JSON schema format/, format);
    }
  });

  it("rejects nested $id instead of resolving references against the wrong resource", () => {
    assert.doesNotThrow(() => compileSchema({ $id: "https://example.com/root.json", type: "object" }));
    assert.throws(
      () => compileSchema({ $id: "https://example.com/root.json", $defs: { word: { $id: "word.json", type: "string" } } }),
      /Unsupported nested JSON schema \$id at #\/\$defs\/word/
    );
  });

  it("checks item types before pairwise uniqueness", () => {
    const schema = { type: "array", items: { type: "string" }, uniqueItems: true };

    assert.deepEqual(validateAgainstSchema([{ a: 1 }, { a: 1 }], schema, { maxErrors: 1 }), [
      { path: "$[0]", message: "expected string, got object" }
    ]);
    assert.deepEqual(validateAgainstSchema(["a", "a"], schema), [{ path: "$", message: "expected unique items" }]);
  });

  it("fails with a validation error instead of overflowing on deep or cyclic values", () => {
    const tree = {
      $ref: "#/$defs/node",
      $defs: {
        node: { type: "object", properties: { children: { type: "array", items: { $ref: "#/$defs/node" } } } }
      }
    };
    let deep = { children: [] };
    for (let level = 0; level < 5000; level += 1) deep = { children: [deep] };
    const cyclic = { children: [] };
    cyclic.children.push(cyclic);

    for (const value of [deep, cyclic]) {
      const [issue] = validateAgainstSchema(value, tree, { maxErrors: 1 });
      assert.match(issue.message, /exceeds maximum validation depth of \d+/);
    }
    assert.match(validateAgainstSchema(deep, tree)[0].message, /exceeds maximum validation depth/);
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
