import { assertEquals, describe, it } from "../deps.test.ts";
import { mapModuleName } from "./mapModuleName.ts";

const mapModuleNameTests: Array<[string, string]> = [
  ["", ""],

  ["greet", "_greet_"],
  ["./greet.ts", "_cd_greet_"],
  ["../greet.ts", "_pd_greet_"],
  ["../../greet.ts", "_pd_pd_greet_"],
];

describe(mapModuleName.name, () => {
  for (const [input, expected] of mapModuleNameTests) {
    it(`("${input}") => "${expected}"`, () => {
      assertEquals(mapModuleName(input), expected);
    });
  }
});
