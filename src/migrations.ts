import type { Database, TransactionalDatabase } from "./database.js"

const MIGRATIONS_TABLE = "aiseki_migrations"

/**
 * rollback可能なスキーマ変更。
 *
 * migration名はデータベースに保存されるため、適用後も変更してはいけない。
 */
export interface Migration {
  /** migrationを識別する一意で安定した名前。 */
  name: string

  /** スキーマ変更を適用する。 */
  up(database: Database): Promise<void> | void

  /** スキーマ変更を元に戻す。 */
  down(database: Database): Promise<void> | void
}

/**
 * migration定義を型付きで宣言するためのhelper。
 *
 * 実行時には受け取った定義をそのまま返す。実際の検証は`Migrator`が行う。
 *
 * @param migration migrationの定義。
 * @returns 受け取ったmigration定義。
 */
export function defineMigrate<T extends Migration>(migration: T): T {
  return migration
}

interface MigrationRecord {
  id: number
  name: string
  batch: number
}

/**
 * 未適用のmigrationを適用し、最新のmigration batchを元に戻す。
 *
 * `migrate()`は未適用のmigrationを宣言順に1つのtransactionとして適用する。
 * `rollback()`は最新のbatchを逆順に元に戻す。
 *
 * @remarks 渡されるデータベースは`TransactionalDatabase`を実装している
 * 必要がある。runnerは適用済みmigrationを内部の`aiseki_migrations`テーブルに
 * 記録する。
 */
export class Migrator {
  private readonly migrationsByName: ReadonlyMap<string, Migration>

  /**
   * migration runnerを作成する。
   *
   * @param database スキーマ変更とmigrationの記録に使用するデータベース。
   * @param migrations 適用する順番に並べたmigration。
   * @throws migration名が空、または重複している場合。
   */
  constructor(
    private readonly database: TransactionalDatabase,
    migrations: readonly Migration[],
  ) {
    const migrationsByName = new Map<string, Migration>()

    for (const migration of migrations) {
      if (!migration.name) {
        throw new Error("Migration name must not be empty")
      }

      if (migrationsByName.has(migration.name)) {
        throw new Error(`Duplicate migration name: ${migration.name}`)
      }

      migrationsByName.set(migration.name, migration)
    }

    this.migrationsByName = migrationsByName
    this.migrations = migrations
  }

  private readonly migrations: readonly Migration[]

  /**
   * 適用済みとして記録されていないmigrationをすべて適用する。
   *
   * @returns この呼び出しで適用したmigration名。未適用のものがなければ空配列。
   * @throws データベースに存在するmigration名が定義にない場合、または
   * migrationが失敗した場合。
   */
  async migrate(): Promise<ReadonlyArray<string>> {
    await this.ensureMigrationsTable()

    const appliedRows = await this.database.all<Pick<MigrationRecord, "name">>(
      `select name from ${MIGRATIONS_TABLE} order by id asc`,
    )
    this.assertKnownMigrations(appliedRows)

    const appliedNames = new Set(appliedRows.map((row) => row.name))
    const pendingMigrations = this.migrations.filter(
      (migration) => !appliedNames.has(migration.name),
    )

    if (pendingMigrations.length === 0) {
      return []
    }

    const batchRows = await this.database.all<{ batch: number }>(
      `select coalesce(max(batch), 0) as batch from ${MIGRATIONS_TABLE}`,
    )
    const batch = (batchRows[0]?.batch ?? 0) + 1

    return this.database.transaction(async (database) => {
      const appliedNamesInBatch: string[] = []

      for (const migration of pendingMigrations) {
        await migration.up(database)
        await database.run(
          `insert into ${MIGRATIONS_TABLE} (name, batch) values (?, ?)`,
          [migration.name, batch],
        )
        appliedNamesInBatch.push(migration.name)
      }

      return appliedNamesInBatch
    })
  }

  /**
   * 最新のbatchに含まれるmigrationをすべて元に戻す。
   *
   * @returns rollbackした順番のmigration名。適用済みbatchがなければ空配列。
   * @throws 適用済みmigrationが定義にない場合、またはrollbackが失敗した場合。
   */
  async rollback(): Promise<ReadonlyArray<string>> {
    await this.ensureMigrationsTable()

    const latestBatch = await this.database.all<MigrationRecord>(
      `select id, name, batch from ${MIGRATIONS_TABLE}
       where batch = (select max(batch) from ${MIGRATIONS_TABLE})
       order by id desc`,
    )

    if (latestBatch.length === 0) {
      return []
    }
    this.assertKnownMigrations(latestBatch)

    return this.database.transaction(async (database) => {
      const rolledBackNames: string[] = []

      for (const record of latestBatch) {
        const migration = this.migrationsByName.get(record.name)

        if (!migration) {
          throw new Error(`Applied migration is not defined: ${record.name}`)
        }

        await migration.down(database)
        await database.run(
          `delete from ${MIGRATIONS_TABLE} where id = ?`,
          [record.id],
        )
        rolledBackNames.push(record.name)
      }

      return rolledBackNames
    })
  }

  private async ensureMigrationsTable(): Promise<void> {
    await this.database.exec(`
      create table if not exists ${MIGRATIONS_TABLE} (
        id integer primary key autoincrement,
        name text not null unique,
        batch integer not null
      )
    `)
  }

  private assertKnownMigrations(
    records: ReadonlyArray<Pick<MigrationRecord, "name">>,
  ): void {
    for (const record of records) {
      if (!this.migrationsByName.has(record.name)) {
        throw new Error(`Applied migration is not defined: ${record.name}`)
      }
    }
  }
}
