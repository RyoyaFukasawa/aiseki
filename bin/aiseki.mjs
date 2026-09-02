#!/usr/bin/env node

const { runCli } = await import("../dist/cli/index.js")

process.exitCode = await runCli(process.argv.slice(2))
