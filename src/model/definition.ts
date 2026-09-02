import { validateIdentifier } from "../schema/grammar.js"

export interface ModelDefinition<
  Row extends object,
  Instance extends object = Row,
> {
  readonly table: string
  readonly hydrate: (row: Row) => Instance
}

export function defineModel<Row extends object>(options: {
  table: string
}): ModelDefinition<Row, Row>
export function defineModel<Row extends object, Instance extends object>(
  options: {
    table: string
    hydrate: (row: Row) => Instance
  },
): ModelDefinition<Row, Instance>
export function defineModel<Row extends object, Instance extends object>(
  options: {
    table: string
    hydrate?: (row: Row) => Instance
  },
): ModelDefinition<Row, Row | Instance> {
  validateIdentifier(options.table)

  return {
    table: options.table,
    hydrate: options.hydrate ?? ((row: Row) => row),
  }
}
