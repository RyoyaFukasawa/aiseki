import { describe, expect, it } from "vitest"

import { createAisekiContext } from "../../examples/hono-d1-model-context.js"

function createFakeD1(rows: ReadonlyArray<object>) {
  const statement = {
    bind() {
      return statement
    },
    async run() {
      return {
        meta: {
          changes: 0,
          last_row_id: 0,
        },
      }
    },
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

    const [firstUser, secondUser] = await Promise.all([
      first.User.query().first(),
      second.User.query().first(),
    ])

    expect(firstUser?.id).toBe(1)
    expect(firstUser?.isFirstUser()).toBe(true)
    expect(secondUser?.id).toBe(2)
    expect(secondUser?.isFirstUser()).toBe(false)
  })
})
