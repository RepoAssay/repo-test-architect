#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

// Native checks are opt-in: the ordinary release suite needs only Node.
const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "rta-dart-native-"));
try {
  for (const [fixture, executable] of [
    ["dart-test-basic", process.env.DART_BIN ?? "dart"],
    ["dart-flutter-basic", process.env.FLUTTER_BIN ?? "flutter"]
  ]) {
    const root = path.join(temporaryRoot, fixture);
    fs.cpSync(path.resolve("examples", fixture), root, {
      recursive: true,
      filter: (entry) => ![".dart_tool", "build", "pubspec.lock"].includes(path.basename(entry))
    });
    for (const args of [["pub", "get"], ["test"]]) {
      const result = spawnSync(executable, args, {
        cwd: root, encoding: "utf8", maxBuffer: 20 * 1024 * 1024,
        env: { ...process.env, CI: "true", FLUTTER_SUPPRESS_ANALYTICS: "true" }
      });
      if (result.error) throw result.error;
      if (result.status !== 0) {
        process.stderr.write(result.stdout + result.stderr);
        throw new Error(`${fixture}: ${args.join(" ")} failed with status ${result.status}.`);
      }
    }
    console.log(`${fixture}: native dependency resolution and tests passed.`);
  }
} finally {
  fs.rmSync(temporaryRoot, { recursive: true, force: true });
}
