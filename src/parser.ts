import { EOL } from "node:os";
import ts from "typescript";

class ParserContext {
  public output = "";

  constructor(public readonly sourceFile: ts.SourceFile) {}

  public append(value: string): void {
    this.output += value;
  }

  public appendLine(value: string = ""): void {
    this.append(value);
    this.append(EOL);
  }
}

export interface ParserResult {
  readonly output: string;
}

export class ParserError extends Error {
  constructor(context: ParserContext, public readonly node: ts.Node, message: string) {
    const { line, character } = context.sourceFile.getLineAndCharacterOfPosition(
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

  return context;
}

function writePreamble(context: ParserContext): void {
  context.appendLine(`#include "stdio.h"`);
  context.appendLine(`#include "stdint.h"`);
  context.appendLine(`typedef int32_t i32;`);
  context.appendLine();
}

function parseTopLevelStatement(context: ParserContext, statement: ts.Statement): void {
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
        `Failed to parse ${nodeKindString(statement)} in ${parseTopLevelStatement.name}.`,
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
    `Failed to parse ${nodeKindString(importDeclaration)} in ${parseImportDeclaration.name}.`,
  );
}

function parseFunctionDeclaration(
  context: ParserContext,
  functionDeclaration: ts.FunctionDeclaration,
): void {
  if (!functionDeclaration.name) {
    throw new ParserError(context, functionDeclaration, `Expected function name to be defined.`);
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

  context.appendLine(
    `${functionDeclaration.type.typeName.escapedText} ${functionDeclaration.name.escapedText}() {`,
  );

  if (functionDeclaration.body) {
    for (const statement of functionDeclaration.body.statements) {
      parseFunctionLevelStatement(context, statement);
    }
  }

  context.appendLine(`}`);
}

function parseFunctionLevelStatement(context: ParserContext, statement: ts.Statement): void {
  switch (statement.kind) {
    case ts.SyntaxKind.ReturnStatement:
      parseReturnStatement(context, statement as ts.ReturnStatement);
      break;

    default:
      throw new ParserError(
        context,
        statement,
        `Failed to parse ${nodeKindString(statement)} in ${parseFunctionLevelStatement.name}.`,
      );
  }
}

function parseReturnStatement(context: ParserContext, returnStatement: ts.ReturnStatement): void {
  if (returnStatement.expression) {
    context.append("return ");
    parseExpression(context, returnStatement.expression);
    context.appendLine(";");
  } else {
    context.appendLine("return;");
  }
}

function parseExpression(context: ParserContext, expression: ts.Expression): void {
  switch (expression.kind) {
    case ts.SyntaxKind.NumericLiteral:
      parseNumericLiteral(context, expression as ts.NumericLiteral);
      break;

    default:
      throw new ParserError(
        context,
        expression,
        `Failed to parse ${nodeKindString(expression)} in ${parseExpression.name}.`,
      );
  }
}

function parseNumericLiteral(context: ParserContext, numcericLiteral: ts.NumericLiteral): void {
  context.append(numcericLiteral.text);
}
