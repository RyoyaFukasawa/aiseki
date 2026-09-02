import type { Database } from "./database.js"
import {
  bindModel,
  bindModels,
  type BoundModel,
  type BoundModels,
  type ModelDefinitions,
} from "./model/binding.js"
import type { ModelDefinition } from "./model/definition.js"
import {
  createQueryBuilder,
  type QueryBuilder,
} from "./query-builder.js"

interface AisekiDatabaseMethods {
  query<Row extends object = Record<string, unknown>>(
    table: string,
  ): QueryBuilder<Row>
  model<Row extends object, Instance extends object>(
    definition: ModelDefinition<Row, Instance>,
  ): BoundModel<ModelDefinition<Row, Instance>>
  models<Definitions extends ModelDefinitions>(
    definitions: Definitions,
  ): BoundModels<Definitions>
}

export type AisekiDatabase<
  Adapter extends Database = Database,
> = Adapter & AisekiDatabaseMethods

export function createDB<Adapter extends Database>(
  database: Adapter,
): AisekiDatabase<Adapter> {
  let client: AisekiDatabase<Adapter>
  const methods: AisekiDatabaseMethods = {
    query<Row extends object = Record<string, unknown>>(table: string) {
      return createQueryBuilder<Row>(database, table)
    },
    model<Row extends object, Instance extends object>(
      definition: ModelDefinition<Row, Instance>,
    ) {
      return bindModel(client, definition)
    },
    models<Definitions extends ModelDefinitions>(definitions: Definitions) {
      return bindModels(client, definitions)
    },
  }
  const boundMethods = new WeakMap<Function, Function>()
  const target = Object.assign(
    Object.create(Object.getPrototypeOf(database)) as object,
    methods,
  )

  client = new Proxy(target, {
    get(currentTarget, property) {
      if (Object.prototype.hasOwnProperty.call(methods, property)) {
        return Reflect.get(currentTarget, property, currentTarget)
      }

      const value = Reflect.get(database, property, database)

      if (typeof value !== "function") {
        return value
      }

      const existing = boundMethods.get(value)

      if (existing) {
        return existing
      }

      const bound = value.bind(database)
      boundMethods.set(value, bound)
      return bound
    },
    has(currentTarget, property) {
      return Reflect.has(currentTarget, property)
        || Reflect.has(database, property)
    },
  }) as AisekiDatabase<Adapter>

  return client
}
