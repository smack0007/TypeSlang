import ts from "typescript";
import { hasFlag } from "../../utils.ts";
import { kindString, nodeKindString, transformInterfaceDeclarationToTypeAliasDeclaration } from "../../tsUtils.ts";
import { EmitContext } from "../emitContext.ts";
import { EmitError } from "../emitError.ts";
import type { EmitResult } from "../emitResult.ts";
import { withIsUsed } from "../../markers.ts";
import { isPointerCastExpression, isNumberToStringExpression, PointerCastExpression } from "../customNodes.ts";
import { NUMBER_SUPPORTED_RADIX } from "../../constants.ts";

function shouldEmitParenthesisForPropertyAccessExpression(context: EmitContext, propertySourceType: string): boolean {
  // TODO: This isn't sustainable obviously. Put some real logic behind this.
  if (propertySourceType.startsWith("Array<") || propertySourceType == "string") {
    return true;
  }

  return false;
}

export function emit(context: EmitContext, sourceFile: ts.SourceFile): EmitResult {
  emitPreamble(context);

  const forwardDeclaraedStructs = context.output.insertPlaceholder();
  forwardDeclaraedStructs.appendLine("// Structs");

  // TODO: Forward declaration is basically broken in it's current state as context.mapName doesn't
  // return the correct name when it's later called. Should now be able to just directly output the
  // forward declaration in emitFunctionDeclaration instead of having to have a 2nd run.
  const fowardDeclaredFunctions = context.output.insertPlaceholder();
  fowardDeclaredFunctions.appendLine("// Functions");

  emitSourceFile(context, sourceFile);

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

function emitPreamble(context: EmitContext): void {
  context.output.appendLine("#include <TypeSlang/runtime.cpp>");
  context.output.appendLine("using namespace JS;");

  context.declare("console", "Console");
}

interface EmitSourceFileOptions {
  moduleName?: string;
}

function emitSourceFile(context: EmitContext, sourceFile: ts.SourceFile, options: EmitSourceFileOptions = {}): void {
  context.pushSourceFile(sourceFile, options.moduleName ?? "");
  // HACK: Need a better way of getting all the globals defined up front.
  for (const statement of sourceFile.statements) {
    switch (statement.kind) {
      case ts.SyntaxKind.FunctionDeclaration:
        {
          const functionName = ((statement as ts.FunctionDeclaration).name as ts.Identifier).text;
          context.declare(functionName, "function", options.moduleName ?? "");
          context.set(functionName);
        }
        break;
    }
  }

  for (const statement of sourceFile.statements) {
    emitTopLevelStatement(context, statement);
  }
  context.popSourceFile();
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
  const returnType = context.getTypeName(functionDeclaration);

  if (!functionDeclaration.name) {
    throw new EmitError(context, functionDeclaration, `Expected function name to be defined.`);
  }

  const functionName = context.mapName(functionDeclaration.name.text);

  context.output.append(`${returnType} ${functionName}(`);

  for (let i = 0; i < functionDeclaration.parameters.length; i++) {
    if (i !== 0) {
      context.output.append(", ");
    }

    const parameter = functionDeclaration.parameters[i];
    const parameterType = context.getTypeName(parameter);
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
    // TODO: Reactivate this once the hack in emitSourceFile is fixed.
    // context.declare(functionName, "function");
    // context.set(functionName);

    context.pushScope();
    for (const parameter of functionDeclaration.parameters) {
      const parameterType = context.getTypeName(parameter);
      context.declare(parameter.name.getText(), parameterType);
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
  let success = false;

  // NOTE: According to the docs this should never happen.
  if (!ts.isStringLiteral(importDeclaration.moduleSpecifier)) {
    throw new EmitError(
      context,
      importDeclaration,
      `Failed to emit ${nodeKindString(importDeclaration)} in ${emitImportDeclaration.name}.`,
    );
  }

  const moduleName = ts.resolveModuleName(
    importDeclaration.moduleSpecifier.text,
    context.sourceFile.fileName,
    context.program.getCompilerOptions(),
    context.compilerHost,
  );

  if (moduleName.resolvedModule) {
    // If imported via a module name
    if (moduleName.resolvedModule.isExternalLibraryImport) {
    } else {
      // Imported via a file path
      const importedSourceFile = context.program.getSourceFile(moduleName.resolvedModule.resolvedFileName);

      if (importedSourceFile) {
        emitSourceFile(context, importedSourceFile, {
          moduleName: importDeclaration.moduleSpecifier.text,
        });
        success = true;
      } else {
        throw new EmitError(
          context,
          importDeclaration,
          `Failed to import "${moduleName.resolvedModule.resolvedFileName}".`,
        );
      }
    }
  }

  if (!success) {
    throw new EmitError(
      context,
      importDeclaration,
      `Failed to emit ${nodeKindString(importDeclaration)} in ${emitImportDeclaration.name}.`,
    );
  }

  if (!importDeclaration.importClause) {
    return;
  }

  // TODO: Handle namespace import
  if (importDeclaration.importClause.name) {
    throw new EmitError(
      context,
      importDeclaration.importClause.name,
      `Failed to emit ${nodeKindString(importDeclaration.importClause.name)} in ${emitImportDeclaration.name}.`,
    );
  }

  if (importDeclaration.importClause.namedBindings) {
    if (ts.isNamedImports(importDeclaration.importClause.namedBindings)) {
      for (const element of importDeclaration.importClause.namedBindings.elements) {
        context.declare(element.name.text, context.getTypeName(element), importDeclaration.moduleSpecifier.text);
      }
    } else {
      throw new EmitError(
        context,
        importDeclaration.importClause.namedBindings,
        `Failed to emit ${nodeKindString(importDeclaration.importClause.namedBindings)} in ${
          emitImportDeclaration.name
        }.`,
      );
    }
  }
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
      const memberType = context.getTypeName(member);
      context.output.append(`${memberType} `);
      emitIdentifier(context, member.name as ts.Identifier, { shouldNotMapName: true });
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
    if (!ts.isIdentifier(variableDeclaration.name)) {
      throw new EmitError(
        context,
        variableDeclaration,
        `Expected ${nodeKindString(variableDeclaration.name)} to be Identifier.`,
      );
    }

    const type = context.getTypeName(variableDeclaration, { initializer: variableDeclaration.initializer });
    context.emittingVariableDeclarationType = type;

    context.declare(variableDeclaration.name.text, type);
    context.output.append(type);
    context.output.append(" ");
    emitIdentifier(context, variableDeclaration.name);

    if (variableDeclaration.initializer) {
      context.set(variableDeclaration.name.text);
      context.output.append(" = ");
      emitExpression(context, variableDeclaration.initializer);
    }

    context.emittingVariableDeclarationType = null;
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
  const type =
    context.emittingVariableDeclarationType !== null
      ? context.emittingVariableDeclarationType
      : context.getTypeName(arrayLiteralExpression);

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
  // Ignore "as const" expressions
  if (ts.isConstTypeReference(asExpression.type)) {
    emitExpression(context, asExpression.expression);
    return;
  }

  const type = context.getTypeName(asExpression);

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
    context.output.append(type);
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
  if (isPointerCastExpression(context, callExpression)) {
    emitPointerCastExpression(context, callExpression);
    return;
  }

  if (isNumberToStringExpression(context, callExpression)) {
    context.output.append("Number::toString(");
    emitExpression(context, callExpression.expression.expression);

    if (callExpression.arguments.length === 1) {
      context.output.append(", ");

      if (ts.isNumericLiteral(callExpression.arguments[0])) {
        if (!NUMBER_SUPPORTED_RADIX.includes(callExpression.arguments[0].text)) {
          throw new EmitError(
            context,
            callExpression.arguments[0],
            `Radix of ${callExpression.arguments[0].text} is not supported.`,
          );
        }

        emitNumericLiteral(context, callExpression.arguments[0]);
      } else {
        emitExpression(context, callExpression.arguments[0]);
      }
    }

    context.output.append(")");
    return;
  }

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

function emitPointerCastExpression(context: EmitContext, pointerCastExpression: PointerCastExpression): void {
  if (pointerCastExpression.arguments.length !== 1) {
    throw new EmitError(
      context,
      pointerCastExpression,
      `Failed to emit ${nodeKindString(pointerCastExpression)} as pointer cast in ${emitPointerCastExpression.name}.`,
    );
  }

  context.output.append("(");
  context.output.append(context.getTypeName(pointerCastExpression));
  context.output.append(")");
  context.output.append(`&`);
  emitExpression(context, pointerCastExpression.arguments[0]);
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
  const expressionType = context.getTypeName(propertyAccessExpression.expression);

  if (context.isPointerTypeName(expressionType) && ts.isIdentifier(propertyAccessExpression.name)) {
    if (propertyAccessExpression.name.text === "addressOf") {
      context.output.append("(void*)");
      emitExpression(context, propertyAccessExpression.expression);
      return;
    } else if (propertyAccessExpression.name.text === "dereference") {
      context.output.append("*");
      emitExpression(context, propertyAccessExpression.expression);
      return;
    }
  }

  emitExpression(context, propertyAccessExpression.expression);
  if (context.isPointerTypeName(expressionType)) {
    context.output.append("->");
  } else {
    context.output.append(".");
  }

  emitIdentifier(context, propertyAccessExpression.name, { shouldNotMapName: true });

  // NOTE: Properties are not supported in C++ so we have to call a method.
  if (
    !context.isEmittingCallExpressionExpression &&
    shouldEmitParenthesisForPropertyAccessExpression(context, context.getTypeName(propertyAccessExpression.expression))
  ) {
    context.output.append("()");
  }
}

interface EmitIdentifierOptions {
  shouldNotMapName?: boolean;
}

function emitIdentifier(
  context: EmitContext,
  identifier: ts.Identifier | ts.PrivateIdentifier,
  options: EmitIdentifierOptions = {},
): void {
  let identifierName = identifier.text;

  if (!options.shouldNotMapName) {
    identifierName = context.mapVariableName(identifier, identifierName);
  }

  context.output.append(identifierName);
}

function emitNumericLiteral(context: EmitContext, numcericLiteral: ts.NumericLiteral): void {
  context.output.append(numcericLiteral.text);
}

function emitObjectLiteralExpression(context: EmitContext, objectLiteralExpression: ts.ObjectLiteralExpression): void {
  context.output.append("{");

  for (let i = 0; i < objectLiteralExpression.properties.length; i++) {
    const property = objectLiteralExpression.properties[i];

    if (i != 0) {
      context.output.append(", ");
    } else {
      context.output.append(" ");
    }

    context.output.append(".");
    emitIdentifier(context, property.name as ts.Identifier, { shouldNotMapName: true });
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
