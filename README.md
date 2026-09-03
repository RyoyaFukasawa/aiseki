# Aiseki

> A lightweight Model layer for Drizzle ORM.

Aiseki adds class-based Models to Drizzle without replacing Drizzle's schema,
query builder, drivers, or migrations.

```txt
Model
  ↓
Aiseki Drizzle Adapter
  ↓
Drizzle ORM
  ↓
Database driver
```
The project is experimental. The current implementation focuses on the Model
core, request-scoped binding, hydration, primary keys, and serialization.
Relations, scopes, casts, and write APIs will be added incrementally.

## Installation

Drizzle is an optional peer dependency. Install it together with Aiseki:

```bash
pnpm add aiseki drizzle-orm
```

The database driver remains a Drizzle concern. For example, a local SQLite
application can install the Drizzle SQLite driver and `better-sqlite3`.

## Define a Model

Drizzle's table schema is the source of truth. Aiseki does not require a
separate `UserRow` interface.

```ts
// schema.ts
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core"

export const users = sqliteTable("users", {
  id: integer("id").primaryKey(),
  email: text("email").notNull(),
  status: text("status").notNull(),
})
```

```ts
// models/user.ts
import { Model } from "aiseki"

import { users } from "../db/schema.js"

export class User extends Model<typeof users> {
  static readonly table = users
  static readonly primaryKey = users.id
  static readonly hidden = [] as const

  declare id: number
  declare email: string
  declare status: string

  emailDomain(): string {
    return this.email.split("@")[1] ?? ""
  }
}
```

The table supplies the inferred row type. The class supplies runtime methods
and application-facing behavior.

## Bind a Model per request

The source Model does not hold a database connection. Bind it to the current
Drizzle client when creating an application context:

```ts
import { createDB } from "aiseki/drizzle"

import { User as UserModel } from "./models/user.js"

export function createContext<Database>(drizzleDatabase: Database) {
  const DB = createDB(drizzleDatabase)

  return {
    DB,
    User: DB.model(UserModel),
  }
}
```

With a registry, multiple Models can be bound at once:

```ts
const { User } = DB.models({ User: UserModel })
```

This request-scoped pattern works with Hono, Fastify, or any other framework
that creates a context per request. Aiseki does not depend on a web framework.

## Query and hydrate

Conditions use Drizzle's native SQL expressions. Results are hydrated into
instances of the source Model class:

```ts
import { eq } from "drizzle-orm"

const user = await User.query()
  .where(eq(users.email, "user@example.com"))
  .first()

const requiredUser = await User.findOrFail(1)
requiredUser.emailDomain()
```

The available read operations are:

```ts
const user = await User.find(id)       // User | null
const user = await User.findOrFail(id) // User
const users = await User.query().get() // User[]
```

`User.query()` delegates to Drizzle's `select().from(table)` query, so the
application can continue using Drizzle directly for queries that do not belong
in the Model layer.

## Serialization

`toObject()` and `toJSON()` expose the attributes received during hydration.
Static `hidden` fields are excluded from both results:

```ts
class User extends Model<typeof users> {
  static readonly table = users
  static readonly primaryKey = users.id
  static readonly hidden = ["passwordHash"] as const

  declare id: number
  declare email: string
  declare passwordHash: string
}

const user = new User({
  id: 1,
  email: "user@example.com",
  passwordHash: "secret",
})

user.toJSON()
// { id: 1, email: "user@example.com" }
```

## Why this is a Model layer

Drizzle remains responsible for:

- TypeScript schema definitions
- `$inferSelect` and `$inferInsert`
- SQL expressions and query execution
- Relations and relational queries
- Drivers, transactions, and migrations

Aiseki is responsible for:

- Runtime Model classes
- Hydrating rows into Model instances
- `find()` and `findOrFail()`
- Primary-key access through `getKey()`
- Domain methods
- `toObject()` and `toJSON()` serialization

Aiseki does not implement its own SQL compiler, database driver, migration
system, or ORM-wide query language.

## Future ORM adapters

Aiseki is Drizzle-first, but its long-term scope is a Model layer that can sit
on top of multiple ORMs. ORM-independent behavior belongs in the Model Core;
table metadata and query execution belong in adapters:

```txt
Aiseki Core
  Model / hydrate / serialize / domain behavior
        ↓
ORM Adapter
  Drizzle adapter / Prisma adapter / ...
        ↓
ORM and driver
```

The initial implementation intentionally uses Drizzle's native types and
expressions instead of inventing a lowest-common-denominator query API. This
keeps the first adapter type-safe while leaving room for a future Prisma
adapter.

## Development

```bash
pnpm run typecheck
pnpm run build
pnpm test
pnpm run typecheck:examples
```

Runnable and framework integration examples are available in [`examples/`](./examples/).
