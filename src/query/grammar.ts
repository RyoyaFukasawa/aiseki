import type { SqlParameter } from "../database.js"
import { validateIdentifier } from "../schema/grammar.js"

export interface CompiledQuery {
  sql: string
  parameters: readonly SqlParameter[]
}

export type ComparisonOperator =
  | "="
  | "!="
  | "<>"
  | "<"
  | "<="
  | ">"
  | ">="
  | "like"

export interface QueryCondition {
  column: string
  operator: ComparisonOperator
  value: SqlParameter
}

export interface SelectQuery {
  table: string
  columns?: readonly string[]
  conditions?: readonly QueryCondition[]
  orderBy?: {
    column: string
    direction: "asc" | "desc"
  }
  limit?: number
  offset?: number
}

const COMPARISON_OPERATORS: ReadonlySet<ComparisonOperator> = new Set([
  "=",
  "!=",
  "<>",
  "<",
  "<=",
  ">",
  ">=",
  "like",
])

function quoteIdentifier(identifier: string): string {
  validateIdentifier(identifier)

  return `"${identifier}"`
}

function compileConditions(
  conditions: readonly QueryCondition[],
): { sql: string; parameters: readonly SqlParameter[] } {
  const sql = conditions
    .map(({ column, operator }) => {
      if (!COMPARISON_OPERATORS.has(operator)) {
        throw new Error(`Invalid comparison operator: ${operator}`)
      }

      return `${quoteIdentifier(column)} ${operator} ?`
    })
    .join(" and ")

  return {
    sql,
    parameters: conditions.map(({ value }) => value),
  }
}

function assertNonNegativeInteger(value: number, name: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${name} must be a non-negative integer`)
  }
}

function sortedEntries(
  values: Readonly<Record<string, SqlParameter>>,
): ReadonlyArray<readonly [string, SqlParameter]> {
  return Object.entries(values).sort(([left], [right]) => {
    if (left < right) {
      return -1
    }

    return left > right ? 1 : 0
  })
}

export function compileSelect(query: SelectQuery): CompiledQuery {
  const columns = query.columns?.length
    ? query.columns.map(quoteIdentifier).join(", ")
    : "*"
  const parameters: SqlParameter[] = []
  let sql = `select ${columns} from ${quoteIdentifier(query.table)}`

  if (query.conditions?.length) {
    const conditions = compileConditions(query.conditions)
    sql += ` where ${conditions.sql}`
    parameters.push(...conditions.parameters)
  }

  if (query.orderBy) {
    if (query.orderBy.direction !== "asc" && query.orderBy.direction !== "desc") {
      throw new Error(`Invalid order direction: ${query.orderBy.direction}`)
    }

    sql += ` order by ${quoteIdentifier(query.orderBy.column)} ${query.orderBy.direction}`
  }

  if (query.limit !== undefined) {
    assertNonNegativeInteger(query.limit, "Limit")
    sql += " limit ?"
    parameters.push(query.limit)
  }

  if (query.offset !== undefined) {
    assertNonNegativeInteger(query.offset, "Offset")
    sql += " offset ?"
    parameters.push(query.offset)
  }

  return { sql, parameters }
}

export function compileInsert(
  table: string,
  values: Readonly<Record<string, SqlParameter>>,
): CompiledQuery {
  const entries = sortedEntries(values)

  if (entries.length === 0) {
    throw new Error("Insert values must not be empty")
  }

  const columns = entries.map(([column]) => quoteIdentifier(column)).join(", ")
  const placeholders = entries.map(() => "?").join(", ")

  return {
    sql: `insert into ${quoteIdentifier(table)} (${columns}) values (${placeholders})`,
    parameters: entries.map(([, value]) => value),
  }
}

export function compileUpdate(
  table: string,
  values: Readonly<Record<string, SqlParameter>>,
  conditions: readonly QueryCondition[],
): CompiledQuery {
  const entries = sortedEntries(values)

  if (entries.length === 0) {
    throw new Error("Update values must not be empty")
  }

  if (conditions.length === 0) {
    throw new Error("Update conditions must not be empty")
  }

  const assignments = entries
    .map(([column]) => `${quoteIdentifier(column)} = ?`)
    .join(", ")
  const compiledConditions = compileConditions(conditions)

  return {
    sql: `update ${quoteIdentifier(table)} set ${assignments} where ${compiledConditions.sql}`,
    parameters: [
      ...entries.map(([, value]) => value),
      ...compiledConditions.parameters,
    ],
  }
}

export function compileDelete(
  table: string,
  conditions: readonly QueryCondition[],
): CompiledQuery {
  if (conditions.length === 0) {
    throw new Error("Delete conditions must not be empty")
  }

  const compiledConditions = compileConditions(conditions)

  return {
    sql: `delete from ${quoteIdentifier(table)} where ${compiledConditions.sql}`,
    parameters: compiledConditions.parameters,
  }
}
