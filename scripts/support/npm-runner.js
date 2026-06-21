import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

export function runNpmScripts(scriptNames, successMessage, options = {}) {
  const npm = options.npm ?? resolveNpmInvocation();
  const spawn = options.spawn ?? spawnSync;
  const log = options.log ?? console.log;
  const exit = options.exit ?? process.exit;

  for (const scriptName of scriptNames) {
    log(`\n==> npm run ${scriptName}`);
    const result = spawn(npm.command, [...npm.args, "run", scriptName], {
      stdio: "inherit"
    });

    if (result.error) {
      throw result.error;
    }

    if (result.status !== 0) {
      exit(result.status ?? 1);
    }
  }

  log(`\n${successMessage}`);
}

export function resolveNpmInvocation() {
  if (process.env.npm_execpath) {
    return { command: process.execPath, args: [process.env.npm_execpath] };
  }

  if (process.platform === "win32") {
    const npmCliPath = path.join(path.dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js");

    if (fs.existsSync(npmCliPath)) {
      return { command: process.execPath, args: [npmCliPath] };
    }
  }

  return { command: "npm", args: [] };
}
