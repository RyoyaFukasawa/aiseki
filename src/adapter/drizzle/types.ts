import type {
  AnyColumn,
  InferSelectModel,
  SQL,
  Table,
} from "drizzle-orm"

import type { Model } from "../../model/base.js"

/** Drizzleのtableを参照するModel constructor。 */
export type AnyDrizzleModelConstructor = {
  readonly table: Table
  readonly primaryKey: AnyColumn
  new (row: object): Model
}

/** Drizzle Modelが宣言したtable metadata。 */
export type DrizzleModelTable<
  Constructor extends AnyDrizzleModelConstructor,
> = Constructor extends { readonly table: infer TableType }
  ? TableType extends Table
    ? TableType
    : never
  : never

/** Drizzle Modelのtableから推論されるselect row型。 */
export type DrizzleModelRow<
  Constructor extends AnyDrizzleModelConstructor,
> = InferSelectModel<DrizzleModelTable<Constructor>>

/** Drizzle Model constructorが生成するinstance型。 */
export type DrizzleModelInstance<
  Constructor extends AnyDrizzleModelConstructor,
> = Constructor extends { new (row: object): infer Instance }
  ? Instance
  : never

/** DrizzleのrowをModel instanceへhydrateするquery。 */
export interface DrizzleModelQuery<
  Constructor extends AnyDrizzleModelConstructor,
> {
  where(condition: SQL): this
  get(): Promise<ReadonlyArray<DrizzleModelInstance<Constructor>>>
  first(): Promise<DrizzleModelInstance<Constructor> | null>
}

/** 1つのrequest-scoped Drizzle databaseへbindされたModel constructor。 */
export type BoundDrizzleModel<
  Constructor extends AnyDrizzleModelConstructor,
> = Constructor & {
  query(): DrizzleModelQuery<Constructor>
  find(id: unknown): Promise<DrizzleModelInstance<Constructor> | null>
  findOrFail(id: unknown): Promise<DrizzleModelInstance<Constructor>>
}

export type DrizzleModelConstructors = Readonly<
  Record<string, AnyDrizzleModelConstructor>
>

export type BoundDrizzleModels<
  Constructors extends DrizzleModelConstructors,
> = {
  [Key in Extract<keyof Constructors, string>]: BoundDrizzleModel<
    Constructors[Key]
  >
}
