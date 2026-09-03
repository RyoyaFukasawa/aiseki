import { describe, expect, it } from "vitest"

import {
  compileDelete,
  compileInsert,
  compileSelect,
  compileUpdate,
} from "../../src/query/grammar.js"

describe("query grammar", () => {
  it("compiles a parameterized select query", () => {
    expect(
      compileSelect({
        table: "users",
        columns: ["id", "name"],
        conditions: [
          { column: "email", operator: "=", value: "a@example.com" },
        ],
        orderBy: { column: "created_at", direction: "desc" },
        limit: 10,
        offset: 5,
      }),
    ).toEqual({
      sql: 'select "id", "name" from "users" where "email" = ? order by "created_at" desc limit ? offset ?',
      parameters: ["a@example.com", 10, 5],
    })
  })

  it("compiles parameterized writes without interpolating values", () => {
    expect(
      compileInsert("users", { email: "a@example.com", active: true }),
    ).toEqual({
      sql: 'insert into "users" ("active", "email") values (?, ?)',
      parameters: [true, "a@example.com"],
    })

    expect(
      compileUpdate(
        "users",
        { active: false },
        [{ column: "id", operator: "=", value: 1 }],
      ),
    ).toEqual({
      sql: 'update "users" set "active" = ? where "id" = ?',
      parameters: [false, 1],
    })

    expect(
      compileDelete("users", [{ column: "id", operator: "=", value: 1 }]),
    ).toEqual({
      sql: 'delete from "users" where "id" = ?',
      parameters: [1],
    })
  })

  it("compiles null equality predicates for selects, updates, and deletes", () => {
    expect(
      compileSelect({
        table: "users",
        conditions: [
          { column: "tenant_id", operator: "=", value: 7 },
          { column: "deleted_at", operator: "=", value: null },
        ],
      }),
    ).toEqual({
      sql: 'select * from "users" where "tenant_id" = ? and "deleted_at" is null',
      parameters: [7],
    })

    expect(
      compileUpdate(
        "users",
        { active: false },
        [{ column: "deleted_at", operator: "!=", value: null }],
      ),
    ).toEqual({
      sql: 'update "users" set "active" = ? where "deleted_at" is not null',
      parameters: [false],
    })

    expect(
      compileDelete(
        "users",
        [{ column: "deleted_at", operator: "<>", value: null }],
      ),
    ).toEqual({
      sql: 'delete from "users" where "deleted_at" is not null',
      parameters: [],
    })
  })

  it.each(["<", "<=", ">", ">=", "like"] as const)(
    "rejects null with the %s operator",
    (operator) => {
      expect(() => compileSelect({
        table: "users",
        conditions: [{ column: "deleted_at", operator, value: null }],
      })).toThrow(`Comparison operator ${operator} does not support null`)
    },
  )

  it("sorts write columns by stable code-point order", () => {
    expect(compileInsert("users", { alpha: 1, Zed: 2 })).toEqual({
      sql: 'insert into "users" ("Zed", "alpha") values (?, ?)',
      parameters: [2, 1],
    })
  })

  it("rejects unsafe identifiers and empty writes", () => {
    expect(() =>
      compileSelect({ table: "users; drop table users" }),
    ).toThrow("Invalid identifier")
    expect(() => compileInsert("users", {})).toThrow(
      "Insert values must not be empty",
    )
    expect(() => compileUpdate("users", {}, [])).toThrow(
      "Update values must not be empty",
    )
  })

  it("requires conditions for updates and deletes", () => {
    expect(() => compileUpdate("users", { active: false }, [])).toThrow(
      "Update conditions must not be empty",
    )
    expect(() => compileDelete("users", [])).toThrow(
      "Delete conditions must not be empty",
    )
  })

  it.each([-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects invalid select limits: %s",
    (limit) => {
      expect(() => compileSelect({ table: "users", limit })).toThrow(
        "Limit must be a non-negative integer",
      )
    },
  )

  it.each([-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects invalid select offsets: %s",
    (offset) => {
      expect(() => compileSelect({ table: "users", offset })).toThrow(
        "Offset must be a non-negative integer",
      )
    },
  )

  it("compiles an unrestricted select without a semicolon", () => {
    expect(compileSelect({ table: "users" })).toEqual({
      sql: 'select * from "users"',
      parameters: [],
    })
  })

  it("compiles offset-only selects with SQLite's unlimited limit", () => {
    expect(compileSelect({ table: "users", offset: 2 })).toEqual({
      sql: 'select * from "users" limit -1 offset ?',
      parameters: [2],
    })
  })
})
