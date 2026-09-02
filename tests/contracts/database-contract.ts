import { describe, expect, it } from "vitest"
import type { Database, TransactionalDatabase } from "../../src/database.js"

export interface DatabaseContractFixture<
  TDatabase extends Database = Database,
> {
  database: TDatabase
  cleanup: () => Promise<void> | void
}

export type DatabaseContractFactory<
  TDatabase extends Database = Database,
> = () => DatabaseContractFixture<TDatabase>

export function testDatabaseContract(
  createFixture: DatabaseContractFactory,
): void {
  describe("Database contract", () => {
    it("executes SQL statements without returning rows", async () => {
      const { database, cleanup } = createFixture()

      try {
        await database.exec(
          "create table users (id integer primary key, name text not null)",
        )
        await database.exec("insert into users (name) values ('Taro')")

        await expect(database.all("select * from users")).resolves.toEqual([
          { id: 1, name: "Taro" },
        ])
      } finally {
        await cleanup()
      }
    })

    it("binds parameters for run", async () => {
      const { database, cleanup } = createFixture()

      try {
        await database.exec(
          "create table users (id integer primary key, name text not null)",
        )
        await database.run("insert into users (name) values (?)", ["Taro"])

        await expect(database.all("select name from users")).resolves.toEqual([
          { name: "Taro" },
        ])
      } finally {
        await cleanup()
      }
    })

    it("binds parameters for all", async () => {
      const { database, cleanup } = createFixture()

      try {
        await database.exec(
          "create table users (id integer primary key, name text not null)",
        )
        await database.exec(
          "insert into users (name) values ('Taro'), ('Jiro')",
        )

        await expect(
          database.all("select name from users where name = ?", ["Jiro"]),
        ).resolves.toEqual([{ name: "Jiro" }])
      } finally {
        await cleanup()
      }
    })
  })
}

export function testTransactionalDatabaseContract(
  createFixture: DatabaseContractFactory<TransactionalDatabase>,
): void {
  describe("TransactionalDatabase contract", () => {
    it("commits changes when the transaction callback succeeds", async () => {
      const { database, cleanup } = createFixture()

      try {
        await database.exec(
          "create table users (id integer primary key, name text not null)",
        )

        await database.transaction(async (transaction) => {
          await transaction.run("insert into users (name) values (?)", ["Taro"])
        })

        await expect(database.all("select name from users")).resolves.toEqual([
          { name: "Taro" },
        ])
      } finally {
        await cleanup()
      }
    })

    it("rolls back changes when the transaction callback fails", async () => {
      const { database, cleanup } = createFixture()

      try {
        await database.exec(
          "create table users (id integer primary key, name text not null)",
        )

        await expect(
          database.transaction(async (transaction) => {
            await transaction.run("insert into users (name) values (?)", ["Taro"])
            throw new Error("transaction failed")
          }),
        ).rejects.toThrow("transaction failed")

        await expect(database.all("select name from users")).resolves.toEqual([])
      } finally {
        await cleanup()
      }
    })
  })
}
