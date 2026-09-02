import type { Database, SqlParameter } from "./database.js"
import {
  compileDelete,
  compileInsert,
  compileSelect,
  compileUpdate,
  type ComparisonOperator,
  type CompiledQuery,
  type QueryCondition,
  type SelectQuery,
} from "./query/grammar.js"
import { validateIdentifier } from "./schema/grammar.js"

export interface QueryBuilder<
  Row extends object = Record<string, unknown>,
> {
  select(...columns: readonly string[]): this
  where(column: string, value: SqlParameter): this
  where(
    column: string,
    operator: ComparisonOperator,
    value: SqlParameter,
  ): this
  orderBy(column: string, direction?: "asc" | "desc"): this
  limit(value: number): this
  offset(value: number): this
  toSQL(): CompiledQuery
  get(): Promise<ReadonlyArray<Row>>
  first(): Promise<Row | null>
  insert(values: Readonly<Record<string, SqlParameter>>): Promise<void>
  update(values: Readonly<Record<string, SqlParameter>>): Promise<void>
  delete(): Promise<void>
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

function assertComparisonOperator(
  operator: string,
): asserts operator is ComparisonOperator {
  if (!COMPARISON_OPERATORS.has(operator as ComparisonOperator)) {
    throw new Error(`Invalid comparison operator: ${operator}`)
  }
}

function assertDirection(direction: string): asserts direction is "asc" | "desc" {
  if (direction !== "asc" && direction !== "desc") {
    throw new Error(`Invalid order direction: ${direction}`)
  }
}

function assertNonNegativeInteger(value: number, name: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${name} must be a non-negative integer`)
  }
}

class DefaultQueryBuilder<Row extends object> implements QueryBuilder<Row> {
  readonly #database: Database
  readonly #table: string
  #columns: readonly string[] | undefined
  readonly #conditions: QueryCondition[] = []
  #orderBy: SelectQuery["orderBy"]
  #limit: number | undefined
  #offset: number | undefined

  constructor(database: Database, table: string) {
    validateIdentifier(table)
    this.#database = database
    this.#table = table
  }

  select(...columns: readonly string[]): this {
    columns.forEach(validateIdentifier)
    this.#columns = columns
    return this
  }

  where(column: string, value: SqlParameter): this
  where(
    column: string,
    operator: ComparisonOperator,
    value: SqlParameter,
  ): this
  where(
    column: string,
    operatorOrValue: ComparisonOperator | SqlParameter,
    value?: SqlParameter,
  ): this {
    validateIdentifier(column)

    const hasExplicitOperator = arguments.length === 3
    const operator = hasExplicitOperator ? String(operatorOrValue) : "="
    assertComparisonOperator(operator)

    this.#conditions.push({
      column,
      operator,
      value: hasExplicitOperator ? (value as SqlParameter) : operatorOrValue,
    })
    return this
  }

  orderBy(column: string, direction: "asc" | "desc" = "asc"): this {
    validateIdentifier(column)
    assertDirection(direction)
    this.#orderBy = { column, direction }
    return this
  }

  limit(value: number): this {
    assertNonNegativeInteger(value, "Limit")
    this.#limit = value
    return this
  }

  offset(value: number): this {
    assertNonNegativeInteger(value, "Offset")
    this.#offset = value
    return this
  }

  toSQL(): CompiledQuery {
    return compileSelect(this.#selectQuery())
  }

  async get(): Promise<ReadonlyArray<Row>> {
    const query = this.toSQL()
    return this.#database.all<Row>(query.sql, query.parameters)
  }

  async first(): Promise<Row | null> {
    const query = compileSelect({ ...this.#selectQuery(), limit: 1 })
    const rows = await this.#database.all<Row>(query.sql, query.parameters)
    return rows[0] ?? null
  }

  async insert(
    values: Readonly<Record<string, SqlParameter>>,
  ): Promise<void> {
    const query = compileInsert(this.#table, values)
    await this.#database.run(query.sql, query.parameters)
  }

  async update(
    values: Readonly<Record<string, SqlParameter>>,
  ): Promise<void> {
    const query = compileUpdate(this.#table, values, this.#conditions)
    await this.#database.run(query.sql, query.parameters)
  }

  async delete(): Promise<void> {
    const query = compileDelete(this.#table, this.#conditions)
    await this.#database.run(query.sql, query.parameters)
  }

  #selectQuery(): SelectQuery {
    return {
      table: this.#table,
      columns: this.#columns,
      conditions: this.#conditions,
      orderBy: this.#orderBy,
      limit: this.#limit,
      offset: this.#offset,
    }
  }
}

export function createQueryBuilder<
  Row extends object = Record<string, unknown>,
>(database: Database, table: string): QueryBuilder<Row> {
  return new DefaultQueryBuilder<Row>(database, table)
}
