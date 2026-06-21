import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { resolveNpmInvocation } from "../scripts/support/npm-runner.js";

const originalNpmExecPath = process.env.npm_execpath;

describe("npm script runner support", () => {
  afterEach(() => {
    if (originalNpmExecPath === undefined) {
      delete process.env.npm_execpath;
    } else {
      process.env.npm_execpath = originalNpmExecPath;
    }
  });

  it("uses the current Node executable with npm_execpath when launched by npm", () => {
    process.env.npm_execpath = "C:/node/npm-cli.js";

    assert.deepEqual(resolveNpmInvocation(), {
      command: process.execPath,
      args: ["C:/node/npm-cli.js"],
    });
  });
});
