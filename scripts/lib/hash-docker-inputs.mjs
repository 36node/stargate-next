#!/usr/bin/env node

import { createHash } from "node:crypto";
import { lstatSync, readdirSync, readFileSync, readlinkSync } from "node:fs";
import path from "node:path";

const [rootArgument, ...inputArguments] = process.argv.slice(2);

if (!rootArgument || inputArguments.length === 0) {
  console.error(
    "Usage: node scripts/lib/hash-docker-inputs.mjs <root> <path>..."
  );
  process.exit(2);
}

const root = path.resolve(rootArgument);
const hash = createHash("sha256");

function appendField(label, value) {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(String(value));
  hash.update(label);
  hash.update("\0");
  hash.update(String(bytes.length));
  hash.update("\0");
  hash.update(bytes);
  hash.update("\0");
}

function normalizeRelativePath(value) {
  return value.split(path.sep).join("/");
}

function walk(absolutePath, relativePath) {
  const stat = lstatSync(absolutePath);

  appendField("path", normalizeRelativePath(relativePath));
  // biome-ignore lint/suspicious/noBitwiseOperators: script
  appendField("mode", (stat.mode & 0o7777).toString(8));

  if (stat.isSymbolicLink()) {
    appendField("type", "symlink");
    appendField("target", readlinkSync(absolutePath));
    return;
  }

  if (stat.isFile()) {
    appendField("type", "file");
    appendField("content", readFileSync(absolutePath));
    return;
  }

  if (stat.isDirectory()) {
    appendField("type", "directory");

    for (const name of readdirSync(absolutePath).sort()) {
      walk(path.join(absolutePath, name), path.join(relativePath, name));
    }
    return;
  }

  throw new Error(`Unsupported Docker input type: ${relativePath}`);
}

for (const input of inputArguments) {
  const absoluteInput = path.resolve(root, input);
  const relativeInput = path.relative(root, absoluteInput);

  if (relativeInput === ".." || relativeInput.startsWith(`..${path.sep}`)) {
    throw new Error(`Docker input is outside repository root: ${input}`);
  }

  appendField("input", normalizeRelativePath(relativeInput));
  walk(absoluteInput, relativeInput);
}

process.stdout.write(`${hash.digest("hex")}\n`);
