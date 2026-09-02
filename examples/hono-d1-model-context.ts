import { createDB } from "aiseki"
import { createD1Database, type D1DatabaseLike } from "aiseki/d1"

import { modelDefinitions } from "./models.js"

export interface AisekiD1Env {
  DB: D1DatabaseLike
}

export function createAisekiContext(env: AisekiD1Env) {
  const DB = createDB(createD1Database(env.DB))

  return {
    DB,
    ...DB.models(modelDefinitions),
  }
}
