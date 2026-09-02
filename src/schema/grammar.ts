export type ColumnType = "integer" | "text"

export type DefaultValue = string | number | boolean | null

export interface ColumnDefinition {
  name: string
  type: ColumnType
  nullable: boolean
  hasDefault: boolean
  defaultValue: DefaultValue
  primary: boolean
  unique: boolean
  autoIncrement: boolean
}

export interface CreateTableDefinition {
  name: string
  columns: readonly ColumnDefinition[]
}

const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/

export function compileCreateTable(table: CreateTableDefinition): string {
  return `create table ${quoteIdentifier(table.name)} (${table.columns
    .map(compileColumn)
    .join(", ")})`
}

export function compileDropTable(name: string): string {
  return `drop table ${quoteIdentifier(name)}`
}

export function compileUniqueIndex(
  tableName: string,
  columnName: string,
): string {
  const indexName = `${tableName}_${columnName}_unique`

  return `create unique index ${quoteIdentifier(indexName)} on ${quoteIdentifier(tableName)} (${quoteIdentifier(columnName)})`
}

function compileColumn(column: ColumnDefinition): string {
  const parts = [quoteIdentifier(column.name), column.type]

  if (column.primary) {
    parts.push("primary key")
  } else if (!column.nullable) {
    parts.push("not null")
  }

  if (column.autoIncrement) {
    parts.push("autoincrement")
  }

  if (column.hasDefault) {
    parts.push(`default ${compileDefault(column.defaultValue)}`)
  }

  return parts.join(" ")
}

function compileDefault(value: DefaultValue): string {
  if (typeof value === "string") {
    return `'${value.replaceAll("'", "''")}'`
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error("Default number must be finite")
    }

    return String(value)
  }

  if (typeof value === "boolean") {
    return value ? "1" : "0"
  }

  return "null"
}

function quoteIdentifier(identifier: string): string {
  validateIdentifier(identifier)

  return `"${identifier}"`
}

export function validateIdentifier(identifier: string): void {
  if (!IDENTIFIER.test(identifier)) {
    throw new Error(`Invalid identifier: ${identifier}`)
  }
}
