import * as ts from "typescript";
import { withIsUsed, type IsUsed } from "../markers.ts";
import { createTypeAliasDeclarationFromString } from "../tsUtils.ts";
import { isFirstCharacterDigit } from "../utils.ts";
import { EmitError } from "./emitError.ts";

export function hasTypeProperty(node: ts.Node): node is ts.Node & { type: ts.TypeNode } {
  return !!(node as unknown as { type: ts.Type }).type;
}

export function mapTypeName(types: IsUsed<ts.TypeAliasDeclaration>[], typeName: string): string {
  if (typeName.startsWith('"') && typeName.endsWith('"')) {
    typeName = "string";
  }

  if (typeName.includes("number[]")) {
    typeName = typeName.replaceAll("number[]", "i32[]");
  }

  while (typeName.includes("ptr<")) {
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

  if (typeName.startsWith("{")) {
    let knownType = types.find((x) => x.type.getText() === typeName);

    if (knownType === undefined) {
      knownType = withIsUsed(createTypeAliasDeclarationFromString("_struct", typeName));
      types.push(knownType);
    }

    return knownType.name.getText();
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

  // TODO: Bring this back somehow.
  // if (["any"].includes(typeName)) {
  //   throw new EmitError(context, node, `Type "${typeName}" is unable to be emitted.`);
  // }

  return typeName;
}
