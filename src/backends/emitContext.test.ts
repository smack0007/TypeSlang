import * as assert from "node:assert/strict";
import { test } from "node:test";
import ts from "typescript";
import { EmitContext } from "./emitContext.ts";
import { SCRIPT_TARGET } from "../constants.ts";

function createEmitContext(sourceText: string): EmitContext {
  const FILENAME = "test.ts";

  const sourceFile = ts.createSourceFile(FILENAME, sourceText, SCRIPT_TARGET);

  const defaultCompilerHost = ts.createCompilerHost({});

  const customCompilerHost: ts.CompilerHost = {
    getSourceFile: (fileName, languageVersion) => {
      if (fileName === FILENAME) {
        return sourceFile;
      } else {
        return defaultCompilerHost.getSourceFile(fileName, languageVersion);
      }
    },
    writeFile: () => {},
    getDefaultLibFileName: () => "lib.d.ts",
    useCaseSensitiveFileNames: () => false,
    getCanonicalFileName: (filename) => filename,
    getCurrentDirectory: () => "",
    getNewLine: () => "\n",
    getDirectories: () => [],
    fileExists: () => true,
    readFile: () => "",
  };

  const program = ts.createProgram(
    [FILENAME],
    {
      target: SCRIPT_TARGET,
    },
    customCompilerHost,
  );

  return new EmitContext(program.getTypeChecker(), sourceFile);
}

test("should work", () => {
  const context = createEmitContext("const foo: number = 42;");
  const statement = context.sourceFile.statements.at(0) as ts.VariableStatement;
  //context.declare(identifier, "number");
  assert.strictEqual(context.getType(statement.declarationList.declarations.at(0)!), "i32");
});
