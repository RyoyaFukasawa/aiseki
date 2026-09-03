export class Model {
  static readonly table: string

  constructor(row: object) {
    Object.assign(this, row)
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
