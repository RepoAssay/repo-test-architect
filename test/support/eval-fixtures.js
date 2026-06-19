import fs from "node:fs";
import path from "node:path";

export function loadEvalFixtures() {
  const manifestPath = path.resolve("evals/fixtures.json");
  const fixtures = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

  return fixtures.map((fixture) => {
    if (!fixture.name || !fixture.adapter || !fixture.path) {
      throw new Error(`Invalid eval fixture entry: ${JSON.stringify(fixture)}`);
    }

    return {
      ...fixture,
      root: path.resolve(fixture.path)
    };
  });
}
