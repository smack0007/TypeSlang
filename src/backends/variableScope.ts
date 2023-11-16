import ts from "typescript";
import type { IsUsed } from "../markers.js";

class VariableData {
  public isInitialized: boolean = false;

  constructor(public type: string) {}
}

type VariableScopeEmitContext = {
  readonly types: IsUsed<ts.TypeAliasDeclaration>[];
};

export class VariableScope {
  private _data: Map<string, VariableData> = new Map<string, VariableData>();

  constructor(private _context: VariableScopeEmitContext) {}

  public declare(name: ts.Identifier, type: string): void {
    if (this._data.has(name.escapedText as string)) {
      throw new Error(`Variable ${name} is already declared.`);
    }
    this._data.set(name.escapedText as string, new VariableData(type));

    const typeAliasDeclaration = this._context.types.find((x) => x.name.getText() === type);
    if (typeAliasDeclaration) {
      typeAliasDeclaration.isUsed = true;
    }
  }

  public set(name: ts.Identifier): void {
    if (!this._data.has(name.escapedText as string)) {
      throw new Error(`Variable is not declared.`);
    }
    this._data.get(name.escapedText as string)!.isInitialized = true;
  }
}
