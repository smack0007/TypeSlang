import ts from "typescript";
import { SCRIPT_TARGET } from "./constants.ts";
import { createEnumToStringMapFunction } from "./utils.ts";

let typeCounter = 0;

export function createTypeAliasDeclarationFromString(typeNamePrefix: string, type: string): ts.TypeAliasDeclaration {
  typeCounter += 1;
  const typeName = `${typeNamePrefix}_${typeCounter}`;
  const sourceFile = ts.createSourceFile(`${typeName}.ts`, `type ${typeName} = ${type}`, SCRIPT_TARGET, true);

  if (sourceFile.statements.length < 0 || sourceFile.statements[0].kind !== ts.SyntaxKind.TypeAliasDeclaration) {
    throw new Error(`Failed to create TypeAliasDeclaration from "${type}".`);
  }

  return sourceFile.statements[0] as ts.TypeAliasDeclaration;
}

export function isAsConstExpression(node: ts.Node): node is ts.AsExpression {
  return ts.isAsExpression(node) && ts.isConstTypeReference(node.type);
}

const kindStringMapper = createEnumToStringMapFunction(ts.SyntaxKind);

export function kindString(kind: ts.SyntaxKind): string {
  return kindStringMapper(kind);
}

export function nodeKindString(node: ts.Node): string {
  return kindString(node.kind);
}

export function transformInterfaceDeclarationToTypeAliasDeclaration(
  interfaceDeclaration: ts.InterfaceDeclaration,
): ts.TypeAliasDeclaration {
  return ts.factory.createTypeAliasDeclaration(
    interfaceDeclaration.modifiers,
    interfaceDeclaration.name,
    interfaceDeclaration.typeParameters,
    ts.factory.createTypeLiteralNode(interfaceDeclaration.members),
  );
}
