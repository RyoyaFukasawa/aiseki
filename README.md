# Aiseki

> A TypeScript ORM where objects and relational data share a table.

Aiseki is an experimental, framework-independent ORM for TypeScript. It is designed around an Eloquent-style developer experience while keeping database drivers and web frameworks separate.

The project is distributed as one package. Runtime-specific database clients are optional peer dependencies, and their adapters are exposed through subpaths:

```txt
aiseki                    ORM core and drivers
aiseki/<driver>            runtime-specific database drivers
```

The project is currently in the foundation phase. The current milestone includes
the runtime-neutral database boundary, Schema Builder, migrations, and the
migration CLI. Query Builder, Model, Relation, Hono integration, and Better
Auth integration are planned for later milestones.

## Runtime-neutral database boundary

Aiseki core does not import Hono, a runtime-specific API, or a concrete database client. Its database contract is asynchronous so it can be implemented by local, remote, and edge database drivers:

```ts
interface Database {
  exec(sql: string): Promise<void>
  run(sql: string, parameters?: readonly SqlParameter[]): Promise<void>
  all<T extends object = Record<string, unknown>>(
    sql: string,
    parameters?: readonly SqlParameter[],
  ): Promise<ReadonlyArray<T>>
}
```

Resource lifecycle and transactions are optional capabilities because they are not available in the same form on every runtime:

```ts
interface ClosableDatabase extends Database {
  close(): Promise<void>
}

interface TransactionalDatabase extends Database {
  transaction<T>(
    callback: (database: Database) => Promise<T> | T,
  ): Promise<T>
}
```

`SchemaDatabase` is the migration-facing extension that adds the Schema
Builder while preserving the raw `Database` contract:

```ts
interface SchemaDatabase extends Database {
  schema: Schema
}
```

The Node.js SQLite adapter is intentionally separate from the core:

```ts
import { createBetterSqlite3Database } from "aiseki/better-sqlite3"

const database = createBetterSqlite3Database(":memory:")
```

`better-sqlite3` is an optional peer dependency, so it is only needed when the Node.js adapter is used:

```bash
pnpm add aiseki better-sqlite3
```

A Cloudflare Workers application can use the D1 adapter without installing a Node.js database client:

```ts
import { createD1Database } from "aiseki/d1"

const database = createD1Database(env.DB)
```

The D1 adapter depends only on the structural shape of the D1 binding, so Aiseki does not require Hono or `@cloudflare/workers-types` at runtime. Other runtimes can provide their own adapter by implementing `Database`.

## Migrations and Schema Builder

Migrations are TypeScript values with explicit `up` and `down` functions.
`migrate()` applies pending migrations in declaration order as one batch.
`rollback()` reverts the latest batch in reverse order. The migration callback
receives `database.schema`, which provides the current SQLite Schema Builder:

```ts
import { defineMigrate, Migrator } from "aiseki"
import { createBetterSqlite3Database } from "aiseki/better-sqlite3"

const migrations = [
  defineMigrate({
    name: "001_create_users",
    async up(database) {
      await database.schema.createTable("users", (table) => {
        table.id()
        table.string("name")
        table.string("email").unique()
        table.timestamps()
      })
    },
    async down(database) {
      await database.schema.dropTable("users")
    },
  }),
]

const database = createBetterSqlite3Database(":memory:")
const migrator = new Migrator(database, migrations)

await migrator.migrate()
await migrator.rollback()
await database.close()
```

The Schema Builder currently supports SQLite table creation and removal with
common column types, modifiers, defaults, timestamps, and unique indexes. For
features it does not cover, use the raw SQL escape hatch that remains available
on the same migration database:

```ts
await database.exec(
  "create index users_name_index on users (name)",
)
await database.run(
  "update users set name = ? where id = ?",
  ["Ada", 1],
)
```

`Migrator` requires a `TransactionalDatabase`, so the current migration runner
works with adapters that provide an atomic transaction and a full read/write
transaction callback. The SQLite adapter satisfies this contract. D1's batch
transaction callback is intentionally write-only and does not expose `all()`;
generic `Migrator` integration for D1 is not supported yet. The D1 adapter can
still be used directly through its runtime-neutral SQL boundary.

## CLI: config, generate, migrate, and rollback

The CLI follows an Artisan-style workflow. Migration file generation is exposed
as `make:migration` (there is no separate `generate` command). It uses
`database/migrations` by default, so the first migration can be created before
the application configuration exists:

```bash
pnpm aiseki make:migration create_users_table
```

For `migrate` and `migrate:rollback`, create `aiseki.config.ts` in the application root:

```ts
import { defineConfig } from "aiseki"
import { createBetterSqlite3Database } from "aiseki/better-sqlite3"

export default defineConfig({
  database: () => createBetterSqlite3Database("./database.sqlite"),
  migrations: "./database/migrations",
})
```

Then run the migration commands:

```bash
pnpm aiseki migrate
pnpm aiseki migrate:rollback
```

`make:migration` only creates the file and does not open a database connection.
Generated migration files default-export a `defineMigrate(...)` definition.
The config file and migration files may import `defineConfig`, `defineMigrate`,
and the selected driver through the package surface (`aiseki` and, for local
SQLite, `aiseki/better-sqlite3`).

The package publishes `bin/aiseki.mjs`, so the built CLI can be run directly:

```bash
node bin/aiseki.mjs migrate
node bin/aiseki.mjs migrate:rollback
```

On Node 24, the published binary loads the `.ts` config and migration files
directly using Node's built-in TypeScript support. The repository's
`pnpm aiseki` script continues to run the source CLI through `tsx`. A Node
version without built-in TypeScript support must run the CLI through an
equivalent TypeScript loader or use compiled `.js`/`.mjs` config and migration
files; `tsx` remains a development tool and is not a runtime dependency.

## Development

```bash
pnpm install
pnpm test
pnpm typecheck
```
