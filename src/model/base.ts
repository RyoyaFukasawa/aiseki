import type { SqlParameter } from "../database/types.js"

export interface ModelPersistence {
  save(model: Model): Promise<void>
  delete(model: Model): Promise<void>
}

const modelSnapshots = new WeakMap<Model, Record<string, unknown>>()
const modelPersistence = new WeakMap<Model, ModelPersistence>()

export class Model {
  static readonly table: string
  static readonly primaryKey = "id"

  constructor(row: object) {
    modelSnapshots.set(this, { ...row })
    Object.assign(this, row)
  }

  /**
   * bound modelのdatabaseへ現在の属性を保存する。
   *
   * source modelを直接newした場合はdatabaseがないため、bound modelから
   * 作成したinstanceでのみ利用できる。
   */
  async save(): Promise<this> {
    const persistence = modelPersistence.get(this)

    if (!persistence) {
      throw new Error("This model instance is not bound to a database")
    }

    await persistence.save(this)
    return this
  }

  /**
   * bound modelのdatabaseから現在のinstanceを削除する。
   */
  async delete(): Promise<void> {
    const persistence = modelPersistence.get(this)

    if (!persistence) {
      throw new Error("This model instance is not bound to a database")
    }

    await persistence.delete(this)
  }
}

export interface ModelConstructor<
  Instance extends Model = Model,
> {
  readonly table: string
  new (row: object): Instance
}

export type AnyModelConstructor = ModelConstructor<any>

export type ModelInstance<Constructor extends AnyModelConstructor> =
  InstanceType<Constructor>

export function attachModelPersistence(
  model: Model,
  persistence: ModelPersistence,
): void {
  modelPersistence.set(model, persistence)
}

export function getModelAttributes(
  model: Model,
): Record<string, SqlParameter> {
  const snapshot = modelSnapshots.get(model)

  if (!snapshot) {
    throw new Error("Model attributes are not initialized")
  }

  const attributes: Record<string, SqlParameter> = {}

  for (const key of Object.keys(snapshot)) {
    attributes[key] = (model as unknown as Record<string, SqlParameter>)[key]
  }

  return attributes
}

export function syncModelAttributes(
  model: Model,
  attributes: Readonly<Record<string, SqlParameter>>,
): void {
  modelSnapshots.set(model, { ...attributes })
}
