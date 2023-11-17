import ts from "typescript";
import { hasFlag, isFirstCharacterDigit } from "../../utils.js";
import {
  createTypeAliasDeclarationFromString,
  kindString,
  nodeKindString,
  transformInterfaceDeclarationToTypeAliasDeclaration,
} from "../../tsUtils.js";
import { EmitContext } from "../emitContext.js";
import { EmitError } from "../emitError.js";
import type { EmitResult } from "../emitResult.js";
import { withIsUsed } from "../../markers.js";

function mapType(context: EmitContext, node: ts.Node, type: ts.Type, initializer: ts.Expression | undefined): string {
  let typeName = context.typeChecker.typeToString(type);

  if (typeName.startsWith('"') && typeName.endsWith('"')) {
    typeName = "string";
  }

  if (typeName.startsWith("number")) {
    typeName = typeName.replace("number", "i32");
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
    let knownType = context.types.find((x) => x.type.getText() === typeName);

    if (knownType === undefined) {
      knownType = withIsUsed(createTypeAliasDeclarationFromString("_struct", typeName));
      context.types.push(knownType);
    }

    return knownType.name.getText();
  }

  switch (typeName) {
    case "boolean":
      typeName = "bool";
      break;
  }

  if (["any"].includes(typeName)) {
    throw new EmitError(context, node, `Type "${typeName}" is unable to be emitted.`);
  }

  return typeName;
}

function hasTypeProperty(node: ts.Node): node is ts.Node & { type: ts.TypeNode } {
  return !!(node as unknown as { type: ts.Type }).type;
}

function getTypeFromNode(context: EmitContext, node: ts.Node, initializer?: ts.Expression): ts.Type {
  return context.typeChecker.getTypeAtLocation(node);
}

function getTypeAsStringFromNode(context: EmitContext, node: ts.Node, initializer?: ts.Expression): string {
  let result: string | undefined = undefined;

  if (hasTypeProperty(node)) {
    result = node.type.getText();
  }

  if (result === undefined) {
    const type = getTypeFromNode(context, node);
    result = mapType(context, node, type, initializer);
  }

  return result;
}

function getFunctionReturnType(context: EmitContext, functionDeclaration: ts.FunctionDeclaration): string {
  const signature = context.typeChecker.getSignatureFromDeclaration(functionDeclaration);
  return mapType(context, functionDeclaration, signature!.getReturnType(), undefined);
}

function getFunctionParameterType(
  context: EmitContext,
  parameter: ts.ParameterDeclaration,
  initializer?: ts.Expression,
): string {
  const type = context.typeChecker.getTypeAtLocation(parameter);
  return mapType(context, parameter, type, initializer);
}

function shouldEmitParenthesisForPropertyAccessExpression(context: EmitContext, propertySourceType: string): boolean {
  // TODO: This isn't sustainable obviously. Put some real logic behind this.
  if (propertySourceType.startsWith("Array<") || propertySourceType == "string") {
    return true;
  }

  return false;
}

export async function emit(typeChecker: ts.TypeChecker, sourceFile: ts.SourceFile): Promise<EmitResult> {
  const context = new EmitContext(typeChecker, sourceFile);

  await emitPreamble(context);

  const forwardDeclaraedStructs = context.output.insertPlaceholder();
  forwardDeclaraedStructs.appendLine("// Structs");

  const fowardDeclaredFunctions = context.output.insertPlaceholder();
  fowardDeclaredFunctions.appendLine("// Functions");

  for (const statement of sourceFile.statements) {
    emitTopLevelStatement(context, statement);
  }

  context.pushOutput(forwardDeclaraedStructs);
  for (const type of context.types.filter((x) => x.isUsed && x.type.kind === ts.SyntaxKind.TypeLiteral)) {
    emitTypeAliasDeclaration(context, type, { mode: EmitTypeAliasDeclarationMode.Struct });
  }
  context.popOutput();
  forwardDeclaraedStructs.removeLine();

  context.pushOutput(fowardDeclaredFunctions);
  for (const func of context.functions) {
    emitFunctionDeclaration(context, func, { signatureOnly: true });
  }
  context.popOutput();
  fowardDeclaredFunctions.appendLine();

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
    case ts.SyntaxKind.FunctionDeclaration:
      emitFunctionDeclaration(context, statement as ts.FunctionDeclaration);
      break;

    case ts.SyntaxKind.ImportDeclaration:
      emitImportDeclaration(context, statement as ts.ImportDeclaration);
      break;

    case ts.SyntaxKind.InterfaceDeclaration:
      emitInterfaceDeclaration(context, statement as ts.InterfaceDeclaration);
      break;

    case ts.SyntaxKind.TypeAliasDeclaration:
      emitTypeAliasDeclaration(context, statement as ts.TypeAliasDeclaration);
      break;

    case ts.SyntaxKind.VariableStatement:
      emitVariableStatement(context, statement as ts.VariableStatement, { isGlobal: true });
      break;

    default:
      throw new EmitError(
        context,
        statement,
        `Failed to emit ${nodeKindString(statement)} in ${emitTopLevelStatement.name}.`,
      );
  }
}

interface EmitFunctionDeclarationOptions {
  signatureOnly: boolean;
}

function emitFunctionDeclaration(
  context: EmitContext,
  functionDeclaration: ts.FunctionDeclaration,
  options: Partial<EmitFunctionDeclarationOptions> = {},
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
    if (!functionDeclaration.body) {
      throw new EmitError(
        context,
        functionDeclaration,
        `Cannot emit ${nodeKindString(functionDeclaration)} with undefined body.`,
      );
    }

    context.output.append(" ");

    context.functions.push(functionDeclaration);
    context.scope.declare(functionDeclaration.name, "function");
    context.scope.set(functionDeclaration.name);

    context.pushScope();
    for (const parameter of functionDeclaration.parameters) {
      const parameterType = getFunctionParameterType(context, parameter);
      context.scope.declare(parameter.name as ts.Identifier, parameterType);
    }

    emitBlock(context, functionDeclaration.body);
    context.popScope();

    context.output.appendLine();
    context.output.appendLine();
  } else {
    context.output.appendLine(";");
  }
}

function emitImportDeclaration(context: EmitContext, importDeclaration: ts.ImportDeclaration): void {
  throw new EmitError(
    context,
    importDeclaration,
    `Failed to emit ${nodeKindString(importDeclaration)} in ${emitImportDeclaration.name}.`,
  );
}

function emitInterfaceDeclaration(context: EmitContext, interfaceDeclaration: ts.InterfaceDeclaration): void {
  context.types.push(withIsUsed(transformInterfaceDeclarationToTypeAliasDeclaration(interfaceDeclaration)));
}

enum EmitTypeAliasDeclarationMode {
  None,
  Struct,
}

interface EmitTypeAliasDeclarationOptions {
  mode: EmitTypeAliasDeclarationMode;
}

function emitTypeAliasDeclaration(
  context: EmitContext,
  typeAliasDeclaration: ts.TypeAliasDeclaration,
  options: Partial<EmitTypeAliasDeclarationOptions> = {},
): void {
  const { mode = EmitTypeAliasDeclarationMode.None } = options;

  if (mode === EmitTypeAliasDeclarationMode.None) {
    context.types.push(withIsUsed(typeAliasDeclaration));
  } else if (mode === EmitTypeAliasDeclarationMode.Struct) {
    if (typeAliasDeclaration.type.kind !== ts.SyntaxKind.TypeLiteral) {
      throw new EmitError(
        context,
        typeAliasDeclaration,
        `${nodeKindString(typeAliasDeclaration)} cannot be emitted as a struct because 'type' is not a ${kindString(
          ts.SyntaxKind.TypeLiteral,
        )} in ${emitImportDeclaration.name}.`,
      );
    }

    context.output.appendLine(`struct ${typeAliasDeclaration.name.escapedText} {`);
    context.output.indent();

    for (const member of (typeAliasDeclaration.type as ts.TypeLiteralNode).members) {
      const memberType = getTypeAsStringFromNode(context, member);
      context.output.append(`${memberType} `);
      emitIdentifier(context, member.name as ts.Identifier);
      context.output.appendLine(";");
    }

    context.output.unindent();
    context.output.appendLine("};");
    context.output.appendLine();
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

interface EmitVaraibleStatementOptions {
  isGlobal?: boolean;
}

function emitVariableStatement(
  context: EmitContext,
  variableStatement: ts.VariableStatement,
  options: Partial<EmitVaraibleStatementOptions> = {},
): void {
  const { isGlobal = false } = options;

  const isConst = hasFlag(variableStatement.declarationList.flags, ts.NodeFlags.Const);

  emitVariableDeclarationList(context, variableStatement.declarationList, {
    isGlobal,
    isConst,
  });

  context.output.appendLine(";");
}

interface EmitVariableDeclarationListOptions {
  isGlobal: boolean;
  isConst: boolean;
}

function emitVariableDeclarationList(
  context: EmitContext,
  variableDeclarationList: ts.VariableDeclarationList,
  options: Partial<EmitVariableDeclarationListOptions> = {},
): void {
  const { isGlobal = false, isConst = false } = options;

  for (const variableDeclaration of variableDeclarationList.declarations) {
    const type = getTypeAsStringFromNode(context, variableDeclaration, variableDeclaration.initializer);

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

    case ts.SyntaxKind.AsExpression:
      emitAsExpression(context, expression as ts.AsExpression);
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

    case ts.SyntaxKind.ObjectLiteralExpression:
      emitObjectLiteralExpression(context, expression as ts.ObjectLiteralExpression);
      break;

    case ts.SyntaxKind.ParenthesizedExpression:
      emitParenthesizedExpression(context, expression as ts.ParenthesizedExpression);
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
  const type = getTypeAsStringFromNode(context, arrayLiteralExpression);

  context.output.append(`${type}({ `);

  for (let i = 0; i < arrayLiteralExpression.elements.length; i++) {
    emitExpression(context, arrayLiteralExpression.elements[i]!);
    if (i !== arrayLiteralExpression.elements.length - 1) {
      context.output.append(", ");
    }
  }

  context.output.append(` }, ${arrayLiteralExpression.elements.length})`);
}

function emitAsExpression(context: EmitContext, asExpression: ts.AsExpression): void {
  const type = getTypeAsStringFromNode(context, asExpression);

  if (asExpression.expression.kind === ts.SyntaxKind.NumericLiteral && (type === "f32" || type === "f64")) {
    emitNumericLiteral(context, asExpression.expression as ts.NumericLiteral);

    const hasDot = (asExpression.expression as ts.NumericLiteral).text.includes(".");
    if (!hasDot) {
      context.output.append(".");
    }

    if (type === "f32") {
      context.output.append("f");
    }
  } else {
    context.output.append("(");
    emitType(context, asExpression.type);
    context.output.append(")");
    emitExpression(context, asExpression.expression);
  }
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
        `Failed to emit ${nodeKindString(binaryExpression.operatorToken)} for ${nodeKindString(binaryExpression)} in ${
          emitBinaryExpression.name
        }.`,
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

    default:
      throw new EmitError(
        context,
        prefixUnaryExpression,
        `Failed to emit ${ts.SyntaxKind[prefixUnaryExpression.operator]} in ${emitPrefixUnaryExpression.name}.`,
      );
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

    default:
      throw new EmitError(
        context,
        postfixUnaryExpression,
        `Failed to emit ${ts.SyntaxKind[postfixUnaryExpression.operator]} in ${emitPostfixUnaryExpression.name}.`,
      );
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
  if (
    !context.isEmittingCallExpressionExpression &&
    shouldEmitParenthesisForPropertyAccessExpression(
      context,
      getTypeAsStringFromNode(context, propertyAccessExpression.expression),
    )
  ) {
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

function emitObjectLiteralExpression(context: EmitContext, objectLiteralExpression: ts.ObjectLiteralExpression): void {
  const type = getTypeFromNode(context, objectLiteralExpression);

  context.output.append("{");

  for (let i = 0; i < objectLiteralExpression.properties.length; i++) {
    const property = objectLiteralExpression.properties[i];

    if (i != 0) {
      context.output.append(", ");
    } else {
      context.output.append(" ");
    }

    context.output.append(".");
    emitIdentifier(context, property.name as ts.Identifier);
    context.output.append(" = ");

    if (property.kind === ts.SyntaxKind.PropertyAssignment) {
      emitExpression(context, property.initializer);
    } else if (property.kind === ts.SyntaxKind.ShorthandPropertyAssignment) {
      emitIdentifier(context, property.name as ts.Identifier);
    } else {
      throw new EmitError(
        context,
        property,
        `Failed to emit ${nodeKindString(property)} in ${emitObjectLiteralExpression.name}.`,
      );
    }

    if (i === objectLiteralExpression.properties.length - 1) {
      context.output.append(" ");
    }
  }

  context.output.append("}");
}

function emitParenthesizedExpression(context: EmitContext, parenthesizedExpression: ts.ParenthesizedExpression): void {
  context.output.append("(");
  emitExpression(context, parenthesizedExpression.expression);
  context.output.append(")");
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

function emitType(context: EmitContext, type: ts.TypeNode): void {
  context.output.append(getTypeAsStringFromNode(context, type));
}
