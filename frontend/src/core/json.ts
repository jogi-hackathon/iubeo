/** サーバーとやり取りする、kind ごとに自由な中身(`data`)の型 */
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | {[key: string]: JsonValue};
