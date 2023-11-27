import ts from "typescript";
import { Stack } from "../stack.ts";
import { StringBuilder } from "../stringBuilder.ts";
import { VariableScope } from "./variableScope.ts";
import type { IsUsed } from "../markers.ts";
import { hasTypeProperty, mapTypeName } from "./typeUtils.ts";
import { isAddressOfExpression } from "./customNodes.ts";

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
    this._scopeStack.push(new VariableScope(this));
  }

  public popScope(): void {
    this._scopeStack.pop();
  }

  private get scope(): VariableScope {
    return this._scopeStack.top;
  }

  public declare(name: ts.Identifier, type: string): void {
    this.scope.declare(name, type);
  }

  public set(name: ts.Identifier): void {
    this.scope.set(name);
  }

  public getType(
    node: ts.Node,
    options: {
      initializer?: ts.Expression;
    } = {},
  ): string {
    let result: string | undefined = undefined;

    if (hasTypeProperty(node)) {
      const typeName = node.type.getText();
      result = mapTypeName(this.types, node, typeName);
    }

    if (ts.isFunctionDeclaration(node)) {
      const signature = this._typeChecker.getSignatureFromDeclaration(node);
      const type = signature!.getReturnType();
      const typeName = this._typeChecker.typeToString(type);
      result = mapTypeName(this.types, node, typeName);
    }

    if (result === undefined && options.initializer && isAddressOfExpression(options.initializer)) {
      result = this.getType(options.initializer.arguments[0]);

      if (result.startsWith("Array<") && result.endsWith(">")) {
        result = result.replace("Array<", "Pointer<");
      } else {
        result = `Pointer<${result}>`;
      }
    }

    if (result === undefined) {
      const type = this._typeChecker.getTypeAtLocation(node);
      const typeName = this._typeChecker.typeToString(type);
      result = mapTypeName(this.types, node, typeName);
    }

    return result;
  }
}
