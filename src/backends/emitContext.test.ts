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
  const context = createEmitContext("const foo = 42;");
  const statement = context.sourceFile.statements.at(0) as ts.VariableStatement;
  context.declare("foo", "i32");
  assert.strictEqual(context.getType("foo"), "i32");
});

test(EmitContext.prototype.isPointerTypeName.name, () => {
  const context = createEmitContext("");

  assert.equal(context.isPointerTypeName("Pointer<u8>"), true);
  assert.equal(context.isPointerTypeName("Pointer<u32>"), true);
  assert.equal(context.isPointerTypeName("Pointer<Pointer<u8>>"), true);

  assert.equal(context.isPointerTypeName("Array<Pointer<u8>>"), false);
});

test(EmitContext.prototype.isNumberTypeName.name, () => {
  const context = createEmitContext("");

  assert.equal(context.isNumberTypeName("f32"), true);
  assert.equal(context.isNumberTypeName("f64"), true);
  assert.equal(context.isNumberTypeName("i8"), true);
  assert.equal(context.isNumberTypeName("i16"), true);
  assert.equal(context.isNumberTypeName("i32"), true);
  assert.equal(context.isNumberTypeName("i64"), true);
  assert.equal(context.isNumberTypeName("u8"), true);
  assert.equal(context.isNumberTypeName("u16"), true);
  assert.equal(context.isNumberTypeName("u32"), true);
  assert.equal(context.isNumberTypeName("u64"), true);

  assert.equal(context.isNumberTypeName("Pointer<u8>"), false);
});
