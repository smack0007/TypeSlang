import * as ts from "typescript";
import { isFirstCharacterDigit } from "../utils.ts";

export function hasTypeProperty(node: ts.Node): node is ts.Node & { type: ts.TypeNode } {
  return !!(node as unknown as { type: ts.Type }).type;
}

export function mapTypeName(typeName: string): string {
  if (typeName.startsWith('"') && typeName.endsWith('"')) {
    typeName = "string";
  }

  if (typeName.includes("number[]")) {
    typeName = typeName.replaceAll("number[]", "i32[]");
  }

  if (typeName.includes("ptr<")) {
    typeName = typeName.replaceAll("ptr<", "Pointer<");
  }

  if (isFirstCharacterDigit(typeName)) {
    if (typeName.includes(".")) {
      typeName = "f64";
    } else {
      typeName = "i32";
    }
  }

  // TODO: This probably doesn't work for arrays of arrays
  if (typeName.endsWith("[]")) {
    typeName = typeName.substring(0, typeName.length - 2);
    typeName = `Array<${typeName}>`;
  }

  switch (typeName) {
    case "boolean":
    case "true":
    case "false":
      typeName = "bool";
      break;

    case "number":
      typeName = "i32";
      break;
  }

  return typeName;
}
