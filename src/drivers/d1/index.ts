import type { Database, SqlParameter } from "../../database.js"

/**
 * AisekiのD1 driverが利用するD1 prepared statementのサブセット。
 *
 * structural typeにすることで、driverがHonoや`@cloudflare/workers-types`に
 * 依存しないようにしている。
 */
export interface D1PreparedStatementLike {
  /** 文のプレースホルダーに値をバインドする。 */
  bind(...parameters: unknown[]): D1PreparedStatementLike

  /** 行を返さずに文を実行する。 */
  run(): Promise<unknown>

  /** 文を実行して結果の行を返す。 */
  all<T = Record<string, unknown>>(): Promise<{
    results?: ReadonlyArray<T>
  }>
}

/**
 * AisekiのD1 driverが利用するD1 database bindingのサブセット。
 */
export interface D1DatabaseLike {
  /** SQL文をprepared statementとして準備する。 */
  prepare(sql: string): D1PreparedStatementLike

  /** 行を返さずにSQLを実行する。 */
  exec(sql: string): Promise<unknown>
}

/**
 * D1 databaseをAisekiの非同期SQL境界に適合させたもの。
 */
export interface D1DatabaseAdapter extends Database {}

/**
 * Cloudflare D1 bindingからAisekiのデータベースを作成する。
 *
 * @param handle Workerの`env.DB`などのD1 binding。
 * @returns Aisekiのruntime-neutralなSQL境界を実装したデータベース。
 */
export function createD1Database(handle: D1DatabaseLike): D1DatabaseAdapter {
  return {
    async exec(sql) {
      await handle.exec(sql)
    },

    async run(sql, parameters: readonly SqlParameter[] = []) {
      const statement = handle.prepare(sql)
      const boundStatement =
        parameters.length === 0 ? statement : statement.bind(...parameters)

      await boundStatement.run()
    },

    async all<T extends object>(
      sql: string,
      parameters: readonly SqlParameter[] = [],
    ): Promise<ReadonlyArray<T>> {
      const statement = handle.prepare(sql)
      const boundStatement =
        parameters.length === 0 ? statement : statement.bind(...parameters)
      const result = await boundStatement.all<T>()

      return result.results ?? []
    },
  }
}
