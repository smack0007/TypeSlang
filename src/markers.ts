export type IsUsed<T extends {}> = T & {
  isUsed: boolean;
};

export function withIsUsed<T extends {}>(obj: T, isUsed = false): IsUsed<T> {
  return {
    ...obj,
    isUsed,
  };
}
