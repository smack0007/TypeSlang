import ts from "typescript";
import { EmitContext } from "./emitContext.ts";

export type NumberToStringExpression = ts.CallExpression & {
  expression: ts.PropertyAccessExpression;
  arguments: [] | [ts.Expression];
};

export function isNumberToStringExpression(
  context: EmitContext,
  expression: ts.Expression,
): expression is NumberToStringExpression {
  return (
    ts.isCallExpression(expression) &&
    ts.isPropertyAccessExpression(expression.expression) &&
    context.isNumberTypeName(context.getTypeName(expression.expression.expression)) &&
    ts.isIdentifier(expression.expression.name) &&
    expression.expression.name.getText() === "toString" &&
    (expression.arguments.length === 0 || expression.arguments.length === 1)
  );
}

export type PointerCastExpression = ts.CallExpression & {
  expression: ts.Identifier;
  arguments: [ts.Expression];
};

export function isPointerCastExpression(
  context: EmitContext,
  expression: ts.Expression,
): expression is PointerCastExpression {
  return (
    ts.isCallExpression(expression) &&
    ts.isIdentifier(expression.expression) &&
    expression.expression.getText() === "Pointer" &&
    expression.arguments.length === 1
  );
}
