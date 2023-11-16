import ts from "typescript";
import type { EmitContext } from "./emitContext.js";

export class EmitError extends Error {
  constructor(context: EmitContext, public readonly node: ts.Node, message: string) {
    const { line, character } = context.sourceFile.getLineAndCharacterOfPosition(node.getStart(context.sourceFile));

    super(`(${line + 1}, ${character}): ${message}`);
  }
}
