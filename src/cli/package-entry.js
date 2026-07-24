#!/usr/bin/env node

if (process.argv[2] === "mcp") {
  await import("../mcp/stdio.js");
} else {
  await import("./index.js");
}
