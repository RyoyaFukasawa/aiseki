import { execFileSync } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"

import { describe, expect, it } from "vitest"

function readPackage() {
  return JSON.parse(
    readFileSync(resolve(process.cwd(), "package.json"), "utf8"),
  ) as {
    exports?: Record<string, Record<string, string> | string>
    files?: string[]
    bin?: Record<string, string>
  }
}

describe("published package entrypoints", () => {
  it("declares runtime-neutral and driver exports with built output", () => {
    const root = readPackage()

    expect(root.exports).toEqual({
      ".": {
        types: "./dist/index.d.ts",
        import: "./dist/index.js",
      },
      "./d1": {
        types: "./dist/drivers/d1/index.d.ts",
        import: "./dist/drivers/d1/index.js",
      },
      "./better-sqlite3": {
        types: "./dist/drivers/better-sqlite3/index.d.ts",
        import: "./dist/drivers/better-sqlite3/index.js",
      },
    })
    expect(root.files).toEqual(["dist", "bin"])
    expect(root.bin).toEqual({ aiseki: "./bin/aiseki.mjs" })

    for (const file of [
      "dist/index.js",
      "dist/index.d.ts",
      "dist/drivers/d1/index.js",
      "dist/drivers/d1/index.d.ts",
      "dist/drivers/better-sqlite3/index.js",
      "dist/drivers/better-sqlite3/index.d.ts",
      "dist/cli/index.js",
      "bin/aiseki.mjs",
    ]) {
      expect(existsSync(resolve(process.cwd(), file)), file).toBe(true)
    }
  })

  it("runs the built CLI through the published binary", () => {
    const output = execFileSync("node", ["bin/aiseki.mjs", "--help"], {
      cwd: process.cwd(),
      encoding: "utf8",
    })

    expect(output).toContain("Usage: aiseki <command> [options]")
  })
})
