import { mkdir, writeFile } from "node:fs/promises"
import { join } from "node:path"

export interface CreateMigrationOptions {
  directory: string
  name: string
  now?: Date
}

/**
 * Artisanの`make:migration`に相当するmigrationファイルを作成する。
 *
 * @param options 作成先、migration名、任意の時刻。
 * @returns 作成したファイルの絶対パス。
 */
export async function createMigrationFile(
  options: CreateMigrationOptions,
): Promise<string> {
  const name = normalizeMigrationName(options.name)
  const timestamp = formatTimestamp(options.now ?? new Date())
  const migrationName = `${timestamp}_${name}`
  const filePath = join(options.directory, `${migrationName}.ts`)

  await mkdir(options.directory, { recursive: true })
  await writeFile(filePath, migrationTemplate(migrationName), {
    encoding: "utf8",
    flag: "wx",
  })

  return filePath
}

function normalizeMigrationName(name: string): string {
  const normalized = name.trim()

  if (!/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(normalized)) {
    throw new Error(
      "Migration name must contain only letters, numbers, underscores, and hyphens",
    )
  }

  return normalized
}

function formatTimestamp(date: Date): string {
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
  ].join("")
}

function pad(value: number): string {
  return value.toString().padStart(2, "0")
}

function migrationTemplate(name: string): string {
  return [
    'import { defineMigrate } from "aiseki"',
    "",
    "export default defineMigrate({",
    `  name: ${JSON.stringify(name)},`,
    "",
    "  async up(database) {",
    "    // スキーマ変更をここに記述する。",
    "  },",
    "",
    "  async down(database) {",
    "    // スキーマ変更を元に戻す処理をここに記述する。",
    "  },",
    "})",
    "",
  ].join("\n")
}
