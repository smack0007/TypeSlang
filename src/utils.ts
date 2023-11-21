export function createEnumToStringMapFunction<T extends number = number>(enumeration: any): (value: T) => string {
  const map = new Map<T, string>();

  for (let name in enumeration) {
    const id = enumeration[name];
    if (typeof id === "number" && !map.has(id as T)) {
      map.set(id as T, name);
    }
  }

  return (value: T) => (map.get(value) ?? "") as string;
}

export function isError(error: unknown): error is Error & { code?: string } {
  return error instanceof Error;
}

export function isFirstCharacterDigit(value: string): boolean {
  return value.length >= 1 && value[0]! >= "0" && value[0]! <= "9";
}

export function hasFlag(value: number, flag: number): boolean {
  return (value & flag) != 0;
}
