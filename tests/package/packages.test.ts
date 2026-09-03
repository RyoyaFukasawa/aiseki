import { existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"

import { describe, expect, it } from "vitest"

function readPackage(relativePath: string) {
  return JSON.parse(
    readFileSync(resolve(process.cwd(), relativePath), "utf8"),
  ) as {
    private?: boolean
    name?: string
    peerDependencies?: Record<string, string>
    peerDependenciesMeta?: Record<string, { optional?: boolean }>
    dependencies?: Record<string, string>
  }
}

describe("workspace packages", () => {
  it("keeps runtime drivers in one package with optional peer dependencies", () => {
    const root = readPackage("package.json")

    expect(root.name).toBe("aiseki")
    expect(root.private).toBeUndefined()
    expect(root.peerDependencies).toMatchObject({
      "better-sqlite3": "^13.0.3",
    })
    expect(root.peerDependenciesMeta).toMatchObject({
      "better-sqlite3": { optional: true },
    })
    expect(existsSync(resolve(process.cwd(), "core"))).toBe(false)
    expect(existsSync(resolve(process.cwd(), "better-sqlite3"))).toBe(false)
    expect(existsSync(resolve(process.cwd(), "d1"))).toBe(false)
    expect(existsSync(resolve(process.cwd(), "src/adapters"))).toBe(false)
    expect(existsSync(resolve(process.cwd(), "src/drivers/d1/index.ts"))).toBe(
      true,
    )
    expect(
      existsSync(resolve(process.cwd(), "src/drivers/better-sqlite3/index.ts")),
    ).toBe(true)
  })
})
