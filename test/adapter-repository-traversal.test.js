import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { adapters } from "../src/core/adapter-registry.js";

// Every adapter reads its repository through readRepositoryTextFiles, so none may follow a
// symbolic link out of the root or block on a FIFO that matches its source extensions.
const ADAPTER_LAYOUTS = {
  csharp: { marker: ["App.csproj", "<Project Sdk=\"Microsoft.NET.Sdk\" />\n"], extension: ".cs" },
  dart: { marker: ["pubspec.yaml", "name: app\n"], extension: ".dart" },
  elixir: { marker: ["mix.exs", "defmodule App.MixProject do\nend\n"], extension: ".ex" },
  go: { marker: ["go.mod", "module example.com/app\n"], extension: ".go" },
  javascript: { marker: ["package.json", "{}\n"], extension: ".js" },
  kotlin: { marker: ["build.gradle.kts", "\n"], extension: ".kt" },
  php: { marker: ["composer.json", "{}\n"], extension: ".php" },
  python: { marker: ["pyproject.toml", "[project]\nname = \"app\"\n"], extension: ".py" },
  ruby: { marker: ["Gemfile", "source \"https://rubygems.org\"\n"], extension: ".rb" },
  rust: { marker: ["Cargo.toml", "[package]\nname = \"app\"\n"], extension: ".rs" },
  swift: { marker: ["Package.swift", "// swift-tools-version:5.9\n"], extension: ".swift" }
};

describe("adapter repository traversal", () => {
  it("covers every registered adapter", () => {
    assert.deepEqual(Object.keys(ADAPTER_LAYOUTS).sort(), adapters.map((adapter) => adapter.id).sort());
  });

  for (const adapter of adapters) {
    it(`${adapter.id} skips symbolic links and special files`, { skip: process.platform === "win32" }, () => {
      const { marker, extension } = ADAPTER_LAYOUTS[adapter.id];
      const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), `repo-test-architect-traversal-${adapter.id}-`));
      const root = path.join(sandbox, "repo");
      const outside = path.join(sandbox, "outside");
      fs.mkdirSync(path.join(root, "src"), { recursive: true });
      fs.mkdirSync(outside);
      fs.writeFileSync(path.join(root, marker[0]), marker[1]);
      fs.writeFileSync(path.join(root, "src", `owned${extension}`), "owned\n");
      fs.writeFileSync(path.join(outside, `external${extension}`), "external\n");
      fs.symlinkSync(outside, path.join(root, "src", "linked"));
      fs.symlinkSync(path.join(outside, `external${extension}`), path.join(root, "src", `alias${extension}`));
      execFileSync("mkfifo", [path.join(root, "src", `blocking${extension}`)]);

      const reads = recordReads(() => adapter.audit(root));

      assert.ok(reads.includes(path.join(root, "src", `owned${extension}`)), "owned source is read");
      assert.deepEqual(reads.filter((file) => /linked|alias|blocking|outside/.test(path.relative(sandbox, file))), []);
    });
  }
});

function recordReads(callback) {
  const reads = [];
  const originalReadFileSync = fs.readFileSync;
  fs.readFileSync = function recordingReadFileSync(file, ...args) {
    if (typeof file === "string") reads.push(path.resolve(file));
    return originalReadFileSync.call(this, file, ...args);
  };
  try {
    callback();
  } finally {
    fs.readFileSync = originalReadFileSync;
  }
  return reads;
}
