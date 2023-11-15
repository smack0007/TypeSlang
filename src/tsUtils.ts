import ts from "typescript";

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
