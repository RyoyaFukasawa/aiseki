import { and, type SQL, type Table } from "drizzle-orm"

import type {
  AnyDrizzleModelConstructor,
  DrizzleModelInstance,
  DrizzleModelQuery,
  DrizzleModelRow,
} from "./types.js"

interface DrizzleSelectQuery {
  where(condition: SQL): DrizzleSelectQuery
  limit(value: number): DrizzleSelectQuery
}

interface DrizzleDatabaseLike {
  select(): {
    from(table: Table): unknown
  }
}

function asDrizzleDatabase(value: unknown): DrizzleDatabaseLike {
  return value as DrizzleDatabaseLike
}

export class DefaultDrizzleModelQuery<
  Constructor extends AnyDrizzleModelConstructor,
> implements DrizzleModelQuery<Constructor> {
  readonly #database: unknown
  readonly #model: Constructor
  readonly #conditions: SQL[] = []

  constructor(database: unknown, model: Constructor) {
    this.#database = database
    this.#model = model
  }

  where(condition: SQL): this {
    this.#conditions.push(condition)
    return this
  }

  async get(): Promise<ReadonlyArray<DrizzleModelInstance<Constructor>>> {
    const rows = await this.#execute()

    return rows.map((row) => new this.#model(row) as DrizzleModelInstance<Constructor>)
  }

  async first(): Promise<DrizzleModelInstance<Constructor> | null> {
    const query = this.#buildQuery().limit(1)
    const rows = await this.#executeQuery(query)

    const row = rows[0]
    return row === undefined
      ? null
      : new this.#model(row) as DrizzleModelInstance<Constructor>
  }

  async #execute(): Promise<ReadonlyArray<DrizzleModelRow<Constructor>>> {
    return this.#executeQuery(this.#buildQuery())
  }

  async #executeQuery(
    query: DrizzleSelectQuery,
  ): Promise<ReadonlyArray<DrizzleModelRow<Constructor>>> {
    const rows: unknown = await Promise.resolve(query)
    return rows as ReadonlyArray<DrizzleModelRow<Constructor>>
  }

  #buildQuery(): DrizzleSelectQuery {
    const database = asDrizzleDatabase(this.#database)
    const query = database
      .select()
      .from(this.#model.table) as DrizzleSelectQuery

    if (this.#conditions.length === 0) {
      return query
    }

    const condition = this.#conditions.length === 1
      ? this.#conditions[0]
      : and(...this.#conditions)

    return condition === undefined ? query : query.where(condition)
  }
}
