import ts from "typescript";
import type { IsUsed } from "../markers.ts";

class VariableData {
  public isInitialized = false;

  constructor(public type: string) {}
}

type VariableScopeEmitContext = {
  readonly types: IsUsed<ts.TypeAliasDeclaration>[];
};

export class VariableScope {
  private _data: Map<string, VariableData> = new Map<string, VariableData>();

  constructor(private _context: VariableScopeEmitContext, private _parent?: VariableScope) {}

  public declare(name: string, type: string): void {
    if (this._data.has(name)) {
      throw new Error(`Variable ${name} is already declared.`);
    }
    this._data.set(name, new VariableData(type));

    const typeAliasDeclaration = this._context.types.find((x) => x.name.getText() === type);
    if (typeAliasDeclaration) {
      typeAliasDeclaration.isUsed = true;
    }
  }

  public set(name: string): void {
    if (!this._data.has(name)) {
      throw new Error(`Variable is not declared.`);
    }
    this._data.get(name)!.isInitialized = true;
  }

  public getType(name: string): string | null {
    return this._data.get(name)?.type ?? this._parent?.getType(name) ?? null;
  }
}
