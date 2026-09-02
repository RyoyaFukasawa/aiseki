import { defineModel } from "aiseki"

export interface UserRow {
  id: number
}

export const modelDefinitions = {
  User: defineModel<UserRow>({ table: "users" }),
} as const
