import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import ts, { type Identifier } from "typescript";
import { StringBuilder } from "../../stringBuilder.js";

class EmitContext {
  public output = new StringBuilder();

  constructor(
    public readonly typeChecker: ts.TypeChecker,
    public readonly sourceFile: ts.SourceFile,
  ) {}
}

export interface EmitResult {
  readonly output: string;
}

export class EmitError extends Error {
  constructor(
    context: EmitContext,
    public readonly node: ts.Node,
    message: string,
  ) {
    const { line, character } = context.sourceFile
      .getLineAndCharacterOfPosition(
        node.getStart(context.sourceFile),
      );

    super(`(${line}, ${character}): ${message}`);
  }
}

function nodeKindString(node: ts.Node): string {
  return ts.SyntaxKind[node.kind];
}

function getTypeFromNode(context: EmitContext, node: ts.Node): string {
  let type = context.typeChecker.typeToString(
    context.typeChecker.getTypeAtLocation(node),
  );

  if (type === "string" || type.startsWith('"')) {
    type = "const char*";
  }

  if (type === "number") {
    type = "i32";
  }

  return type;
}

export async function emit(
  typeChecker: ts.TypeChecker,
  sourceFile: ts.SourceFile,
): Promise<EmitResult> {
  const context = new EmitContext(typeChecker, sourceFile);

  await emitPreamble(context);

  for (const statement of sourceFile.statements) {
    emitTopLevelStatement(context, statement);
  }

  return {
    output: context.output.toString(),
  };
}

async function emitPreamble(context: EmitContext): Promise<void> {
  context.output.appendLine("#include <tscc/runtime.cpp>");
}

function emitTopLevelStatement(
  context: EmitContext,
  statement: ts.Statement,
): void {
  switch (statement.kind) {
    case ts.SyntaxKind.ImportDeclaration:
      emitImportDeclaration(context, statement as ts.ImportDeclaration);
      break;

    case ts.SyntaxKind.FunctionDeclaration:
      emitFunctionDeclaration(context, statement as ts.FunctionDeclaration);
      break;

    default:
      throw new EmitError(
        context,
        statement,
        `Failed to parse ${
          nodeKindString(statement)
        } in ${emitTopLevelStatement.name}.`,
      );
  }
}

function emitImportDeclaration(
  context: EmitContext,
  importDeclaration: ts.ImportDeclaration,
): void {
  if (
    importDeclaration.importClause?.name?.escapedText === "std" &&
    ts.isStringLiteral(importDeclaration.moduleSpecifier) &&
    importDeclaration.moduleSpecifier.text === "std"
  ) {
    return;
  }

  throw new EmitError(
    context,
    importDeclaration,
    `Failed to parse ${
      nodeKindString(importDeclaration)
    } in ${emitImportDeclaration.name}.`,
  );
}

function emitFunctionDeclaration(
  context: EmitContext,
  functionDeclaration: ts.FunctionDeclaration,
): void {
  if (!functionDeclaration.name) {
    throw new EmitError(
      context,
      functionDeclaration,
      `Expected function name to be defined.`,
    );
  }

  if (
    !functionDeclaration.type ||
    !ts.isTypeReferenceNode(functionDeclaration.type) ||
    !ts.isIdentifier(functionDeclaration.type.typeName)
  ) {
    throw new EmitError(
      context,
      functionDeclaration,
      `Expected function return type to be defined for ${functionDeclaration.name.escapedText}.`,
    );
  }

  context.output.appendLine(
    `${functionDeclaration.type.typeName.escapedText} ${functionDeclaration.name.escapedText}() {`,
  );

  if (functionDeclaration.body) {
    for (const statement of functionDeclaration.body.statements) {
      emitFunctionLevelStatement(context, statement);
    }
  }

  context.output.appendLine(`}`);
}

function emitFunctionLevelStatement(
  context: EmitContext,
  statement: ts.Statement,
): void {
  switch (statement.kind) {
    case ts.SyntaxKind.ExpressionStatement:
      emitExpressionStatement(context, statement as ts.ExpressionStatement);
      break;

    case ts.SyntaxKind.ReturnStatement:
      emitReturnStatement(context, statement as ts.ReturnStatement);
      break;

    case ts.SyntaxKind.VariableStatement:
      emitVariableStatement(context, statement as ts.VariableStatement);
      break;

    default:
      throw new EmitError(
        context,
        statement,
        `Failed to parse ${
          nodeKindString(statement)
        } in ${emitFunctionLevelStatement.name}.`,
      );
  }
}

function emitExpressionStatement(
  context: EmitContext,
  expressionStatement: ts.ExpressionStatement,
): void {
  emitExpression(context, expressionStatement.expression);
  context.output.appendLine(";");
}

function emitReturnStatement(
  context: EmitContext,
  returnStatement: ts.ReturnStatement,
): void {
  if (returnStatement.expression) {
    context.output.append("return ");
    emitExpression(context, returnStatement.expression);
    context.output.appendLine(";");
  } else {
    context.output.appendLine("return;");
  }
}

function emitVariableStatement(
  context: EmitContext,
  variableStatement: ts.VariableStatement,
): void {
  for (
    const variableDeclaration of variableStatement.declarationList.declarations
  ) {
    const type = getTypeFromNode(context, variableDeclaration);
    context.output.append(type);
    context.output.append(" ");
    emitIdentifier(context, variableDeclaration.name as Identifier);

    if (variableDeclaration.initializer) {
      context.output.append(" = ");
      emitExpression(context, variableDeclaration.initializer!);
    }

    context.output.appendLine(";");
  }
}

function emitExpression(
  context: EmitContext,
  expression: ts.Expression,
): void {
  switch (expression.kind) {
    case ts.SyntaxKind.CallExpression:
      emitCallExpression(context, expression as ts.CallExpression);
      break;

    case ts.SyntaxKind.Identifier:
      emitIdentifier(context, expression as ts.Identifier);
      break;

    case ts.SyntaxKind.NumericLiteral:
      emitNumericLiteral(context, expression as ts.NumericLiteral);
      break;

    case ts.SyntaxKind.PropertyAccessExpression:
      emitPropertyAccessExpression(
        context,
        expression as ts.PropertyAccessExpression,
      );
      break;

    case ts.SyntaxKind.StringLiteral:
      emitStringLiteral(context, expression as ts.StringLiteral);
      break;

    default:
      throw new EmitError(
        context,
        expression,
        `Failed to parse ${
          nodeKindString(expression)
        } in ${emitExpression.name}.`,
      );
  }
}

function emitCallExpression(
  context: EmitContext,
  callExpression: ts.CallExpression,
): void {
  emitExpression(context, callExpression.expression);
  context.output.append("(");

  for (let i = 0; i < callExpression.arguments.length; i++) {
    const argument = callExpression.arguments[i]!;

    emitExpression(context, argument);

    if (i < callExpression.arguments.length - 1) {
      context.output.append(", ");
    }
  }

  context.output.append(")");
}

function emitPropertyAccessExpression(
  context: EmitContext,
  propertyAccessExpression: ts.PropertyAccessExpression,
): void {
  emitExpression(context, propertyAccessExpression.expression);
  context.output.append(".");
  emitMemberName(context, propertyAccessExpression.name);
}

function emitMemberName(
  context: EmitContext,
  memberName: ts.MemberName,
): void {
  // TODO: Implement for ts.PrivateIdentifier
  emitIdentifier(context, memberName as ts.Identifier);
}

function emitIdentifier(
  context: EmitContext,
  identifier: ts.Identifier,
): void {
  context.output.append(identifier.text);
}

function emitNumericLiteral(
  context: EmitContext,
  numcericLiteral: ts.NumericLiteral,
): void {
  context.output.append(numcericLiteral.text);
}

function emitStringLiteral(
  context: EmitContext,
  stringLiteral: ts.StringLiteral,
): void {
  context.output.append(`"${stringLiteral.text}"`);
}
