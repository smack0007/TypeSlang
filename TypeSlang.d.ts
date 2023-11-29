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

type Unpacked<T> = T extends (infer U)[] ? U : T;

type Pointer<T> = {
  get addressOf(): bigint;
  get dereference(): T;
  [index: number]: T;
};

type PointerConstructor = {
  new <T>(value: T | T[]): Pointer<Unpacked<T>>;
  <T>(value: T | T[]): Pointer<Unpacked<T>>;
};

declare const Pointer: PointerConstructor;
type ptr<T> = Pointer<T>;
