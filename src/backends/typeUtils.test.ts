import { assertEquals, describe, it } from "../deps.test.ts";
import { mapTypeName } from "./typeUtils.ts";

const mapTypeNameTests: Array<[string, string]> = [
  [`"foo"`, "string"],

  ["12", "i32"],
  ["12.34", "f64"],

  ["Array<u8>", "Array<u8>"],
  ["u8[]", "Array<u8>"],
  ["u8[][]", "Array<Array<u8>>"],
  ["number[]", "Array<i32>"],

  ["ptr<u32>", "Pointer<u32>"],
  ["Pointer<u32>", "Pointer<u32>"],
  ["Pointer<u32[]>", "Pointer<u32>"],

  ["boolean", "bool"],
  ["true", "bool"],
  ["false", "bool"],
];

describe(mapTypeName.name, () => {
  for (const [input, expected] of mapTypeNameTests) {
    it(`("${input}") => "${expected}"`, () => {
      assertEquals(mapTypeName(input), expected);
    });
  }
});
