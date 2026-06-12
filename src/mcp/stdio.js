#!/usr/bin/env node
import readline from "node:readline";
import { handleJsonRpcRequest } from "./json-rpc.js";

const rl = readline.createInterface({
  input: process.stdin,
  crlfDelay: Infinity
});

rl.on("line", (line) => {
  if (!line.trim()) return;

  const response = handleLine(line);
  if (response) {
    process.stdout.write(`${JSON.stringify(response)}\n`);
  }
});

function handleLine(line) {
  try {
    return handleJsonRpcRequest(JSON.parse(line));
  } catch (error) {
    return {
      jsonrpc: "2.0",
      id: null,
      error: {
        code: -32700,
        message: `Parse error: ${error.message}`
      }
    };
  }
}
