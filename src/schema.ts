import type { Database } from "./database.js"
import {
  compileCreateTable,
  compileDropTable,
  compileUniqueIndex,
  validateIdentifier,
  type ColumnDefinition,
  type ColumnType,
  type DefaultValue,
} from "./schema/grammar.js"

export type { DefaultValue } from "./schema/grammar.js"

export interface ColumnBuilder {
  nullable(): this
  defaultTo(value: DefaultValue): this
  primary(): this
  unique(): this
}

export interface TableBuilder {
  id(name?: string): ColumnBuilder
  string(name: string): ColumnBuilder
  text(name: string): ColumnBuilder
  integer(name: string): ColumnBuilder
  boolean(name: string): ColumnBuilder
  timestamps(): void
}

export interface Schema {
  createTable(name: string, callback: (table: TableBuilder) => void): Promise<void>
  dropTable(name: string): Promise<void>
}

/**
 * 最小限のSQL実行境界からSchema Builderを作成する。
 *
 * coreは特定のSQLite driverを参照せず、生成したSQLを`exec`へ渡すだけにする。
 */
export function createSchema(database: Pick<Database, "exec">): Schema {
  return new SchemaBuilder(database)
}

class SchemaBuilder implements Schema {
  constructor(private readonly database: Pick<Database, "exec">) {}

  async createTable(
    name: string,
    callback: (table: TableBuilder) => void,
  ): Promise<void> {
    validateIdentifier(name)

    const table = new TableDefinitionBuilder()
    callback(table)

    if (table.columns.length === 0) {
      throw new Error(`Table "${name}" must define at least one column`)
    }

    const definition = { name, columns: table.columns }
    await this.database.exec(compileCreateTable(definition))

    for (const column of table.columns) {
      if (column.unique) {
        await this.database.exec(compileUniqueIndex(name, column.name))
      }
    }
  }

  async dropTable(name: string): Promise<void> {
    await this.database.exec(compileDropTable(name))
  }
}

class TableDefinitionBuilder implements TableBuilder {
  readonly columns: ColumnDefinition[] = []

  id(name = "id"): ColumnBuilder {
    return this.addColumn(name, "integer", { primary: true, autoIncrement: true })
  }

  string(name: string): ColumnBuilder {
    return this.addColumn(name, "text")
  }

  text(name: string): ColumnBuilder {
    return this.addColumn(name, "text")
  }

  integer(name: string): ColumnBuilder {
    return this.addColumn(name, "integer")
  }

  boolean(name: string): ColumnBuilder {
    return this.addColumn(name, "integer")
  }

  timestamps(): void {
    this.string("created_at")
    this.string("updated_at")
  }

  private addColumn(
    name: string,
    type: ColumnType,
    options: Partial<Pick<ColumnDefinition, "primary" | "autoIncrement">> = {},
  ): ColumnBuilder {
    const column: ColumnDefinition = {
      name,
      type,
      nullable: false,
      hasDefault: false,
      defaultValue: null,
      primary: options.primary ?? false,
      unique: false,
      autoIncrement: options.autoIncrement ?? false,
    }
    this.columns.push(column)

    return new ColumnDefinitionBuilder(column)
  }
}

class ColumnDefinitionBuilder implements ColumnBuilder {
  constructor(private readonly column: ColumnDefinition) {}

  nullable(): this {
    this.column.nullable = true
    return this
  }

  defaultTo(value: DefaultValue): this {
    this.column.hasDefault = true
    this.column.defaultValue = value
    return this
  }

  primary(): this {
    this.column.primary = true
    return this
  }

  unique(): this {
    this.column.unique = true
    return this
  }
}
