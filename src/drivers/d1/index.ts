import type {
  Database,
  RunResult,
  SqlParameter,
} from "../../database/types.js"

/**
 * AisekiのD1 driverが利用するD1 prepared statementのサブセット。
 *
 * structural typeにすることで、driverがHonoや`@cloudflare/workers-types`に
 * 依存しないようにしている。
 */
export interface D1PreparedStatementLike {
  /** 文のプレースホルダーに値をバインドする。 */
  bind(...parameters: unknown[]): D1PreparedStatementLike

  /** 文を実行して書き込み結果を返す。 */
  run(): Promise<D1RunResultLike>

  /** 文を実行して結果の行を返す。 */
  all<T = Record<string, unknown>>(): Promise<{
    results?: ReadonlyArray<T>
  }>
}

/**
 * D1 prepared statementの書き込み結果のサブセット。
 */
export interface D1RunResultLike {
  meta?: {
    changes?: number
    last_row_id?: number
  }
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
 * atomic batchを提供するD1 database bindingのサブセット。
 */
export interface D1BatchDatabaseLike extends D1DatabaseLike {
  /** prepared statement群を原子的に実行する。 */
  batch(statements: D1PreparedStatementLike[]): Promise<unknown>
}

/**
 * D1 batch transaction callbackで利用できるwrite-onlyなSQL境界。
 *
 * `all()`はbatchを送信するまで結果を返せないため、意図的に提供しない。
 */
export interface D1Transaction {
  /**
   * 1つのSQL文をtransaction batchに追加する。
   *
   * 複数文のSQLはatomic batchに安全に変換できないためrejectされる。
   */
  exec(sql: string): Promise<void>

  /** パラメーター付きのSQL文をtransaction batchに追加する。 */
  run(sql: string, parameters?: readonly SqlParameter[]): Promise<void>
}

/**
 * D1 databaseをAisekiの非同期SQL境界に適合させたもの。
 *
 * `transaction()`はD1のbatch transactionで表現できるwrite-only callbackを
 * 受け取る。読み取りを必要とするcallbackには`TransactionalDatabase`を使う。
 */
export interface D1DatabaseAdapter extends Database {
  transaction: <T>(
    callback: (database: D1Transaction) => Promise<T> | T,
  ) => Promise<T>
}

const D1_TRANSACTION_EXEC_ERROR =
  "D1 transaction exec accepts exactly one SQL statement"

function assertSingleSqlStatement(sql: string): void {
  let state:
    | "normal"
    | "singleQuote"
    | "doubleQuote"
    | "backtickQuote"
    | "bracketQuote"
    | "lineComment"
    | "blockComment" = "normal"
  let terminated = false

  for (let index = 0; index < sql.length; index += 1) {
    const character = sql[index]
    const nextCharacter = sql[index + 1]

    if (state === "singleQuote") {
      if (character === "'") {
        if (nextCharacter === "'") {
          index += 1
        } else {
          state = "normal"
        }
      }
      continue
    }

    if (state === "doubleQuote") {
      if (character === '"') {
        if (nextCharacter === '"') {
          index += 1
        } else {
          state = "normal"
        }
      }
      continue
    }

    if (state === "backtickQuote") {
      if (character === "`") {
        state = "normal"
      }
      continue
    }

    if (state === "bracketQuote") {
      if (character === "]") {
        state = "normal"
      }
      continue
    }

    if (state === "lineComment") {
      if (character === "\n") {
        state = "normal"
      }
      continue
    }

    if (state === "blockComment") {
      if (character === "*" && nextCharacter === "/") {
        state = "normal"
        index += 1
      }
      continue
    }

    if (terminated) {
      if (/\s/.test(character)) {
        continue
      }

      if (character === "-" && nextCharacter === "-") {
        state = "lineComment"
        index += 1
        continue
      }

      if (character === "/" && nextCharacter === "*") {
        state = "blockComment"
        index += 1
        continue
      }

      throw new Error(D1_TRANSACTION_EXEC_ERROR)
    }

    if (character === "'") {
      state = "singleQuote"
    } else if (character === '"') {
      state = "doubleQuote"
    } else if (character === "`") {
      state = "backtickQuote"
    } else if (character === "[") {
      state = "bracketQuote"
    } else if (character === "-" && nextCharacter === "-") {
      state = "lineComment"
      index += 1
    } else if (character === "/" && nextCharacter === "*") {
      state = "blockComment"
      index += 1
    } else if (character === ";") {
      terminated = true
    }
  }
}

function hasBatch(
  handle: D1DatabaseLike,
): handle is D1BatchDatabaseLike {
  return "batch" in handle && typeof handle.batch === "function"
}

function normalizeRunResult(result: D1RunResultLike): RunResult {
  return {
    changes: result.meta?.changes ?? 0,
    lastInsertId: result.meta?.last_row_id ?? null,
  }
}

/**
 * Cloudflare D1 bindingからAisekiのデータベースを作成する。
 *
 * @param handle Workerの`env.DB`などのD1 binding。
 * @returns Aisekiのruntime-neutralなSQL境界を実装したデータベース。
 */
export function createD1Database(
  handle: D1BatchDatabaseLike,
): D1DatabaseAdapter
export function createD1Database(handle: D1DatabaseLike): Database
export function createD1Database(handle: D1DatabaseLike): Database {
  const prepareStatement = (
    sql: string,
    parameters: readonly SqlParameter[] = [],
  ): D1PreparedStatementLike => {
    const statement = handle.prepare(sql)

    return parameters.length === 0 ? statement : statement.bind(...parameters)
  }

  const database: Database = {
    async exec(sql) {
      await handle.exec(sql)
    },

    async run(sql, parameters: readonly SqlParameter[] = []) {
      const result = await prepareStatement(sql, parameters).run()
      return normalizeRunResult(result)
    },

    async all<T extends object>(
      sql: string,
      parameters: readonly SqlParameter[] = [],
    ): Promise<ReadonlyArray<T>> {
      const result = await prepareStatement(sql, parameters).all<T>()

      return result.results ?? []
    },

  }

  if (!hasBatch(handle)) {
    return database
  }

  const transactionDatabase: D1DatabaseAdapter = {
    ...database,
    async transaction<T>(
      callback: (transaction: D1Transaction) => Promise<T> | T,
    ): Promise<T> {
      const statements: D1PreparedStatementLike[] = []
      const transaction: D1Transaction = {
        async exec(sql) {
          assertSingleSqlStatement(sql)
          statements.push(prepareStatement(sql))
        },

        async run(sql, parameters: readonly SqlParameter[] = []) {
          statements.push(prepareStatement(sql, parameters))
        },
      }
      const result = await callback(transaction)

      if (statements.length > 0) {
        await handle.batch(statements)
      }

      return result
    },
  }

  return transactionDatabase
}
