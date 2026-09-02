# Aiseki

> A TypeScript ORM where objects and relational data share a table.

Aiseki is an experimental, framework-independent ORM for TypeScript. It is designed around an Eloquent-style developer experience while keeping database drivers and web frameworks separate.

The project is distributed as one package. Runtime-specific database clients are optional peer dependencies, and their adapters are exposed through subpaths:

```txt
aiseki                    ORM core and drivers
aiseki/<driver>            runtime-specific database drivers
```

The project is currently in the foundation phase. Models, relations, Schema Builder, Hono integration, and Better Auth integration will be added in later milestones.

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

## Migrations

Migrations are TypeScript values with explicit `up` and `down` functions. `migrate()` applies pending migrations in declaration order as one batch. `rollback()` reverts the latest batch in reverse order.

```ts
import type { Migration } from "aiseki"
import { Migrator } from "aiseki"
import { createBetterSqlite3Database } from "aiseki/better-sqlite3"

const migrations = [
  {
    name: "001_create_users",
    async up(database) {
      await database.exec(
        "create table users (id integer primary key, name text not null)",
      )
    },
    async down(database) {
      await database.exec("drop table users")
    },
  },
] satisfies readonly Migration[]

const database = createBetterSqlite3Database(":memory:")
const migrator = new Migrator(database, migrations)

await migrator.migrate()
await migrator.rollback()
await database.close()
```

`Migrator` requires a `TransactionalDatabase`, so the current migration runner works with adapters that provide atomic transactions. The Schema Builder is intentionally not part of this milestone, so raw SQL is the current escape hatch inside migrations.

## Development

```bash
pnpm install
pnpm test
pnpm typecheck
```
