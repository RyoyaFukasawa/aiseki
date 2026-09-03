import Sqlite from "better-sqlite3"

import type {
  ClosableDatabase,
  Database,
  SchemaDatabase,
  SqlParameter,
  TransactionalDatabase,
} from "../../database/types.js"
import { createSchema } from "../../schema/builder.js"

type BetterSqlite3Parameter = Exclude<SqlParameter, boolean>

function normalizeParameters(
  parameters: readonly SqlParameter[],
): readonly BetterSqlite3Parameter[] {
  return parameters.map((parameter) => {
    if (typeof parameter === "boolean") {
      return parameter ? 1 : 0
    }

    return parameter
  })
}

/**
 * `better-sqlite3`を利用するローカルSQLiteデータベース。
 *
 * このdriverはリソースのcloseとcallbackベースのtransactionを提供する。
 */
export interface BetterSqlite3Database
  extends ClosableDatabase, SchemaDatabase, TransactionalDatabase {}

/**
 * optional peer dependencyの`better-sqlite3`を利用してSQLiteデータベースを開く。
 *
 * @param filename SQLiteのファイル名。インメモリデータベースには`:memory:`を指定する。
 * @returns closeとtransactionを利用できるAisekiのデータベース。
 */
export function createBetterSqlite3Database(
  filename: string,
): BetterSqlite3Database {
  const handle = new Sqlite(filename)

  const database = {
    async exec(sql) {
      handle.exec(sql)
    },

    async run(sql, parameters: readonly SqlParameter[] = []) {
      handle.prepare(sql).run(...normalizeParameters(parameters))
    },

    async all<T extends object>(
      sql: string,
      parameters: readonly SqlParameter[] = [],
    ): Promise<ReadonlyArray<T>> {
      return handle
        .prepare(sql)
        .all(...normalizeParameters(parameters)) as ReadonlyArray<T>
    },

    async close() {
      handle.close()
    },

    async transaction<T>(
      callback: (database: Database) => Promise<T> | T,
    ): Promise<T> {
      handle.exec("begin")

      try {
        const result = await callback(database)
        handle.exec("commit")
        return result
      } catch (error) {
        try {
          handle.exec("rollback")
        } catch {
          // データベース側のrollbackに失敗しても、元のtransactionエラーを維持する。
        }

        throw error
      }
    },
  } as BetterSqlite3Database

  database.schema = createSchema(database)

  return database
}
