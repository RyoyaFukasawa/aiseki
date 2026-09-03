# Aiseki

> A TypeScript ORM where objects and relational data share a table.

Aiseki is an experimental, framework-independent ORM for TypeScript. It is designed around an Eloquent-style developer experience while keeping database drivers and web frameworks separate.

The project is distributed as one package. Runtime-specific database clients are optional peer dependencies, and their adapters are exposed through subpaths:

```txt
aiseki                    ORM core and drivers
aiseki/<driver>            runtime-specific database drivers
```

The project is currently in the foundation phase. The current milestone includes
the runtime-neutral database boundary, Query Builder, request-scoped Model
binding, Schema Builder, migrations, and the migration CLI. Relation, direct
Hono integration, and Better Auth integration are planned for later milestones.

## Runtime-neutral database boundary

Aiseki core does not import Hono, a runtime-specific API, or a concrete database client. Its database contract is asynchronous so it can be implemented by local, remote, and edge database drivers:

```ts
interface Database {
  exec(sql: string): Promise<void>
  run(
    sql: string,
    parameters?: readonly SqlParameter[],
  ): Promise<RunResult>
  all<T extends object = Record<string, unknown>>(
    sql: string,
    parameters?: readonly SqlParameter[],
  ): Promise<ReadonlyArray<T>>
}

interface RunResult {
  changes: number
  lastInsertId: number | null
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

## Query Builder and request-scoped models

Wrap any raw `Database` adapter with `createDB()` to add the runtime-neutral
Query Builder. `DB.query()` returns plain rows and binds every value as a SQL
parameter:

```ts
import { createDB } from "aiseki"
import { createD1Database } from "aiseki/d1"

const DB = createDB(createD1Database(env.DB))
const user = await DB
  .query<{ id: number; email: string }>("users")
  .where("email", email)
  .first()
```

Use `DB.query().select(...)` for partial plain-row projections. Hydrated model
queries intentionally select complete rows, so `User.query()` does not expose
`select()` in this milestone.

Null equality uses SQL null semantics: `.where("deleted_at", null)` compiles to
`IS NULL`, while `!=` and `<>` compile to `IS NOT NULL`. Other comparison
operators reject `null` instead of producing a predicate that can never match.

`orderBy()`, `limit()`, and `offset()` are read-only modifiers. Calling
`update()` or `delete()` on a query that contains any of them rejects the write
instead of silently applying it to more rows. Start a separate query containing
only the intended `where()` conditions for writes.

Models are classes with a table name and typed fields. Source model classes
do not contain a database connection, so they can be collected once in an
explicit registry and safely reused across requests:

```ts
import { Model } from "aiseki"

export class User extends Model {
  static readonly table = "users"
  declare id: number
  declare email: string
  declare active: boolean

  emailDomain(): string {
    return this.email.split("@")[1] ?? ""
  }
}

export const models = {
  User,
} as const
```

An application context factory binds the whole registry to the database for
the current request. A typical application layout keeps definitions,
infrastructure, and routes separate:

```txt
src/
  models/
    user.ts
    order.ts
    index.ts           # model class registry
  infrastructure/
    aiseki-context.ts  # request-scoped DB and model binding
  routes/
    users.ts
```

The context factory depends only on Aiseki's structural D1 type, so it does not
require Hono in the library:

```ts
import { createDB } from "aiseki"
import { createD1Database, type D1DatabaseLike } from "aiseki/d1"
import { models } from "../models/index.js"

interface AisekiD1Env {
  DB: D1DatabaseLike
}

export function createAisekiContext(env: AisekiD1Env) {
  const DB = createDB(createD1Database(env.DB))

  return {
    DB,
    ...DB.models(models),
  }
}
```

The Hono application can create that context once per request and expose it
through `c.var`:

```ts
app.use("*", async (c, next) => {
  c.set("aiseki", createAisekiContext(c.env))
  await next()
})

app.get("/users", async (c) => {
  const { User } = c.var.aiseki
  const users = await User.query().where("active", true).get()

  return c.json(users.map((user) => ({
    id: user.id,
    email: user.email,
    active: user.active,
    emailDomain: user.emailDomain(),
  })))
})
```

`DB.models()` returns request-bound subclasses. Their static `query()` method
uses that request's database, and hydrated rows are real model instances, so
custom instance methods remain available. The original model classes and
registry are not mutated.

Bound models also provide the basic persistence lifecycle before relations are
introduced:

```ts
const user = await User.findOrFail(1)
user.email = "new@example.com"
await user.save()

const created = await User.create({
  email: "created@example.com",
  active: true,
})
await created.delete()
```

`id` is the default primary key. A model with another primary key can override
the static property:

```ts
export class ApiKey extends Model {
  static readonly table = "api_keys"
  static readonly primaryKey = "key_id"
  declare key_id: number
}
```

`create()` and inserting through `save()` use the driver's `lastInsertId` when
the primary key is omitted. The SQLite and D1 drivers normalize their native
write results to Aiseki's `RunResult` contract.

Adding a model changes its class and the `models` registry only; the context
factory and middleware remain unchanged. A global mutable API such as
`User.setDatabase(DB)` is intentionally avoided because concurrent requests
could overwrite each other's connection. Runtime filesystem discovery is also
avoided because file access and dynamic imports differ across Workers, Bun,
Node.js, and bundlers; the explicit registry stays portable and statically
typed.

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
