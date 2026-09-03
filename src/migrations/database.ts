import type {
  Database,
  SchemaDatabase,
} from "../database/types.js"
import { createSchema } from "../schema/builder.js"

/**
 * migration callbackへ渡すSchemaDatabaseを作成する。
 *
 * transaction内のdatabaseをschema builderと同じ境界へ適合させる内部helper。
 */
export function createMigrationDatabase(database: Database): SchemaDatabase {
  const exec = database.exec.bind(database)

  return {
    exec,
    run: database.run.bind(database),
    all: database.all.bind(database),
    schema: createSchema({ exec }),
  }
}
