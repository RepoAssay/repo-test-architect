import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

describe("docs links", () => {
  it("keeps README doc links valid", () => {
    const readme = fs.readFileSync("README.md", "utf8");
    const links = [...readme.matchAll(/\]\((docs\/[^)]+)\)/g)].map((match) => match[1]);

    assert.ok(links.length > 0);

    for (const link of links) {
      assert.ok(fs.existsSync(path.resolve(link)), `Missing README doc link: ${link}`);
    }
  });
});
