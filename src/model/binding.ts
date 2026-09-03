import type { AisekiDatabase } from "../database/client.js"
import type { SqlParameter } from "../database/types.js"
import type { QueryBuilder } from "../query/builder.js"
import type { ComparisonOperator } from "../query/grammar.js"
import { validateIdentifier } from "../schema/grammar.js"
import {
  Model,
  type AnyModelConstructor,
  type ModelConstructor,
  type ModelInstance,
} from "./base.js"

export type {
  AnyModelConstructor,
  ModelConstructor,
  ModelInstance,
} from "./base.js"

export type BoundModel<Constructor extends AnyModelConstructor> = Constructor & {
  query(): ModelQuery<Constructor>
}

export interface ModelQuery<Constructor extends AnyModelConstructor> {
  where(column: string, value: SqlParameter): this
  where(
    column: string,
    operator: ComparisonOperator,
    value: SqlParameter,
  ): this
  orderBy(column: string, direction?: "asc" | "desc"): this
  limit(value: number): this
  offset(value: number): this
  get(): Promise<ReadonlyArray<ModelInstance<Constructor>>>
  first(): Promise<ModelInstance<Constructor> | null>
  update(values: Readonly<Record<string, SqlParameter>>): Promise<void>
  delete(): Promise<void>
}

export type ModelConstructors = Readonly<
  Record<string, AnyModelConstructor>
>

export type BoundModels<Constructors extends ModelConstructors> = {
  [Key in Extract<keyof Constructors, string>]: BoundModel<Constructors[Key]>
}

function invalidModelConstructor(key?: string): Error {
  return new Error(
    key === undefined
      ? "Invalid model constructor"
      : `Invalid model constructor for registry key "${key}"`,
  )
}

function assertModelConstructor(
  value: unknown,
  key?: string,
): asserts value is AnyModelConstructor {
  try {
    if (
      typeof value !== "function"
      || !(value.prototype instanceof Model)
      || typeof Reflect.get(value, "table") !== "string"
    ) {
      throw invalidModelConstructor(key)
    }

    validateIdentifier(Reflect.get(value, "table") as string)
  } catch {
    throw invalidModelConstructor(key)
  }
}

class DefaultModelQuery<Constructor extends AnyModelConstructor>
  implements ModelQuery<Constructor>
{
  readonly #builder: QueryBuilder<Record<string, unknown>>
  readonly #model: Constructor

  constructor(
    builder: QueryBuilder<Record<string, unknown>>,
    model: Constructor,
  ) {
    this.#builder = builder
    this.#model = model
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

  async get(): Promise<ReadonlyArray<ModelInstance<Constructor>>> {
    const rows = await this.#builder.get()
    return rows.map((row) => new this.#model(row))
  }

  async first(): Promise<ModelInstance<Constructor> | null> {
    const row = await this.#builder.first()
    return row === null ? null : new this.#model(row)
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

export function bindModel<Constructor extends AnyModelConstructor>(
  database: AisekiDatabase,
  model: Constructor,
): BoundModel<Constructor> {
  assertModelConstructor(model)

  const SourceModel = model as unknown as {
    readonly table: string
    new (...args: any[]): Model
  }
  const BoundModel = class extends SourceModel {
    constructor(row: object) {
      super(row)
      Object.assign(this, row)
    }

    static query(): ModelQuery<Constructor> {
      return new DefaultModelQuery(
        database.query<Record<string, unknown>>(model.table),
        BoundModel as unknown as Constructor,
      )
    }
  }

  return BoundModel as BoundModel<Constructor>
}

export function bindModels<Constructors extends ModelConstructors>(
  database: AisekiDatabase,
  constructors: Constructors,
): BoundModels<Constructors> {
  const entries = Reflect.ownKeys(constructors).map((key) => {
    if (typeof key !== "string") {
      throw new Error("Model registry keys must be strings")
    }

    const descriptor = Object.getOwnPropertyDescriptor(constructors, key)

    if (!descriptor?.enumerable) {
      throw new Error(`Model registry key "${key}" must be enumerable`)
    }

    const model: unknown = Reflect.get(constructors, key)
    assertModelConstructor(model, key)

    return [key, database.model(model)] as const
  })

  return Object.fromEntries(entries) as BoundModels<Constructors>
}
