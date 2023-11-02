import ts, { type Identifier, type TemplateLiteralLikeNode } from "typescript";
import { StringBuilder } from "../../stringBuilder.js";
import { hasFlag, isFirstCharacterDigit as isFirstCharacterDigit } from "../../utils.js";
import { Stack } from "../../stack.js";

class VariableData {
  public isInitialized: boolean = false;

  constructor(public type: string) {}
}

class VariableScope {
  private _data: Map<string, VariableData> = new Map<string, VariableData>();

  public declare(name: ts.Identifier, type: string): void {
    if (this._data.has(name.escapedText as string)) {
      throw new Error(`Variable ${name} is already declared.`);
    }
    this._data.set(name.escapedText as string, new VariableData(type));
  }

  public set(name: ts.Identifier): void {
    if (!this._data.has(name.escapedText as string)) {
      throw new Error(`Variable is not declared.`);
    }
    this._data.get(name.escapedText as string)!.isInitialized = true;
  }
}

class EmitContext {
  private _outputStack = new Stack<StringBuilder>([new StringBuilder()]);
  private _scopeStack = new Stack<VariableScope>([new VariableScope()]);

  public functions: ts.FunctionDeclaration[] = [];

  public isEmittingCallExpressionExpression = false;

  constructor(public readonly typeChecker: ts.TypeChecker, public readonly sourceFile: ts.SourceFile) {}

  public get output(): StringBuilder {
    return this._outputStack.top;
  }

  public pushOutput(output: StringBuilder): void {
    this._outputStack.push(output);
  }

  public popOutput(): void {
    this._outputStack.pop();
  }

  public pushScope(): void {
    this._scopeStack.push(new VariableScope());
  }

  public popScope(): void {
    this._scopeStack.pop();
  }

  public get scope(): VariableScope {
    return this._scopeStack.top;
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

function mapType(context: EmitContext, type: ts.Type): string {
  let typeName = context.typeChecker.typeToString(type);

  if (typeName.startsWith('"') && typeName.endsWith('"')) {
    typeName = "string";
  }

  if (typeName.startsWith("number")) {
    typeName = typeName.replace("number", "i32");
  }

  if (isFirstCharacterDigit(typeName)) {
    typeName = "i32";
  }

  if (typeName.endsWith("[]")) {
    typeName = typeName.substring(0, typeName.length - 2);
    typeName = `Array<${typeName}>`;
  }

  switch (typeName) {
    case "boolean":
      typeName = "bool";
      break;
  }

  return typeName;
}

function getTypeFromNode(context: EmitContext, node: ts.Node): string {
  const type = context.typeChecker.getTypeAtLocation(node);
  return mapType(context, type);
}

function getFunctionReturnType(context: EmitContext, functionDeclaration: ts.FunctionDeclaration): string {
  const signature = context.typeChecker.getSignatureFromDeclaration(functionDeclaration);
  return mapType(context, signature!.getReturnType());
}

function getFunctionParameterType(context: EmitContext, parameter: ts.ParameterDeclaration): string {
  const type = context.typeChecker.getTypeAtLocation(parameter);
  return mapType(context, type);
}

export async function emit(typeChecker: ts.TypeChecker, sourceFile: ts.SourceFile): Promise<EmitResult> {
  const context = new EmitContext(typeChecker, sourceFile);

  await emitPreamble(context);

  const fowardDeclaredFunctions = context.output.insertPlaceholder();
  fowardDeclaredFunctions.appendLine("// Functions");

  for (const statement of sourceFile.statements) {
    emitTopLevelStatement(context, statement);
  }

  context.pushOutput(fowardDeclaredFunctions);
  for (const func of context.functions) {
    emitFunctionDeclaration(context, func, { signatureOnly: true });
  }
  context.popOutput();

  return {
    output: context.output.toString(),
  };
}

async function emitPreamble(context: EmitContext): Promise<void> {
  context.output.appendLine("#include <TypeSlang/runtime.cpp>");
  context.output.appendLine("using namespace JS;");
}

function emitTopLevelStatement(context: EmitContext, statement: ts.Statement): void {
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
}

function emitImportDeclaration(context: EmitContext, importDeclaration: ts.ImportDeclaration): void {
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
}

interface EmitFunctionDeclarationOptions {
  signatureOnly?: boolean;
}

function emitFunctionDeclaration(
  context: EmitContext,
  functionDeclaration: ts.FunctionDeclaration,
  options: EmitFunctionDeclarationOptions = {},
): void {
  const returnType = getFunctionReturnType(context, functionDeclaration);

  if (!functionDeclaration.name) {
    throw new EmitError(context, functionDeclaration, `Expected function name to be defined.`);
  }

  context.output.append(`${returnType} ${functionDeclaration.name.escapedText}(`);

  for (let i = 0; i < functionDeclaration.parameters.length; i++) {
    if (i !== 0) {
      context.output.append(", ");
    }

    const parameter = functionDeclaration.parameters[i];
    const parameterType = getFunctionParameterType(context, parameter);
    context.output.append(`${parameterType} ${(parameter.name as ts.Identifier).escapedText}`);
  }

  context.output.append(")");

  if (!options.signatureOnly) {
    context.functions.push(functionDeclaration);
    context.scope.declare(functionDeclaration.name, "function");
    context.scope.set(functionDeclaration.name);

    context.output.append(" ");

    if (functionDeclaration.body) {
      emitBlock(context, functionDeclaration.body);
    }

    context.output.appendLine();
    context.output.appendLine();
  } else {
    context.output.appendLine(";");
  }
}

function emitFunctionLevelStatement(context: EmitContext, statement: ts.Statement): void {
  switch (statement.kind) {
    case ts.SyntaxKind.Block:
      emitBlock(context, statement as ts.Block);
      break;

    case ts.SyntaxKind.DoStatement:
      emitDoStatement(context, statement as ts.DoStatement);
      break;

    case ts.SyntaxKind.ExpressionStatement:
      emitExpressionStatement(context, statement as ts.ExpressionStatement);
      break;

    case ts.SyntaxKind.ForStatement:
      emitForStatement(context, statement as ts.ForStatement);
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
}

function emitBlock(context: EmitContext, block: ts.Block): void {
  context.output.appendLine("{");
  context.output.indent();

  context.pushScope();

  for (const statement of block.statements) {
    emitFunctionLevelStatement(context, statement);
  }

  context.popScope();

  context.output.unindent();
  context.output.append("}");
}

function emitDoStatement(context: EmitContext, doStatement: ts.DoStatement): void {
  context.output.append("do ");

  emitFunctionLevelStatement(context, doStatement.statement);

  context.output.append(" while (");

  emitExpression(context, doStatement.expression);

  context.output.append(");");

  context.output.appendLine();
}

function emitExpressionStatement(context: EmitContext, expressionStatement: ts.ExpressionStatement): void {
  emitExpression(context, expressionStatement.expression);
  context.output.appendLine(";");
}

function emitForStatement(context: EmitContext, forStatement: ts.ForStatement): void {
  context.output.append("for (");

  if (forStatement.initializer) {
    if (forStatement.initializer.kind === ts.SyntaxKind.VariableDeclarationList) {
      emitVariableDeclarationList(context, forStatement.initializer as ts.VariableDeclarationList);
    } else {
      emitExpression(context, forStatement.initializer as ts.Expression);
    }
  }
  context.output.append("; ");

  if (forStatement.condition) {
    emitExpression(context, forStatement.condition);
  }
  context.output.append("; ");

  if (forStatement.incrementor) {
    emitExpression(context, forStatement.incrementor);
  }
  context.output.append(") ");

  emitFunctionLevelStatement(context, forStatement.statement);

  context.output.appendLine();
}

function emitIfStatement(context: EmitContext, ifStatement: ts.IfStatement): void {
  context.output.append("if (");
  emitExpression(context, ifStatement.expression);
  context.output.append(") ");
  emitFunctionLevelStatement(context, ifStatement.thenStatement);

  if (ifStatement.elseStatement) {
    context.output.append(" else ");
    emitFunctionLevelStatement(context, ifStatement.elseStatement);
  }
  context.output.appendLine();
}

function emitReturnStatement(context: EmitContext, returnStatement: ts.ReturnStatement): void {
  if (returnStatement.expression) {
    context.output.append("return ");
    emitExpression(context, returnStatement.expression);
    context.output.appendLine(";");
  } else {
    context.output.appendLine("return;");
  }
}

function emitVariableStatement(context: EmitContext, variableStatement: ts.VariableStatement): void {
  const isConst = hasFlag(variableStatement.declarationList.flags, ts.NodeFlags.Const);

  emitVariableDeclarationList(context, variableStatement.declarationList, {
    isConst,
  });

  context.output.appendLine(";");
}

interface EmitVariableDeclarationListOptions {
  isConst?: boolean;
}

function emitVariableDeclarationList(
  context: EmitContext,
  variableDeclarationList: ts.VariableDeclarationList,
  options: EmitVariableDeclarationListOptions = {},
): void {
  const { isConst } = options;

  for (const variableDeclaration of variableDeclarationList.declarations) {
    const type = getTypeFromNode(context, variableDeclaration);

    context.output.append(type);
    context.output.append(" ");
    emitIdentifier(context, variableDeclaration.name as ts.Identifier);

    context.scope.declare(variableDeclaration.name as ts.Identifier, type);

    if (variableDeclaration.initializer) {
      context.output.append(" = ");
      emitExpression(context, variableDeclaration.initializer);

      context.scope.set(variableDeclaration.name as ts.Identifier);
    }
  }
}

function emitWhileStatement(context: EmitContext, whileStatement: ts.WhileStatement): void {
  context.output.append("while (");
  emitExpression(context, whileStatement.expression);
  context.output.append(") ");
  emitFunctionLevelStatement(context, whileStatement.statement);
  context.output.appendLine();
}

function emitExpression(context: EmitContext, expression: ts.Expression): void {
  switch (expression.kind) {
    case ts.SyntaxKind.ArrayLiteralExpression:
      emitArrayLiteralExpression(context, expression as ts.ArrayLiteralExpression);
      break;

    case ts.SyntaxKind.BinaryExpression:
      emitBinaryExpression(context, expression as ts.BinaryExpression);
      break;

    case ts.SyntaxKind.CallExpression:
      emitCallExpression(context, expression as ts.CallExpression);
      break;

    case ts.SyntaxKind.ElementAccessExpression:
      emitElementAccessExpression(context, expression as ts.ElementAccessExpression);
      break;

    case ts.SyntaxKind.Identifier:
      emitIdentifier(context, expression as ts.Identifier);
      break;

    case ts.SyntaxKind.NumericLiteral:
      emitNumericLiteral(context, expression as ts.NumericLiteral);
      break;

    case ts.SyntaxKind.PrefixUnaryExpression:
      emitPrefixUnaryExpression(context, expression as ts.PrefixUnaryExpression);
      break;

    case ts.SyntaxKind.PostfixUnaryExpression:
      emitPostfixUnaryExpression(context, expression as ts.PostfixUnaryExpression);
      break;

    case ts.SyntaxKind.PropertyAccessExpression:
      emitPropertyAccessExpression(context, expression as ts.PropertyAccessExpression);
      break;

    case ts.SyntaxKind.StringLiteral:
      emitStringLiteral(context, expression as ts.StringLiteral);
      break;

    case ts.SyntaxKind.TemplateExpression:
      emitTemplateExpression(context, expression as ts.TemplateExpression);
      break;

    case ts.SyntaxKind.TrueKeyword:
    case ts.SyntaxKind.FalseKeyword:
      emitBooleanLiteral(context, expression as ts.BooleanLiteral);
      break;

    default:
      throw new EmitError(
        context,
        expression,
        `Failed to emit ${nodeKindString(expression)} in ${emitExpression.name}.`,
      );
  }
}

function emitArrayLiteralExpression(context: EmitContext, arrayLiteralExpression: ts.ArrayLiteralExpression): void {
  const type = getTypeFromNode(context, arrayLiteralExpression);

  context.output.append(`${type}({ `);

  for (let i = 0; i < arrayLiteralExpression.elements.length; i++) {
    emitExpression(context, arrayLiteralExpression.elements[i]!);
    if (i !== arrayLiteralExpression.elements.length - 1) {
      context.output.append(", ");
    }
  }

  context.output.append(` }, ${arrayLiteralExpression.elements.length})`);
}

function emitBinaryExpression(context: EmitContext, binaryExpression: ts.BinaryExpression): void {
  emitExpression(context, binaryExpression.left);

  switch (binaryExpression.operatorToken.kind) {
    case ts.SyntaxKind.AsteriskToken:
      context.output.append(" * ");
      break;

    case ts.SyntaxKind.AsteriskEqualsToken:
      context.output.append(" *= ");
      break;

    case ts.SyntaxKind.FirstAssignment:
      context.output.append(" = ");
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
}

function emitBooleanLiteral(context: EmitContext, booleanLiteral: ts.BooleanLiteral): void {
  if (booleanLiteral.kind === ts.SyntaxKind.TrueKeyword) {
    context.output.append("true");
  } else {
    context.output.append("false");
  }
}

function emitCallExpression(context: EmitContext, callExpression: ts.CallExpression): void {
  try {
    context.isEmittingCallExpressionExpression = true;
    emitExpression(context, callExpression.expression);
  } finally {
    context.isEmittingCallExpressionExpression = false;
  }

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

function emitElementAccessExpression(context: EmitContext, elementAccessExpression: ts.ElementAccessExpression): void {
  emitExpression(context, elementAccessExpression.expression);
  context.output.append("[");
  emitExpression(context, elementAccessExpression.argumentExpression);
  context.output.append("]");
}

function emitPrefixUnaryExpression(context: EmitContext, prefixUnaryExpression: ts.PrefixUnaryExpression): void {
  switch (prefixUnaryExpression.operator) {
    case ts.SyntaxKind.ExclamationToken:
      context.output.append("!");
      break;

    case ts.SyntaxKind.MinusToken:
      context.output.append("-");
      break;

    case ts.SyntaxKind.MinusMinusToken:
      context.output.append("--");
      break;

    case ts.SyntaxKind.PlusPlusToken:
      context.output.append("++");
      break;
  }

  emitExpression(context, prefixUnaryExpression.operand);
}

function emitPostfixUnaryExpression(context: EmitContext, postfixUnaryExpression: ts.PostfixUnaryExpression): void {
  emitExpression(context, postfixUnaryExpression.operand);

  switch (postfixUnaryExpression.operator) {
    case ts.SyntaxKind.MinusMinusToken:
      context.output.append("--");
      break;

    case ts.SyntaxKind.PlusPlusToken:
      context.output.append("++");
      break;
  }
}

function emitPropertyAccessExpression(
  context: EmitContext,
  propertyAccessExpression: ts.PropertyAccessExpression,
): void {
  emitExpression(context, propertyAccessExpression.expression);
  context.output.append(".");
  emitMemberName(context, propertyAccessExpression.name);

  // NOTE: Properties are not supported in C++ so we have to call
  // a method.
  if (!context.isEmittingCallExpressionExpression) {
    context.output.append("()");
  }
}

function emitMemberName(context: EmitContext, memberName: ts.MemberName): void {
  emitIdentifier(context, memberName);
}

function emitIdentifier(context: EmitContext, identifier: ts.Identifier | ts.PrivateIdentifier): void {
  context.output.append(identifier.escapedText as string);
}

function emitNumericLiteral(context: EmitContext, numcericLiteral: ts.NumericLiteral): void {
  context.output.append(numcericLiteral.text);
}

function emitStringLiteral(context: EmitContext, stringLiteral: ts.StringLiteral): void {
  context.output.append(`String("${stringLiteral.text}", ${stringLiteral.text.length.toString()})`);
}

function emitTemplateExpression(context: EmitContext, templateExpression: ts.TemplateExpression): void {
  const expressions: ts.Expression[] = [];

  context.output.append('String::format("');

  if (templateExpression.head.text) {
    context.output.append(templateExpression.head.text);
  }

  for (const templateSpan of templateExpression.templateSpans) {
    if (templateSpan.expression) {
      expressions.push(templateSpan.expression);
      context.output.append("{}");
    }

    if (templateSpan.literal.text) {
      context.output.append(templateSpan.literal.text);
    }
  }

  context.output.append('"');

  for (const expression of expressions) {
    context.output.append(", ");
    emitExpression(context, expression);
  }

  context.output.append(")");
}
