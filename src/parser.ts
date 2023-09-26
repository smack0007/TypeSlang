import { EOL } from "node:os";
import ts from "typescript";
import { StringBuilder } from "./stringBuilder.js";

class ParserContext {
  public output = new StringBuilder();

  constructor(public readonly sourceFile: ts.SourceFile) {}
}

export interface ParserResult {
  readonly output: string;
}

export class ParserError extends Error {
  constructor(
    context: ParserContext,
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

export function parseSourceFile(sourceFile: ts.SourceFile): ParserResult {
  const context = new ParserContext(sourceFile);

  writePreamble(context);

  for (const statement of sourceFile.statements) {
    parseTopLevelStatement(context, statement);
  }

  return {
    output: context.output.toString(),
  };
}

function writePreamble(context: ParserContext): void {
  context.output.appendLine(`#include "stdio.h"`);
  context.output.appendLine(`#include "stdint.h"`);
  context.output.appendLine(`typedef int32_t i32;`);
  context.output.appendLine();
}

function parseTopLevelStatement(
  context: ParserContext,
  statement: ts.Statement,
): void {
  switch (statement.kind) {
    case ts.SyntaxKind.ImportDeclaration:
      parseImportDeclaration(context, statement as ts.ImportDeclaration);
      break;

    case ts.SyntaxKind.FunctionDeclaration:
      parseFunctionDeclaration(context, statement as ts.FunctionDeclaration);
      break;

    default:
      throw new ParserError(
        context,
        statement,
        `Failed to parse ${
          nodeKindString(statement)
        } in ${parseTopLevelStatement.name}.`,
      );
  }
}

function parseImportDeclaration(
  context: ParserContext,
  importDeclaration: ts.ImportDeclaration,
): void {
  if (
    importDeclaration.importClause?.name?.escapedText === "std" &&
    ts.isStringLiteral(importDeclaration.moduleSpecifier) &&
    importDeclaration.moduleSpecifier.text === "std"
  ) {
    return;
  }

  throw new ParserError(
    context,
    importDeclaration,
    `Failed to parse ${
      nodeKindString(importDeclaration)
    } in ${parseImportDeclaration.name}.`,
  );
}

function parseFunctionDeclaration(
  context: ParserContext,
  functionDeclaration: ts.FunctionDeclaration,
): void {
  if (!functionDeclaration.name) {
    throw new ParserError(
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
    throw new ParserError(
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
      parseFunctionLevelStatement(context, statement);
    }
  }

  context.output.appendLine(`}`);
}

function parseFunctionLevelStatement(
  context: ParserContext,
  statement: ts.Statement,
): void {
  switch (statement.kind) {
    case ts.SyntaxKind.ExpressionStatement:
      parseExpressionStatement(context, statement as ts.ExpressionStatement);
      break;

    case ts.SyntaxKind.ReturnStatement:
      parseReturnStatement(context, statement as ts.ReturnStatement);
      break;

    default:
      throw new ParserError(
        context,
        statement,
        `Failed to parse ${
          nodeKindString(statement)
        } in ${parseFunctionLevelStatement.name}.`,
      );
  }
}

function parseExpressionStatement(
  context: ParserContext,
  expressionStatement: ts.ExpressionStatement,
): void {
  parseExpression(context, expressionStatement.expression);
  context.output.appendLine(";");
}

function parseReturnStatement(
  context: ParserContext,
  returnStatement: ts.ReturnStatement,
): void {
  if (returnStatement.expression) {
    context.output.append("return ");
    parseExpression(context, returnStatement.expression);
    context.output.appendLine(";");
  } else {
    context.output.appendLine("return;");
  }
}

function parseExpression(
  context: ParserContext,
  expression: ts.Expression,
): void {
  switch (expression.kind) {
    case ts.SyntaxKind.CallExpression:
      parseCallExpression(context, expression as ts.CallExpression);
      break;

    case ts.SyntaxKind.Identifier:
      parseIdentifier(context, expression as ts.Identifier);
      break;

    case ts.SyntaxKind.NumericLiteral:
      parseNumericLiteral(context, expression as ts.NumericLiteral);
      break;

    case ts.SyntaxKind.PropertyAccessExpression:
      parsePropertyAccessExpression(
        context,
        expression as ts.PropertyAccessExpression,
      );
      break;

    case ts.SyntaxKind.StringLiteral:
      parseStringLiteral(context, expression as ts.StringLiteral);
      break;

    default:
      throw new ParserError(
        context,
        expression,
        `Failed to parse ${
          nodeKindString(expression)
        } in ${parseExpression.name}.`,
      );
  }
}

function parseCallExpression(
  context: ParserContext,
  callExpression: ts.CallExpression,
): void {
  parseExpression(context, callExpression.expression);
  context.output.append("(");

  for (const argument of callExpression.arguments) {
    parseExpression(context, argument);
  }

  context.output.append(")");
}

function parsePropertyAccessExpression(
  context: ParserContext,
  propertyAccessExpression: ts.PropertyAccessExpression,
): void {
  parseExpression(context, propertyAccessExpression.expression);
  context.output.append(".");
  parseMemberName(context, propertyAccessExpression.name);
}

function parseMemberName(
  context: ParserContext,
  memberName: ts.MemberName,
): void {
  // TODO: Implement for ts.PrivateIdentifier
  parseIdentifier(context, memberName as ts.Identifier);
}

function parseIdentifier(
  context: ParserContext,
  identifier: ts.Identifier,
): void {
  context.output.append(identifier.text);
}

function parseNumericLiteral(
  context: ParserContext,
  numcericLiteral: ts.NumericLiteral,
): void {
  context.output.append(numcericLiteral.text);
}

function parseStringLiteral(
  context: ParserContext,
  stringLiteral: ts.StringLiteral,
): void {
  context.output.append(`"${stringLiteral.text}"`);
}
