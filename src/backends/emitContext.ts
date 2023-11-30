import ts from "typescript";
import { Stack } from "../stack.ts";
import { StringBuilder } from "../stringBuilder.ts";
import { VariableScope } from "./variableScope.ts";
import { withIsUsed, type IsUsed } from "../markers.ts";
import { hasTypeProperty, mapTypeName } from "./typeUtils.ts";
import { isPointerCastExpression } from "./customNodes.ts";
import { createTypeAliasDeclarationFromString, isAsConstExpression, nodeKindString } from "../tsUtils.ts";
import { EmitError } from "./emitError.ts";

export class EmitContext {
  private _outputStack = new Stack<StringBuilder>([new StringBuilder()]);
  private _scopeStack = new Stack<VariableScope>([new VariableScope(this)]);

  public readonly types: IsUsed<ts.TypeAliasDeclaration>[] = [];
  public readonly functions: ts.FunctionDeclaration[] = [];

  public isEmittingCallExpressionExpression = false;
  public emittingVariableDeclarationType: string | null = null;

  constructor(private readonly _typeChecker: ts.TypeChecker, public readonly sourceFile: ts.SourceFile) {}

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
    this._scopeStack.push(new VariableScope(this, this.scope));
  }

  public popScope(): void {
    this._scopeStack.pop();
  }

  private get scope(): VariableScope {
    return this._scopeStack.top;
  }

  public declare(name: string, type: string): void {
    this.scope.declare(name, type);
  }

  public set(name: string): void {
    this.scope.set(name);
  }

  public getTypeName(
    node: ts.Node,
    options: {
      initializer?: ts.Expression;
    } = {},
  ): string {
    let result: string | null = null;
    let shouldMapType = false;

    // Ignore "as const" expressions
    if (isAsConstExpression(node)) {
      result = this.getTypeName(node.expression);
    }

    // If it's an identifier get the type by name.
    if (result === null && ts.isIdentifier(node)) {
      result = this.scope.getType(node.text);
    }

    if (result === null && hasTypeProperty(node)) {
      result = node.type.getText();
      shouldMapType = true;
    }

    if (result === null && ts.isFunctionDeclaration(node)) {
      const signature = this._typeChecker.getSignatureFromDeclaration(node);
      const type = signature!.getReturnType();
      result = this._typeChecker.typeToString(type);
      shouldMapType = true;
    }

    if (result === null && ts.isExpression(node) && isPointerCastExpression(this, node)) {
      if (node.typeArguments && node.typeArguments[0]) {
        result = node.typeArguments[0].getText();
        result = `Pointer<${result}>`;
      } else {
        result = this.getTypeName(node.arguments[0]);

        if (result.startsWith("Array<") && result.endsWith(">")) {
          result = result.replace("Array<", "Pointer<");
        } else {
          result = `Pointer<${result}>`;
        }
      }
    }

    if (result === null && options.initializer) {
      result = this.getTypeName(options.initializer);
    }

    if (result === null) {
      const type = this._typeChecker.getTypeAtLocation(node);
      result = this._typeChecker.typeToString(type);
      shouldMapType = true;
    }

    if (shouldMapType) {
      result = mapTypeName(result);
    }

    if (result !== null && result.startsWith("{")) {
      let knownType = this.types.find((x) => x.type.getText() === result);

      if (knownType === undefined) {
        knownType = withIsUsed(createTypeAliasDeclarationFromString("_struct", result));
        this.types.push(knownType);
      }

      result = knownType.name.text;
    }

    if (result === null || ["any", "const"].includes(result)) {
      throw new EmitError(this, node, `Failed to get type of ${nodeKindString(node)} node.`);
    }

    return result;
  }

  public isPointerTypeName(typeName: string): boolean {
    return typeName.startsWith("Pointer<") && typeName.endsWith(">");
  }

  public isNumberTypeName(typeName: string): boolean {
    return (
      typeName === "f32" ||
      typeName === "f64" ||
      typeName === "i8" ||
      typeName === "i16" ||
      typeName === "i32" ||
      typeName === "i64" ||
      typeName === "u8" ||
      typeName === "u16" ||
      typeName === "u32" ||
      typeName === "u64"
    );
  }
}
