import ts, { type Identifier } from "typescript";
import { StringBuilder } from "../../stringBuilder.js";
import { hasFlag, isFirstCharacterDigit as isFirstCharacterDigit } from "../../utils.js";

export enum EmitScope {
  None,
  SourceFile,
  TopLevelStatement,
  ImportDeclaration,
  FunctionDeclaration,
  FunctionLevelStatement,
  Block,
  ExpressionStatement,
  IfStatement,
  ReturnStatement,
  VariableStatement,
  WhileStatement,
  Expression,
  BinaryExpression,
  CallExpression,
  CallExpressionExpression,
  CallExpressionArguments,
  PropertyAccessExpression,
  MemberName,
  Identifier,
  NumericLiteral,
  StringLiteral,
}

class EmitContext {
  public output = new StringBuilder();

  private scopeStack = [EmitScope.SourceFile];

  constructor(public readonly typeChecker: ts.TypeChecker, public readonly sourceFile: ts.SourceFile) {}

  public get currentScope(): EmitScope {
    return this.scopeStack[this.scopeStack.length - 1] ?? EmitScope.None;
  }

  public pushScope(scope: EmitScope): void {
    this.scopeStack.push(scope);
  }

  public popScope(): EmitScope {
    if (this.scopeStack.length <= 1) {
      throw new Error("Scope stack is empty.");
    }

    return this.scopeStack.pop() ?? EmitScope.None;
  }

  public withScope(scope: EmitScope, func: () => void): void {
    this.pushScope(scope);
    try {
      func();
    } finally {
      this.popScope();
    }
  }

  public hasAncestorScope(scope: EmitScope): boolean {
    for (let i = this.scopeStack.length - 1; i >= 0; i -= 1) {
      if (this.scopeStack[i] === scope) {
        return true;
      }
    }

    return false;
  }
}

export interface EmitResult {
  readonly output: string;
}

export class EmitError extends Error {
  constructor(context: EmitContext, public readonly node: ts.Node, message: string) {
    const { line, character } = context.sourceFile.getLineAndCharacterOfPosition(node.getStart(context.sourceFile));

    super(`(${line}, ${character}): ${message}`);
  }
}

function nodeKindString(node: ts.Node): string {
  return ts.SyntaxKind[node.kind];
}

function getTypeFromNode(context: EmitContext, node: ts.Node): string {
  let type = context.typeChecker.typeToString(context.typeChecker.getTypeAtLocation(node));

  if (type === "string" || type.startsWith('"')) {
    type = "JSString";
  }

  if (type === "number" || isFirstCharacterDigit(type)) {
    type = "i32";
  }

  return type;
}

function typeMustBeConstructed(context: EmitContext, type: string): boolean {
  return ["JSString"].includes(type);
}

function typeIsString(type: string): boolean {
  return type === "JSString";
}

export async function emit(typeChecker: ts.TypeChecker, sourceFile: ts.SourceFile): Promise<EmitResult> {
  const context = new EmitContext(typeChecker, sourceFile);

  await emitPreamble(context);

  context.withScope(EmitScope.SourceFile, () => {
    for (const statement of sourceFile.statements) {
      emitTopLevelStatement(context, statement);
    }
  });

  return {
    output: context.output.toString(),
  };
}

async function emitPreamble(context: EmitContext): Promise<void> {
  context.output.appendLine("#include <tsccpp/runtime.cpp>");
}

function emitTopLevelStatement(context: EmitContext, statement: ts.Statement): void {
  context.withScope(EmitScope.TopLevelStatement, () => {
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
          `Failed to emit ${nodeKindString(statement)} in ${emitTopLevelStatement.name}.`,
        );
    }
  });
}

function emitImportDeclaration(context: EmitContext, importDeclaration: ts.ImportDeclaration): void {
  context.withScope(EmitScope.ImportDeclaration, () => {
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
      `Failed to emit ${nodeKindString(importDeclaration)} in ${emitImportDeclaration.name}.`,
    );
  });
}

function emitFunctionDeclaration(context: EmitContext, functionDeclaration: ts.FunctionDeclaration): void {
  context.withScope(EmitScope.FunctionDeclaration, () => {
    if (!functionDeclaration.name) {
      throw new EmitError(context, functionDeclaration, `Expected function name to be defined.`);
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
  });
}

function emitFunctionLevelStatement(context: EmitContext, statement: ts.Statement): void {
  context.withScope(EmitScope.FunctionLevelStatement, () => {
    switch (statement.kind) {
      case ts.SyntaxKind.Block:
        emitBlock(context, statement as ts.Block);
        break;

      case ts.SyntaxKind.ExpressionStatement:
        emitExpressionStatement(context, statement as ts.ExpressionStatement);
        break;

      case ts.SyntaxKind.IfStatement:
        emitIfStatement(context, statement as ts.IfStatement);
        break;

      case ts.SyntaxKind.ReturnStatement:
        emitReturnStatement(context, statement as ts.ReturnStatement);
        break;

      case ts.SyntaxKind.VariableStatement:
        emitVariableStatement(context, statement as ts.VariableStatement);
        break;

      case ts.SyntaxKind.WhileStatement:
        emitWhileStatement(context, statement as ts.WhileStatement);
        break;

      default:
        throw new EmitError(
          context,
          statement,
          `Failed to emit ${nodeKindString(statement)} in ${emitFunctionLevelStatement.name}.`,
        );
    }
  });
}

function emitBlock(context: EmitContext, block: ts.Block): void {
  context.withScope(EmitScope.Block, () => {
    context.output.appendLine("{");

    for (const statement of block.statements) {
      emitFunctionLevelStatement(context, statement);
    }

    context.output.append("}");
  });
}

function emitExpressionStatement(context: EmitContext, expressionStatement: ts.ExpressionStatement): void {
  context.withScope(EmitScope.ExpressionStatement, () => {
    emitExpression(context, expressionStatement.expression);
    context.output.appendLine(";");
  });
}

function emitIfStatement(context: EmitContext, ifStatement: ts.IfStatement): void {
  context.withScope(EmitScope.IfStatement, () => {
    context.output.append("if (");
    emitExpression(context, ifStatement.expression);
    context.output.append(") ");
    emitFunctionLevelStatement(context, ifStatement.thenStatement);

    if (ifStatement.elseStatement) {
      context.output.append(" else ");
      emitFunctionLevelStatement(context, ifStatement.elseStatement);
    }
    context.output.appendLine();
  });
}

function emitReturnStatement(context: EmitContext, returnStatement: ts.ReturnStatement): void {
  context.withScope(EmitScope.ReturnStatement, () => {
    if (returnStatement.expression) {
      context.output.append("return ");
      emitExpression(context, returnStatement.expression);
      context.output.appendLine(";");
    } else {
      context.output.appendLine("return;");
    }
  });
}

function emitVariableStatement(context: EmitContext, variableStatement: ts.VariableStatement): void {
  context.withScope(EmitScope.VariableStatement, () => {
    const isConst = hasFlag(variableStatement.declarationList.flags, ts.NodeFlags.Const);

    for (const variableDeclaration of variableStatement.declarationList.declarations) {
      const type = getTypeFromNode(context, variableDeclaration);

      if (isConst) {
        context.output.append("const ");
      }

      context.output.append(type);
      context.output.append(" ");
      emitIdentifier(context, variableDeclaration.name as Identifier);

      if (variableDeclaration.initializer) {
        context.output.append(" = ");

        if (typeMustBeConstructed(context, type)) {
          context.output.append(type);
          context.output.append("(");
          if (typeIsString(type) && variableDeclaration.initializer.kind === ts.SyntaxKind.StringLiteral) {
            emitStringLiteral(context, variableDeclaration.initializer as ts.StringLiteral, {
              withStringLength: true,
            });
          } else {
            emitExpression(context, variableDeclaration.initializer);
          }

          context.output.append(")");
        } else {
          emitExpression(context, variableDeclaration.initializer);
        }
      }

      context.output.appendLine(";");
    }
  });
}

function emitWhileStatement(context: EmitContext, whileStatement: ts.WhileStatement): void {
  context.withScope(EmitScope.WhileStatement, () => {
    context.output.append("while (");
    emitExpression(context, whileStatement.expression);
    context.output.append(") ");
    emitFunctionLevelStatement(context, whileStatement.statement);
    context.output.appendLine();
  });
}

function emitExpression(context: EmitContext, expression: ts.Expression): void {
  context.withScope(EmitScope.Expression, () => {
    switch (expression.kind) {
      case ts.SyntaxKind.BinaryExpression:
        emitBinaryExpression(context, expression as ts.BinaryExpression);
        break;

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
        emitPropertyAccessExpression(context, expression as ts.PropertyAccessExpression);
        break;

      case ts.SyntaxKind.StringLiteral:
        emitStringLiteral(context, expression as ts.StringLiteral);
        break;

      default:
        throw new EmitError(
          context,
          expression,
          `Failed to emit ${nodeKindString(expression)} in ${emitExpression.name}.`,
        );
    }
  });
}

function emitBinaryExpression(context: EmitContext, binaryExpression: ts.BinaryExpression): void {
  context.withScope(EmitScope.BinaryExpression, () => {
    emitExpression(context, binaryExpression.left);

    switch (binaryExpression.operatorToken.kind) {
      case ts.SyntaxKind.AsteriskToken:
        context.output.append(" * ");
        break;

      case ts.SyntaxKind.AsteriskEqualsToken:
        context.output.append(" *= ");
        break;

      case ts.SyntaxKind.GreaterThanToken:
        context.output.append(" > ");
        break;

      case ts.SyntaxKind.GreaterThanEqualsToken:
        context.output.append(" >= ");
        break;

      case ts.SyntaxKind.LessThanToken:
        context.output.append(" < ");
        break;

      case ts.SyntaxKind.LessThanEqualsToken:
        context.output.append(" <= ");
        break;

      case ts.SyntaxKind.MinusToken:
        context.output.append(" - ");
        break;

      case ts.SyntaxKind.MinusEqualsToken:
        context.output.append(" -= ");
        break;

      case ts.SyntaxKind.PlusToken:
        context.output.append(" + ");
        break;

      case ts.SyntaxKind.PlusEqualsToken:
        context.output.append(" += ");
        break;

      case ts.SyntaxKind.SlashToken:
        context.output.append(" / ");
        break;

      case ts.SyntaxKind.SlashEqualsToken:
        context.output.append(" /= ");
        break;

      default:
        throw new EmitError(
          context,
          binaryExpression,
          `Failed to emit operatorToken ${nodeKindString(binaryExpression.operatorToken)} for ${nodeKindString(
            binaryExpression,
          )} in ${emitBinaryExpression.name}.`,
        );
    }

    emitExpression(context, binaryExpression.right);
  });
}

function emitCallExpression(context: EmitContext, callExpression: ts.CallExpression): void {
  context.withScope(EmitScope.CallExpression, () => {
    context.withScope(EmitScope.CallExpressionExpression, () => {
      emitExpression(context, callExpression.expression);
    });

    context.output.append("(");

    context.withScope(EmitScope.CallExpressionArguments, () => {
      for (let i = 0; i < callExpression.arguments.length; i++) {
        const argument = callExpression.arguments[i]!;

        emitExpression(context, argument);

        if (i < callExpression.arguments.length - 1) {
          context.output.append(", ");
        }
      }
    });

    context.output.append(")");
  });
}

function emitPropertyAccessExpression(
  context: EmitContext,
  propertyAccessExpression: ts.PropertyAccessExpression,
): void {
  context.withScope(EmitScope.PropertyAccessExpression, () => {
    emitExpression(context, propertyAccessExpression.expression);
    context.output.append(".");
    emitMemberName(context, propertyAccessExpression.name);

    // NOTE: Properties are not supported in C++ so we have to call
    // a method.
    if (!context.hasAncestorScope(EmitScope.CallExpressionExpression)) {
      context.output.append("()");
    }
  });
}

function emitMemberName(context: EmitContext, memberName: ts.MemberName): void {
  context.withScope(EmitScope.MemberName, () => {
    emitIdentifier(context, memberName);
  });
}

function emitIdentifier(context: EmitContext, identifier: ts.Identifier | ts.PrivateIdentifier): void {
  context.withScope(EmitScope.Identifier, () => {
    context.output.append(identifier.escapedText as string);
  });
}

function emitNumericLiteral(context: EmitContext, numcericLiteral: ts.NumericLiteral): void {
  context.withScope(EmitScope.NumericLiteral, () => {
    context.output.append(numcericLiteral.text);
  });
}

interface EmitStringLiteralOptions {
  withStringLength?: boolean;
}

function emitStringLiteral(
  context: EmitContext,
  stringLiteral: ts.StringLiteral,
  options: EmitStringLiteralOptions = {},
): void {
  context.withScope(EmitScope.StringLiteral, () => {
    context.output.append(`"${stringLiteral.text}"`);

    if (options.withStringLength) {
      context.output.append(", ");
      context.output.append(stringLiteral.text.length.toString());
    }
  });
}
