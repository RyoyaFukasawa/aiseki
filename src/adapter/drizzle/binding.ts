import { eq, getTableColumns } from "drizzle-orm"

import { Model } from "../../model/base.js"
import { DefaultDrizzleModelQuery } from "./query.js"
import type {
  AnyDrizzleModelConstructor,
  BoundDrizzleModel,
  DrizzleModelInstance,
} from "./types.js"

/** Model constructorを1つのrequest-scoped Drizzle databaseへbindする。 */
export function bindModel<
  Constructor extends AnyDrizzleModelConstructor,
>(
  database: unknown,
  model: Constructor,
): BoundDrizzleModel<Constructor> {
  const SourceModel = model as unknown as {
    new (row: object): Model
  }
  const primaryKeyName = Object.entries(getTableColumns(model.table)).find(
    ([, column]) => column === model.primaryKey,
  )?.[0]

  if (primaryKeyName === undefined) {
    throw new Error(`${model.name} primaryKey is not part of its table`)
  }

  const BoundModel = class extends SourceModel {
    getKey(): unknown {
      return Reflect.get(this, primaryKeyName)
    }

    static query() {
      return new DefaultDrizzleModelQuery(
        database,
        BoundModel as unknown as Constructor,
      )
    }

    static async find(
      id: unknown,
    ): Promise<DrizzleModelInstance<Constructor> | null> {
      return BoundModel
        .query()
        .where(eq(model.primaryKey, id))
        .first()
    }

    static async findOrFail(
      id: unknown,
    ): Promise<DrizzleModelInstance<Constructor>> {
      const instance = await BoundModel.find(id)

      if (instance === null) {
        throw new Error(
          `${model.name} with primary key "${String(id)}" not found`,
        )
      }

      return instance
    }
  }

  if (!(BoundModel.prototype instanceof Model)) {
    throw new Error("A Drizzle Model must extend Model")
  }

  return BoundModel as unknown as BoundDrizzleModel<Constructor>
}
