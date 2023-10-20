export function isError(error: unknown): error is Error & { code?: string } {
  return error instanceof Error;
}

export function isFirstCharacterDigit(value: string): boolean {
  return value.length >= 1 && value[0]! >= "0" && value[0]! <= "9";
}

export function hasFlag(value: number, flag: number): boolean {
  return (value & flag) != 0;
}
