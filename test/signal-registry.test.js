import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { loadEvalFixtures } from "./support/eval-fixtures.js";

const registry = JSON.parse(fs.readFileSync("schemas/signal-registry.json", "utf8"));
const registeredSignals = new Set(registry.map((entry) => entry.id));

describe("signal registry", () => {
  it("has unique ids and descriptions", () => {
    assert.equal(registeredSignals.size, registry.length);

    for (const entry of registry) {
      assert.equal(typeof entry.id, "string");
      assert.match(entry.id, /^[a-z0-9-]+$/);
      assert.equal(typeof entry.category, "string");
      assert.equal(typeof entry.description, "string");
      assert.ok(entry.description.length > 0);
    }
  });

  it("registers every signal emitted by golden snapshots", () => {
    for (const fixture of loadEvalFixtures()) {
      const audit = readExpected(`${fixture.name}.audit.json`);
      const plan = readExpected(`${fixture.name}.plan.json`);
      const emittedSignals = [
        ...audit.untestedCandidates.flatMap((target) => target.signals),
        ...audit.coveredButRisky.flatMap((target) => target.signals),
        ...audit.recommended.flatMap((target) => target.signals),
        ...audit.skipped.flatMap((target) => target.signals),
        ...plan.items.flatMap((item) => item.sourceSignals)
      ];

      for (const signal of emittedSignals) {
        assert.ok(registeredSignals.has(signal), `Unregistered signal ${signal} in ${fixture.name}`);
      }
    }
  });
});

function readExpected(fileName) {
  return JSON.parse(fs.readFileSync(path.join("evals/expected", fileName), "utf8"));
}
