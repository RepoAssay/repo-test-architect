import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { resolveNpmInvocation, runNpmScripts } from "../scripts/support/npm-runner.js";

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

  it("runs npm scripts in order with the resolved npm command", () => {
    const calls = [];
    const logs = [];

    runNpmScripts(["first", "second"], "done", {
      npm: { command: "node", args: ["npm-cli.js"] },
      spawn(command, args, options) {
        calls.push({ command, args, options });
        return { status: 0 };
      },
      log(message) {
        logs.push(message);
      },
    });

    assert.deepEqual(calls, [
      { command: "node", args: ["npm-cli.js", "run", "first"], options: { stdio: "inherit" } },
      { command: "node", args: ["npm-cli.js", "run", "second"], options: { stdio: "inherit" } },
    ]);
    assert.deepEqual(logs, ["\n==> npm run first", "\n==> npm run second", "\ndone"]);
  });

  it("uses a nonzero script status as the exit code", () => {
    let exitCode;

    assert.throws(() => {
      runNpmScripts(["failing"], "done", {
        npm: { command: "npm", args: [] },
        spawn() {
          return { status: 7 };
        },
        log() {},
        exit(code) {
          exitCode = code;
          throw new Error("exit");
        },
      });
    }, /exit/);

    assert.equal(exitCode, 7);
  });
});
