import type { Database } from "./types.js"
import {
  bindModel,
  bindModels,
  type BoundModel,
  type BoundModels,
  type ModelConstructors,
} from "../model/binding.js"
import type { AnyModelConstructor } from "../model/base.js"
import {
  createQueryBuilder,
  type QueryBuilder,
} from "../query/builder.js"

interface AisekiDatabaseMethods {
  query<Row extends object = Record<string, unknown>>(
    table: string,
  ): QueryBuilder<Row>
  model<Constructor extends AnyModelConstructor>(
    model: Constructor,
  ): BoundModel<Constructor>
  models<Constructors extends ModelConstructors>(
    constructors: Constructors,
  ): BoundModels<Constructors>
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
    model<Constructor extends AnyModelConstructor>(model: Constructor) {
      return bindModel(client, model)
    },
    models<Constructors extends ModelConstructors>(constructors: Constructors) {
      return bindModels(client, constructors)
    },
  }
  const boundMethods = new WeakMap<Function, Function>()
  const target = Object.create(Object.getPrototypeOf(database)) as object

  Object.defineProperties(target, {
    query: {
      configurable: false,
      enumerable: true,
      value: methods.query,
      writable: false,
    },
    model: {
      configurable: false,
      enumerable: true,
      value: methods.model,
      writable: false,
    },
    models: {
      configurable: false,
      enumerable: true,
      value: methods.models,
      writable: false,
    },
  })

  function getForwardedValue(property: PropertyKey): unknown {
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
  }

  client = new Proxy(target, {
    get(currentTarget, property) {
      if (Object.prototype.hasOwnProperty.call(methods, property)) {
        return Reflect.get(currentTarget, property, currentTarget)
      }

      return getForwardedValue(property)
    },
    has(currentTarget, property) {
      return Reflect.has(currentTarget, property)
        || Reflect.has(database, property)
    },
    set(currentTarget, property, value) {
      if (Object.prototype.hasOwnProperty.call(methods, property)) {
        return Reflect.set(currentTarget, property, value, currentTarget)
      }

      return Reflect.set(database, property, value, database)
    },
    deleteProperty(currentTarget, property) {
      if (Object.prototype.hasOwnProperty.call(methods, property)) {
        return Reflect.deleteProperty(currentTarget, property)
      }

      return Reflect.deleteProperty(database, property)
    },
    ownKeys(currentTarget) {
      const keys = Reflect.ownKeys(currentTarget)

      for (const key of Reflect.ownKeys(database)) {
        if (!keys.includes(key)) {
          keys.push(key)
        }
      }

      return keys
    },
    getOwnPropertyDescriptor(currentTarget, property) {
      const targetDescriptor = Reflect.getOwnPropertyDescriptor(
        currentTarget,
        property,
      )

      if (targetDescriptor) {
        return targetDescriptor
      }

      const descriptor = Reflect.getOwnPropertyDescriptor(database, property)

      if (!descriptor) {
        return undefined
      }

      if ("value" in descriptor) {
        return {
          ...descriptor,
          configurable: true,
          value: getForwardedValue(property),
        }
      }

      return {
        configurable: true,
        enumerable: descriptor.enumerable,
        get: descriptor.get?.bind(database),
        set: descriptor.set?.bind(database),
      }
    },
  }) as AisekiDatabase<Adapter>

  return client
}
