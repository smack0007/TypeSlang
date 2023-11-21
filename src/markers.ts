export type IsUsed<T extends {}> = T & {
  isUsed: boolean;
};

export function withIsUsed<T extends {}>(obj: T, isUsed = false): IsUsed<T> {
  (obj as unknown as IsUsed<T>).isUsed = isUsed;
  return obj as unknown as IsUsed<T>;
}
