import { createBetterSqlite3Database } from "../src/drivers/better-sqlite3/index.js"
import {
  testDatabaseContract,
  testTransactionalDatabaseContract,
} from "./contracts/database-contract.js"

testDatabaseContract(() => {
  const database = createBetterSqlite3Database(":memory:")

  return {
    database,
    cleanup: () => database.close(),
  }
})

testTransactionalDatabaseContract(() => {
  const database = createBetterSqlite3Database(":memory:")

  return {
    database,
    cleanup: () => database.close(),
  }
})
