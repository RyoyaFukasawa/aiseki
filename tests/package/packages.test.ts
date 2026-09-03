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
  }
}

describe("package layout", () => {
  it("keeps Drizzle as the only optional runtime integration", () => {
    const root = readPackage("package.json")

    expect(root.name).toBe("aiseki")
    expect(root.private).toBeUndefined()
    expect(root.peerDependencies).toEqual({
      "drizzle-orm": ">=0.45.2",
    })
    expect(root.peerDependenciesMeta).toEqual({
      "drizzle-orm": { optional: true },
    })
    expect(existsSync(resolve(process.cwd(), "src/model/base.ts"))).toBe(true)
    expect(
      existsSync(resolve(process.cwd(), "src/adapter/drizzle/index.ts")),
    ).toBe(true)
    expect(existsSync(resolve(process.cwd(), "src/database"))).toBe(false)
    expect(existsSync(resolve(process.cwd(), "src/drivers"))).toBe(false)
    expect(existsSync(resolve(process.cwd(), "src/query"))).toBe(false)
    expect(existsSync(resolve(process.cwd(), "src/schema"))).toBe(false)
    expect(existsSync(resolve(process.cwd(), "src/migrations"))).toBe(false)
    expect(existsSync(resolve(process.cwd(), "src/cli"))).toBe(false)
  })
})
