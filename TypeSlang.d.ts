type bool = boolean;
type f32 = number;
type f64 = number;
type i8 = number;
type i16 = number;
type i32 = number;
type i64 = bigint;
type u8 = number;
type u16 = number;
type u32 = number;
type u64 = bigint;

type NativeTypes = bool | f32 | f64 | i8 | i16 | i32 | i64 | u8 | u16 | u32 | u64;

type Pointer<T> = {
  get addressOf(): bigint;
} & (T extends (infer U)[]
  ? {
      get dereference(): U;
      [index: number]: U;
    }
  : T & {
      get dereference(): T;
    });

type PointerConstructor = {
  new <T>(value: T): Pointer<T>;
  <T>(value: T): Pointer<T>;
};

declare const Pointer: PointerConstructor;
type ptr<T> = Pointer<T>;
