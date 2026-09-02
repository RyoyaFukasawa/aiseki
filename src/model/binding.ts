import type { AisekiDatabase } from "../client.js"
import type { SqlParameter } from "../database.js"
import type { QueryBuilder } from "../query-builder.js"
import type { ComparisonOperator } from "../query/grammar.js"
import type { ModelDefinition } from "./definition.js"

export type ModelRow<
  Definition extends ModelDefinition<any, any>,
> = Definition extends ModelDefinition<infer Row, any> ? Row : never

export type ModelInstance<
  Definition extends ModelDefinition<any, any>,
> = Definition extends ModelDefinition<any, infer Instance> ? Instance : never

export interface BoundModel<
  Definition extends ModelDefinition<any, any>,
> {
  query(): ModelQuery<Definition>
}

export interface ModelQuery<
  Definition extends ModelDefinition<any, any>,
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
  get(): Promise<ReadonlyArray<ModelInstance<Definition>>>
  first(): Promise<ModelInstance<Definition> | null>
  update(values: Readonly<Record<string, SqlParameter>>): Promise<void>
  delete(): Promise<void>
}

export type ModelDefinitions = Readonly<
  Record<string, ModelDefinition<any, any>>
>

export type BoundModels<Definitions extends ModelDefinitions> = {
  [Key in keyof Definitions]: BoundModel<Definitions[Key]>
}

class DefaultModelQuery<Row extends object, Instance extends object>
  implements ModelQuery<ModelDefinition<Row, Instance>>
{
  readonly #builder: QueryBuilder<Row>
  readonly #hydrate: (row: Row) => Instance

  constructor(
    builder: QueryBuilder<Row>,
    hydrate: (row: Row) => Instance,
  ) {
    this.#builder = builder
    this.#hydrate = hydrate
  }

  select(...columns: readonly string[]): this {
    this.#builder.select(...columns)
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
    if (arguments.length === 3) {
      this.#builder.where(
        column,
        operatorOrValue as ComparisonOperator,
        value as SqlParameter,
      )
    } else {
      this.#builder.where(column, operatorOrValue)
    }

    return this
  }

  orderBy(column: string, direction: "asc" | "desc" = "asc"): this {
    this.#builder.orderBy(column, direction)
    return this
  }

  limit(value: number): this {
    this.#builder.limit(value)
    return this
  }

  offset(value: number): this {
    this.#builder.offset(value)
    return this
  }

  async get(): Promise<ReadonlyArray<Instance>> {
    const rows = await this.#builder.get()
    return rows.map(this.#hydrate)
  }

  async first(): Promise<Instance | null> {
    const row = await this.#builder.first()
    return row === null ? null : this.#hydrate(row)
  }

  async update(
    values: Readonly<Record<string, SqlParameter>>,
  ): Promise<void> {
    await this.#builder.update(values)
  }

  async delete(): Promise<void> {
    await this.#builder.delete()
  }
}

export function bindModel<Row extends object, Instance extends object>(
  database: AisekiDatabase,
  definition: ModelDefinition<Row, Instance>,
): BoundModel<ModelDefinition<Row, Instance>> {
  return Object.freeze({
    query() {
      return new DefaultModelQuery(
        database.query<Row>(definition.table),
        definition.hydrate,
      )
    },
  })
}

export function bindModels<Definitions extends ModelDefinitions>(
  database: AisekiDatabase,
  definitions: Definitions,
): BoundModels<Definitions> {
  const bound = Object.fromEntries(
    Object.entries(definitions).map(([key, definition]) => [
      key,
      database.model(definition),
    ]),
  )

  return bound as BoundModels<Definitions>
}
