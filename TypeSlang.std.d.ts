/** @TypeSlang */

declare module "std" {
  /** @include <stdlib.h> */
  export function malloc(size: usize): Pointer<unknown>;
}
