import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"

import { afterEach, describe, expect, it } from "vitest"

import { loadMigrations } from "../src/cli/loader.js"

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  )
})

describe("migration loader", () => {
  it("loads supported migration modules in filename order", async () => {
    const directory = await mkdtemp(join(tmpdir(), "aiseki-loader-"))
    temporaryDirectories.push(directory)

    await writeFile(
      join(directory, "20260902120100_create_posts.mjs"),
      `export default { name: "20260902120100_create_posts", up() {}, down() {} }`,
    )
    await writeFile(
      join(directory, "20260902120000_create_users.mjs"),
      `export default { name: "20260902120000_create_users", up() {}, down() {} }`,
    )

    const migrations = await loadMigrations(directory)

    expect(migrations.map((migration) => migration.name)).toEqual([
      "20260902120000_create_users",
      "20260902120100_create_posts",
    ])
  })
})
