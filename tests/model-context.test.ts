import { describe, expect, it } from "vitest"

import { createAisekiContext } from "../examples/hono-d1-model-context.js"

function createFakeD1(rows: ReadonlyArray<object>) {
  const statement = {
    bind() {
      return statement
    },
    async run() {},
    async all<T>() {
      return { results: rows as ReadonlyArray<T> }
    },
  }

  return {
    prepare() {
      return statement
    },
    async exec() {},
  }
}

describe("request-scoped model context", () => {
  it("creates isolated contexts without a global connection", async () => {
    const first = createAisekiContext({ DB: createFakeD1([{ id: 1 }]) })
    const second = createAisekiContext({ DB: createFakeD1([{ id: 2 }]) })

    await expect(first.User.query().first()).resolves.toEqual({ id: 1 })
    await expect(second.User.query().first()).resolves.toEqual({ id: 2 })
  })
})
