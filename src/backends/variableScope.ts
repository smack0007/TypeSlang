import ts from "typescript";
import type { IsUsed } from "../markers.ts";

class VariableData {
  /** Whether or not the variable has been initialized. */
  public isInitialized = false;

  constructor(
    /** The type of the variable. */
    public type: string,
    /** The module from which the variable has been imported. */
    public moduleName: string,
  ) {}
}

type VariableScopeEmitContext = {
  readonly types: IsUsed<ts.TypeAliasDeclaration>[];
};

export class VariableScope {
  private _data: Map<string, VariableData> = new Map<string, VariableData>();

  constructor(private _context: VariableScopeEmitContext, private _parent?: VariableScope) {}

  public declare(name: string, type: string, moduleName: string): void {
    if (this._data.has(name)) {
      throw new Error(`Variable ${name} is already declared.`);
    }
    this._data.set(name, new VariableData(type, moduleName));

    const typeAliasDeclaration = this._context.types.find((x) => x.name.text === type);
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

  public mapName(name: string): string | null {
    if (this._data.has(name)) {
      const data = this._data.get(name) as VariableData;
      return data.moduleName + name;
    } else if (this._parent) {
      return this._parent.mapName(name);
    }

    return null;
  }
}
