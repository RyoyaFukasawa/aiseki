import type { Database } from "./types.js"
import { createDatabaseProxy } from "./proxy.js"
import {
  bindModel,
  type BoundModel,
} from "../model/binding.js"
import {
  bindModels,
  type BoundModels,
  type ModelConstructors,
} from "../model/registry.js"
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
  client = createDatabaseProxy(database, methods)

  return client
}
