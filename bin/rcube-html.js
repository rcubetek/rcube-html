#!/usr/bin/env node
// rcube-html command line: `rcube-html render <folder>` draws a static site's pages ahead of time (see src/cli.js).
import { createRequire } from "node:module";

const { run } = createRequire(import.meta.url)("../dist/cli/rcube-html.cjs");

try {
  process.exitCode = run(process.argv.slice(2));
} catch (error) {
  console.error(`rcube-html: ${error.message}`);
  process.exitCode = 2;
}
