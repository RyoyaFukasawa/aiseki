import type { AisekiDatabase } from "../database/client.js"
import type { SqlParameter } from "../database/types.js"
import type { QueryBuilder } from "../query/builder.js"
import type { ComparisonOperator } from "../query/grammar.js"
import { validateIdentifier } from "../schema/grammar.js"
import {
  attachModelPersistence,
  getModelAttributes,
  Model,
  syncModelAttributes,
  type AnyModelConstructor,
  type ModelPersistence,
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
  find(id: SqlParameter): Promise<ModelInstance<Constructor> | null>
  findOrFail(id: SqlParameter): Promise<ModelInstance<Constructor>>
  create(
    attributes: Readonly<Record<string, SqlParameter>>,
  ): Promise<ModelInstance<Constructor>>
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

function invalidModelConstructor(key?: string): Error {
  return new Error(
    key === undefined
      ? "Invalid model constructor"
      : `Invalid model constructor for registry key "${key}"`,
  )
}

function getModelPrimaryKey(model: AnyModelConstructor): string {
  const primaryKey = Reflect.get(model, "primaryKey")

  if (typeof primaryKey !== "string") {
    throw invalidModelConstructor()
  }

  validateIdentifier(primaryKey)
  return primaryKey
}

export function assertModelConstructor(
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
    getModelPrimaryKey(value as AnyModelConstructor)
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

function createModelPersistence(
  database: AisekiDatabase,
  model: AnyModelConstructor,
): ModelPersistence {
  const primaryKey = getModelPrimaryKey(model)

  return {
    async save(instance) {
      const attributes = getModelAttributes(instance)
      const primaryKeyValue = attributes[primaryKey]

      if (primaryKeyValue === undefined || primaryKeyValue === null) {
        const values = { ...attributes }
        delete values[primaryKey]

        const result = await database.query(model.table).insert(values)

        if (result.lastInsertId === null) {
          throw new Error(
            `Unable to determine the generated primary key for ${model.name}`,
          )
        }

        const nextAttributes = {
          ...attributes,
          [primaryKey]: result.lastInsertId,
        }
        ;(instance as unknown as Record<string, SqlParameter>)[primaryKey] =
          result.lastInsertId
        syncModelAttributes(instance, nextAttributes)
        return
      }

      const values = { ...attributes }
      delete values[primaryKey]

      await database
        .query(model.table)
        .where(primaryKey, primaryKeyValue)
        .update(values)
      syncModelAttributes(instance, attributes)
    },

    async delete(instance) {
      const attributes = getModelAttributes(instance)
      const primaryKeyValue = attributes[primaryKey]

      if (primaryKeyValue === undefined || primaryKeyValue === null) {
        throw new Error(
          `Cannot delete ${model.name} without a ${primaryKey} value`,
        )
      }

      await database
        .query(model.table)
        .where(primaryKey, primaryKeyValue)
        .delete()
    },
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
  const primaryKey = getModelPrimaryKey(model)
  const persistence = createModelPersistence(database, model)
  const BoundModel = class extends SourceModel {
    constructor(row: object) {
      super(row)
      Object.assign(this, row)
      syncModelAttributes(
        this,
        row as Readonly<Record<string, SqlParameter>>,
      )
      attachModelPersistence(this, persistence)
    }

    static query(): ModelQuery<Constructor> {
      return new DefaultModelQuery(
        database.query<Record<string, unknown>>(model.table),
        BoundModel as unknown as Constructor,
      )
    }

    static async find(
      id: SqlParameter,
    ): Promise<ModelInstance<Constructor> | null> {
      return BoundModel.query().where(primaryKey, id).first()
    }

    static async findOrFail(
      id: SqlParameter,
    ): Promise<ModelInstance<Constructor>> {
      const instance = await BoundModel.find(id)

      if (instance === null) {
        throw new Error(
          `${model.name} with ${primaryKey} "${String(id)}" not found`,
        )
      }

      return instance
    }

    static async create(
      attributes: Readonly<Record<string, SqlParameter>>,
    ): Promise<ModelInstance<Constructor>> {
      const result = await database.query(model.table).insert(attributes)
      const row = { ...attributes }

      if (!(primaryKey in row)) {
        if (result.lastInsertId === null) {
          throw new Error(
            `Unable to determine the generated primary key for ${model.name}`,
          )
        }

        row[primaryKey] = result.lastInsertId
      }

      return new BoundModel(row) as ModelInstance<Constructor>
    }
  }

  return BoundModel as BoundModel<Constructor>
}
