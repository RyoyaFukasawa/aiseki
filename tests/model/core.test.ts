import { describe, expect, it } from "vitest"

import { Model } from "../../src/model/base.js"

describe("Model core", () => {
  it("serializes model attributes without exposing hidden fields", () => {
    class User extends Model {
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

    expect(user.toObject()).toEqual({
      id: 1,
      email: "user@example.com",
    })
    expect(user.toJSON()).toEqual({
      id: 1,
      email: "user@example.com",
    })
  })

  it("returns the value of the configured primary key", () => {
    class ApiKey extends Model {
      static readonly primaryKey = "key"

      declare key: string
    }

    const apiKey = new ApiKey({ key: "key_123" })

    expect(apiKey.getKey()).toBe("key_123")
  })
})
