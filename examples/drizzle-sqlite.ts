import Sqlite from "better-sqlite3"
import { eq } from "drizzle-orm"
import { drizzle } from "drizzle-orm/better-sqlite3"

import { createDB } from "aiseki/drizzle"

import { modelDefinitions, users } from "./models.js"

/** 実際のアプリケーションでは、この関数をrequest contextの生成に使う。 */
export function createAisekiContext(
  database: ReturnType<typeof drizzle>,
) {
  const DB = createDB(database)

  return {
    DB,
    ...DB.models(modelDefinitions),
  }
}

export async function main(): Promise<void> {
  const sqlite = new Sqlite(":memory:")
  sqlite.exec(`
    create table users (
      id integer primary key,
      email text not null,
      status text not null,
      password_hash text not null
    )
  `)
  sqlite
    .prepare(
      "insert into users (id, email, status, password_hash) values (?, ?, ?, ?)",
    )
    .run(1, "user@example.com", "active", "not-for-json")

  const { User } = createAisekiContext(drizzle(sqlite))
  const user = await User.query()
    .where(eq(users.email, "user@example.com"))
    .first()

  if (user === null) {
    throw new Error("User was not found")
  }

  console.log(user.emailDomain())
  console.log(user.toJSON())
  // { id: 1, email: "user@example.com", status: "active" }

  sqlite.close()
}

if (
  process.argv[1] !== undefined &&
  import.meta.url === new URL(process.argv[1], "file:").href
) {
  await main()
}
