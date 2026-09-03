import type { AisekiDatabase } from "../database/client.js"
import {
  assertModelConstructor,
  bindModel,
  type BoundModel,
} from "./binding.js"
import type { AnyModelConstructor } from "./base.js"

export type ModelConstructors = Readonly<
  Record<string, AnyModelConstructor>
>

export type BoundModels<Constructors extends ModelConstructors> = {
  [Key in Extract<keyof Constructors, string>]: BoundModel<Constructors[Key]>
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
