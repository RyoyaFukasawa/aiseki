export class Model<Metadata = unknown> {
  static readonly table: unknown
  static readonly primaryKey: unknown = "id"

  /** toObject() / toJSON()の結果から除外する属性名。passwordなどの公開したくない値に使う。 */
  static readonly hidden: readonly string[] = []

  constructor(row: object) {
    modelAttributes.set(this, { ...row })
    Object.assign(this, row)
  }

  /**
   * Modelを識別するprimary keyの現在値を返す。
   */
  getKey(): unknown {
    const primaryKey = Reflect.get(this.constructor, "primaryKey")

    if (typeof primaryKey !== "string") {
      throw new Error("The Model primaryKey must be a string")
    }

    return Reflect.get(this, primaryKey)
  }

  /**
   * モデルの現在の属性を、APIレスポンスなどに渡せるplain objectへ変換する。
   *
   * constructorで受け取った属性だけを対象にするため、Modelへ追加した内部状態や
   * prototype上のmethodが結果へ混ざらない。hiddenに指定した属性は除外する。
   */
  toObject(): Record<string, unknown> {
    const attributes = modelAttributes.get(this)

    if (!attributes) {
      throw new Error("Model attributes are not initialized")
    }

    const hidden = new Set(
      Reflect.get(this.constructor, "hidden") as readonly string[],
    )
    const object: Record<string, unknown> = {}

    for (const key of Object.keys(attributes)) {
      if (!hidden.has(key)) {
        object[key] = Reflect.get(this, key)
      }
    }

    return object
  }

  /**
   * JSON.stringifyから呼ばれるModelのシリアライズ入口。
   */
  toJSON(): Record<string, unknown> {
    return this.toObject()
  }
}

const modelAttributes = new WeakMap<Model, Record<string, unknown>>()
