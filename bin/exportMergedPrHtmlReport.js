#!/usr/bin/env node

const { main } = require('../src/exportMergedPrHtmlReport.js');

try {
  main();
} catch (error) {
  process.stderr.write(`Failed to export merged PR report: ${error.message}\n`);
  process.exit(1);
}