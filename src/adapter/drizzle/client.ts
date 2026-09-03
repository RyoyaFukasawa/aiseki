import { bindModel } from "./binding.js"
import type {
  AnyDrizzleModelConstructor,
  BoundDrizzleModel,
  BoundDrizzleModels,
  DrizzleModelConstructors,
} from "./types.js"

/**
 * Drizzle clientとModel constructorを結び付けるrequest-scoped context。
 */
export class DrizzleModelDatabase<Database = unknown> {
  readonly #database: Database

  constructor(database: Database) {
    this.#database = database
  }

  /** 1つのModelを現在のDrizzle clientへbindする。 */
  model<Constructor extends AnyDrizzleModelConstructor>(
    model: Constructor,
  ): BoundDrizzleModel<Constructor> {
    return bindModel(this.#database, model)
  }

  /** Model registryの各constructorを現在のDrizzle clientへbindする。 */
  models<Constructors extends DrizzleModelConstructors>(
    models: Constructors,
  ): BoundDrizzleModels<Constructors> {
    const entries = Object.entries(models).map(([key, model]) => [
      key,
      this.model(model),
    ] as const)

    return Object.fromEntries(entries) as BoundDrizzleModels<Constructors>
  }
}

/** Drizzle clientからrequest-scopedのAiseki contextを作成する。 */
export function createDB<Database>(
  database: Database,
): DrizzleModelDatabase<Database> {
  return new DrizzleModelDatabase(database)
}
