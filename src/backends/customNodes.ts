import * as ts from "typescript";
import type { EmitContext } from "./emitContext.js";

export type AddressOfExpression = ts.CallExpression & {
  expression: ts.Identifier;
  arguments: [ts.Expression];
};

export function isAddressOfExpression(expression: ts.Expression): expression is AddressOfExpression {
  return (
    ts.isCallExpression(expression) &&
    ts.isIdentifier(expression.expression) &&
    expression.expression.getText() === "Pointer" &&
    expression.arguments.length === 1
  );
}
