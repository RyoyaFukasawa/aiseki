import type { TransactionalDatabase } from "../database.js"

/**
 * CLIがアプリケーションから受け取るmigration設定。
 */
export interface AisekiConfig {
  /**
   * migration実行時にデータベースを作成するfactory。
   *
   * factoryにすることで、`make:migration`のようにデータベース接続が
   * 不要なコマンドでは接続を開かずに済む。
   */
  database: () =>
    | TransactionalDatabase
    | Promise<TransactionalDatabase>

  /**
   * migrationファイルを置くディレクトリ。省略時は`database/migrations`。
   */
  migrations?: string
}

/**
 * Aiseki CLI設定を型付きで宣言するためのhelper。
 *
 * 実行時には受け取った設定をそのまま返す。
 *
 * @param config CLI設定。
 * @returns 受け取ったCLI設定。
 */
export function defineConfig<T extends AisekiConfig>(config: T): T {
  return config
}
