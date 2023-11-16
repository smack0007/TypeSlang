import ts from "typescript";

export function kindString(kind: ts.SyntaxKind): string {
  return ts.SyntaxKind[kind];
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
