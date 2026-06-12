import fs from "node:fs";
import path from "node:path";

export function loadEvalFixtures() {
  const manifestPath = path.resolve("evals/fixtures.json");
  const fixtures = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

  return fixtures.map((fixture) => {
    if (!fixture.name || !fixture.adapter || !fixture.path) {
      throw new Error(`Invalid eval fixture entry: ${JSON.stringify(fixture)}`);
    }

    if (fixture.adapter !== "javascript") {
      throw new Error(`Unsupported eval fixture adapter: ${fixture.adapter}`);
    }

    return {
      ...fixture,
      root: path.resolve(fixture.path)
    };
  });
}
