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
    nameOrNode: string | ts.Node,
    options: {
      initializer?: ts.Expression;
    } = {},
  ): string {
    let result: string | null = null;

    if (typeof nameOrNode === "string") {
      result = this.scope.getType(nameOrNode);
    } else {
      let shouldMapType = false;

      // Ignore "as const" expressions
      if (isAsConstExpression(nameOrNode)) {
        result = this.getTypeName(nameOrNode.expression);
      }

      // If it's an identifier get the type by name.
      if (result === null && ts.isIdentifier(nameOrNode)) {
        result = this.scope.getType(nameOrNode.getText());
      }

      if (result === null && hasTypeProperty(nameOrNode)) {
        result = nameOrNode.type.getText();
        shouldMapType = true;
      }

      if (result === null && ts.isFunctionDeclaration(nameOrNode)) {
        const signature = this._typeChecker.getSignatureFromDeclaration(nameOrNode);
        const type = signature!.getReturnType();
        result = this._typeChecker.typeToString(type);
        shouldMapType = true;
      }

      if (result === null && ts.isExpression(nameOrNode) && isPointerCastExpression(this, nameOrNode)) {
        if (nameOrNode.typeArguments && nameOrNode.typeArguments[0]) {
          result = nameOrNode.typeArguments[0].getText();
          result = `Pointer<${result}>`;
        } else {
          result = this.getTypeName(nameOrNode.arguments[0]);

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
        const type = this._typeChecker.getTypeAtLocation(nameOrNode);
        result = this._typeChecker.typeToString(type);
        shouldMapType = true;
      }

      if (shouldMapType) {
        result = mapTypeName(result);
      }
    }

    if (result !== null && result.startsWith("{")) {
      let knownType = this.types.find((x) => x.type.getText() === result);

      if (knownType === undefined) {
        knownType = withIsUsed(createTypeAliasDeclarationFromString("_struct", result));
        this.types.push(knownType);
      }

      result = knownType.name.getText();
    }

    if (result === null || ["any", "const"].includes(result)) {
      // TODO: Throw an EmitError here.
      throw new Error(
        `Failed to get type of ${
          typeof nameOrNode === "string" ? `identifier '${nameOrNode}'` : `node '${nodeKindString(nameOrNode)}'`
        }.`,
      );
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
