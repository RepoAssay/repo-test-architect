import assert from "node:assert/strict";
import { describe, it } from "node:test";
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
});
