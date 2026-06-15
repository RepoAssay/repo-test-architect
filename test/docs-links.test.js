import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { getProjectDetectionRules } from "../src/core/project-detector.js";

describe("docs links", () => {
  it("keeps README doc links valid", () => {
    const readme = fs.readFileSync("README.md", "utf8");
    const links = [...readme.matchAll(/\]\((docs\/[^)]+)\)/g)].map((match) => match[1]);

    assert.ok(links.length > 0);

    for (const link of links) {
      assert.ok(fs.existsSync(path.resolve(link)), `Missing README doc link: ${link}`);
    }
  });

  it("keeps project detection docs aligned with detector rules", () => {
    const docs = fs.readFileSync("docs/project-detection.md", "utf8");
    const rules = getProjectDetectionRules();

    for (const marker of rules.markers) {
      const label = marker.fileName ?? `*${marker.extension}`;
      assert.ok(docs.includes(`\`${label}\``), `Missing documented project marker: ${label}`);
      assert.ok(docs.includes(`\`${marker.ecosystem}\``), `Missing documented ecosystem: ${marker.ecosystem}`);
      for (const language of marker.languages) {
        assert.ok(docs.includes(`\`${language}\``), `Missing documented language: ${language}`);
      }
    }

    for (const directory of rules.ignoredDirectories) {
      assert.ok(docs.includes(`\`${directory}\``), `Missing documented ignored directory: ${directory}`);
    }
  });
});
