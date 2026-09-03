import { createDB } from "aiseki/drizzle"
import { drizzle } from "drizzle-orm/d1"

import { modelDefinitions } from "./models.js"

/** drizzle-orm/d1が受け取るD1 binding型をそのまま利用する。 */
export type D1DatabaseBinding = Parameters<typeof drizzle>[0]

export interface Env {
  DB: D1DatabaseBinding
}

/** Honoのc.envから、現在のrequest専用のModel contextを作成する。 */
export function createAisekiContext(env: Env) {
  const DB = createDB(drizzle(env.DB))

  return {
    DB,
    ...DB.models(modelDefinitions),
  }
}

/*
  Hono側では、例えば次のように呼び出す。

  app.get("/users/:id", async (c) => {
    const { User } = createAisekiContext(c.env)
    const user = await User.findOrFail(Number(c.req.param("id")))

    return c.json(user.toJSON())
  })
*/
