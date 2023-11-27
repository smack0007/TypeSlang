import ts from "typescript";
import { Stack } from "../stack.ts";
import { StringBuilder } from "../stringBuilder.ts";
import { VariableScope } from "./variableScope.ts";
import type { IsUsed } from "../markers.ts";
import { hasTypeProperty, mapTypeName } from "./typeUtils.ts";
import { isAddressOfExpression } from "./customNodes.ts";
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

  public getType(
    nameOrNode: string | ts.Node,
    options: {
      initializer?: ts.Expression;
    } = {},
  ): string {
    let result: string | null = null;

    if (typeof nameOrNode === "string") {
      result = this.scope.getType(nameOrNode);
    } else {
      if (ts.isIdentifier(nameOrNode)) {
        result = this.scope.getType(nameOrNode.getText());
      }

      if (hasTypeProperty(nameOrNode)) {
        const typeName = nameOrNode.type.getText();
        result = mapTypeName(this.types, typeName);
      }

      if (ts.isFunctionDeclaration(nameOrNode)) {
        const signature = this._typeChecker.getSignatureFromDeclaration(nameOrNode);
        const type = signature!.getReturnType();
        const typeName = this._typeChecker.typeToString(type);
        result = mapTypeName(this.types, typeName);
      }

      if (result === null && options.initializer && isAddressOfExpression(options.initializer)) {
        result = this.getType(options.initializer.arguments[0]);

        if (result.startsWith("Array<") && result.endsWith(">")) {
          result = result.replace("Array<", "Pointer<");
        } else {
          result = `Pointer<${result}>`;
        }
      }

      if (result === null) {
        const type = this._typeChecker.getTypeAtLocation(nameOrNode);
        const typeName = this._typeChecker.typeToString(type);
        result = mapTypeName(this.types, typeName);
      }
    }

    if (result === null) {
      throw new Error(`Failed to get type of '${nameOrNode}'.`);
    }

    return result;
  }
}
