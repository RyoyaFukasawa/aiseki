import Sqlite from "better-sqlite3"

import type {
  ClosableDatabase,
  Database,
  SqlParameter,
  TransactionalDatabase,
} from "../../database.js"

/**
 * `better-sqlite3`を利用するローカルSQLiteデータベース。
 *
 * このdriverはリソースのcloseとcallbackベースのtransactionを提供する。
 */
export interface BetterSqlite3Database
  extends ClosableDatabase, TransactionalDatabase {}

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

  const database: BetterSqlite3Database = {
    async exec(sql) {
      handle.exec(sql)
    },

    async run(sql, parameters: readonly SqlParameter[] = []) {
      handle.prepare(sql).run(...parameters)
    },

    async all<T extends object>(
      sql: string,
      parameters: readonly SqlParameter[] = [],
    ): Promise<ReadonlyArray<T>> {
      return handle.prepare(sql).all(...parameters) as ReadonlyArray<T>
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
  }

  return database
}
