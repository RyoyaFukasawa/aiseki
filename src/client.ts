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

  client = new Proxy(database, {
    get(target, property) {
      if (Object.prototype.hasOwnProperty.call(methods, property)) {
        return Reflect.get(methods, property, methods)
      }

      const value = Reflect.get(target, property, target)

      if (typeof value !== "function") {
        return value
      }

      const existing = boundMethods.get(value)

      if (existing) {
        return existing
      }

      const bound = value.bind(target)
      boundMethods.set(value, bound)
      return bound
    },
    has(target, property) {
      return Object.prototype.hasOwnProperty.call(methods, property)
        || Reflect.has(target, property)
    },
  }) as AisekiDatabase<Adapter>

  return client
}
