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

export interface AisekiDatabase extends Database {
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

export function createDB(database: Database): AisekiDatabase {
  const client: AisekiDatabase = {
    exec: database.exec.bind(database),
    run: database.run.bind(database),
    all: database.all.bind(database),
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

  return client
}
