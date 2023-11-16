import ts from "typescript";
import { Stack } from "../stack.js";
import { StringBuilder } from "../stringBuilder.js";
import { VariableScope } from "./variableScope.js";
import type { IsUsed } from "../markers.js";

export class EmitContext {
  private _outputStack = new Stack<StringBuilder>([new StringBuilder()]);
  private _scopeStack = new Stack<VariableScope>([new VariableScope(this)]);

  public readonly types: IsUsed<ts.TypeAliasDeclaration>[] = [];
  public readonly functions: ts.FunctionDeclaration[] = [];

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
    this._scopeStack.push(new VariableScope(this));
  }

  public popScope(): void {
    this._scopeStack.pop();
  }

  public get scope(): VariableScope {
    return this._scopeStack.top;
  }
}
