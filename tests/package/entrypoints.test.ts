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

  it("declares only the core and Drizzle exports with built output", () => {
    const root = readPackage()

    expect(root.exports).toEqual({
      ".": {
        types: "./dist/index.d.ts",
        import: "./dist/index.js",
      },
      "./drizzle": {
        types: "./dist/adapter/drizzle/index.d.ts",
        import: "./dist/adapter/drizzle/index.js",
      },
    })
    expect(root.files).toEqual(["dist"])
    expect(root.bin).toBeUndefined()

    for (const file of [
      "dist/index.js",
      "dist/index.d.ts",
      "dist/adapter/drizzle/index.js",
      "dist/adapter/drizzle/index.d.ts",
    ]) {
      expect(existsSync(resolve(process.cwd(), file)), file).toBe(true)
    }
  })

  it("exports the Model class from the root entrypoint", async () => {
    const { Model } = await import("aiseki")

    expect(Model).toBeTypeOf("function")
  })

  it("exports the Drizzle Model binding from the Drizzle entrypoint", async () => {
    const { createDB, bindModel } = await import("aiseki/drizzle")

    expect(createDB).toBeTypeOf("function")
    expect(bindModel).toBeTypeOf("function")
  })

  it("resolves the published entrypoints from a packed tarball", async () => {
    const temporaryDirectory = await mkdtemp(
      join(tmpdir(), "aiseki-package-smoke-"),
    )
    const packageDirectory = join(temporaryDirectory, "package")
    const consumerDirectory = join(temporaryDirectory, "consumer")

    try {
      await mkdir(packageDirectory)
      await mkdir(consumerDirectory)
      execFileSync(
        "npm",
        [
          "pack",
          "--ignore-scripts",
          "--pack-destination",
          packageDirectory,
        ],
        {
          cwd: process.cwd(),
          stdio: "ignore",
          env: {
            ...process.env,
            npm_config_cache: join(temporaryDirectory, "npm-cache"),
          },
        },
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
        'const drizzle = await import.meta.resolve("aiseki/drizzle")',
        'if (typeof core.Model !== "function") throw new Error("Model export failed")',
        'if (!drizzle.endsWith("/dist/adapter/drizzle/index.js")) throw new Error("drizzle export failed")',
      ].join("; ")
      execFileSync(
        process.execPath,
        ["--input-type=module", "-e", entrypointCheck],
        { cwd: consumerDirectory, stdio: "ignore" },
      )
    } finally {
      await rm(temporaryDirectory, { recursive: true, force: true })
    }
  })
})
