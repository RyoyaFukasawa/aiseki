/**
 * SQL文のプレースホルダーにバインドできる値。
 *
 * Aisekiが対象とする各ランタイムで共通して扱える値だけを定義している。
 * driver固有の値は、データベース境界に渡す前に変換する。
 */
export type SqlParameter = string | number | boolean | null | Uint8Array

/**
 * Aisekiのcoreが利用する最小限の非同期SQL境界。
 *
 * database driverがこのinterfaceを実装することで、modelやmigrationの層が
 * 特定のランタイムやデータベースclientに依存しないようにする。
 */
export interface Database {
  /**
   * 行を返さずに1つ以上のSQL文を実行する。
   *
   * @param sql 実行するSQL。
   */
  exec(sql: string): Promise<void>

  /**
   * パラメーター付きのSQL文を実行し、行を返さない。
   *
   * @param sql 実行するSQL。
   * @param parameters `sql`のプレースホルダーにバインドする値。
   */
  run(sql: string, parameters?: readonly SqlParameter[]): Promise<void>

  /**
   * パラメーター付きのクエリを実行し、結果の行を返す。
   *
   * @typeParam T 結果の各行の型。
   * @param sql 実行するSQL。
   * @param parameters `sql`のプレースホルダーにバインドする値。
   */
  all<T extends object = Record<string, unknown>>(
    sql: string,
    parameters?: readonly SqlParameter[],
  ): Promise<ReadonlyArray<T>>
}

/**
 * 明示的なcloseを提供するランタイム向けの任意のデータベース機能。
 */
export interface ClosableDatabase extends Database {
  /**
   * 内部で保持しているデータベースリソースを解放する。
   */
  close(): Promise<void>
}

/**
 * callbackベースの原子的なtransactionを提供する任意のデータベース機能。
 *
 * migration runnerは、スキーマ変更とmigrationの記録を一緒にcommitまたは
 * rollbackするため、この機能を必要とする。
 */
export interface TransactionalDatabase extends Database {
  /**
   * callbackを1つのtransaction内で実行する。
   *
   * callbackには同じSQL境界を渡す。呼び出し側はdriverがどのように
   * transactionを開始・commit・rollbackするかを意識する必要がない。
   *
   * @typeParam T callbackの戻り値の型。
   * @param callback 原子的に実行する処理。
   */
  transaction<T>(
    callback: (database: Database) => Promise<T> | T,
  ): Promise<T>
}
