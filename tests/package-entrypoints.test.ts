import { execFileSync } from "node:child_process"
import {
  mkdtemp,
  mkdir,
  readdir,
  rm,
} from "node:fs/promises"
import { existsSync, readFileSync } from "node:fs"
import { join, resolve } from "node:path"
import { tmpdir } from "node:os"

import { beforeAll, describe, expect, it } from "vitest"

function readPackage() {
  return JSON.parse(
    readFileSync(resolve(process.cwd(), "package.json"), "utf8"),
  ) as {
    exports?: Record<string, Record<string, string> | string>
    files?: string[]
    bin?: Record<string, string>
    engines?: Record<string, string>
  }
}

describe("published package entrypoints", () => {
  beforeAll(() => {
    if (!existsSync(resolve(process.cwd(), "dist/index.js"))) {
      execFileSync("pnpm", ["run", "build"], {
        cwd: process.cwd(),
        stdio: "inherit",
      })
    }
  })

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
    expect(root.engines).toEqual({ node: ">=24" })

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

  it("resolves entrypoints and the binary from a packed tarball", async () => {
    const temporaryDirectory = await mkdtemp(
      join(tmpdir(), "aiseki-package-smoke-"),
    )
    const packageDirectory = join(temporaryDirectory, "package")
    const consumerDirectory = join(temporaryDirectory, "consumer")

    try {
      await mkdir(packageDirectory)
      await mkdir(consumerDirectory)
      execFileSync(
        "pnpm",
        ["pack", "--pack-destination", packageDirectory, "--silent"],
        { cwd: process.cwd(), stdio: "ignore" },
      )

      const [archive] = (await readdir(packageDirectory)).filter((file) =>
        file.endsWith(".tgz"),
      )

      if (!archive) {
        throw new Error("Package archive was not created")
      }

      execFileSync(
        "npm",
        [
          "install",
          "--offline",
          "--ignore-scripts",
          "--no-save",
          "--omit=peer",
          join(packageDirectory, archive),
        ],
        {
          cwd: consumerDirectory,
          stdio: "ignore",
          env: {
            ...process.env,
            npm_config_cache: join(temporaryDirectory, "npm-cache"),
          },
        },
      )

      const entrypointCheck = [
        'const core = await import("aiseki")',
        'const d1 = await import("aiseki/d1")',
        'const betterSqlite3 = await import.meta.resolve("aiseki/better-sqlite3")',
        'if (typeof core.defineMigrate !== "function") throw new Error("root export failed")',
        'if (typeof d1.createD1Database !== "function") throw new Error("d1 export failed")',
        'if (!betterSqlite3.endsWith("/dist/drivers/better-sqlite3/index.js")) throw new Error("better-sqlite3 export failed")',
      ].join("; ")
      execFileSync(
        process.execPath,
        ["--input-type=module", "-e", entrypointCheck],
        { cwd: consumerDirectory, stdio: "ignore" },
      )

      const output = execFileSync(
        join(consumerDirectory, "node_modules/.bin/aiseki"),
        ["--help"],
        { encoding: "utf8" },
      )
      expect(output).toContain("Usage: aiseki <command> [options]")
    } finally {
      await rm(temporaryDirectory, { recursive: true, force: true })
    }
  })
})
