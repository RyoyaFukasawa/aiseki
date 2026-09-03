import type { Database } from "./types.js"

/**
 * Database adapterを変更せず、追加のAPIを持つdatabase clientを作成する。
 *
 * adapterのメソッドは元のadapterをreceiverにして呼び出し、プロパティの
 * 参照・代入・削除・reflectionもadapterへ転送する。
 */
export function createDatabaseProxy<
  Adapter extends Database,
  Methods extends object,
>(database: Adapter, methods: Methods): Adapter & Methods {
  const boundMethods = new WeakMap<Function, Function>()
  const target = Object.create(Object.getPrototypeOf(database)) as object

  for (const property of Reflect.ownKeys(methods)) {
    Object.defineProperty(target, property, {
      configurable: false,
      enumerable: true,
      value: Reflect.get(methods, property, methods),
      writable: false,
    })
  }

  function hasOwnMethod(property: PropertyKey): boolean {
    return Object.prototype.hasOwnProperty.call(methods, property)
  }

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

  return new Proxy(target, {
    get(currentTarget, property) {
      if (hasOwnMethod(property)) {
        return Reflect.get(currentTarget, property, currentTarget)
      }

      return getForwardedValue(property)
    },
    has(currentTarget, property) {
      return Reflect.has(currentTarget, property)
        || Reflect.has(database, property)
    },
    set(currentTarget, property, value) {
      if (hasOwnMethod(property)) {
        return Reflect.set(currentTarget, property, value, currentTarget)
      }

      return Reflect.set(database, property, value, database)
    },
    deleteProperty(currentTarget, property) {
      if (hasOwnMethod(property)) {
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
  }) as Adapter & Methods
}
