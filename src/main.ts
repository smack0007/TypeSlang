import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import ts from "typescript";
import { emit } from "./backends/cpp/emit.ts";
import { EmitError } from "./backends/emitError.ts";
import type { EmitResult } from "./backends/emitResult.ts";
import { ROOT_PATH, SCRIPT_TARGET } from "./constants.ts";
import { ensureDirectoryExists } from "./fs.ts";
import { isBindingSourceFile } from "./tsUtils.ts";
import { EmitContext } from "./backends/emitContext.ts";

async function main(args: string[]): Promise<i32> {
  // TODO: Check these
  const inputFilePath = path.resolve(args[0] as string);
  const outputFilePath = args[1] as string;

  const compilerOptions: ts.CompilerOptions = {
    target: SCRIPT_TARGET,
  };

  const compilerHost = ts.createCompilerHost(compilerOptions, true);

  const program = ts.createProgram([path.join(ROOT_PATH, "TypeSlang.d.ts"), inputFilePath], compilerOptions, compilerHost);

  const bindingFiles = program.getSourceFiles().filter(isBindingSourceFile);

  const sourceFiles = program.getSourceFiles().filter((x) => !x.isDeclarationFile);

  const sourceFile = sourceFiles.find((x) => x.fileName === inputFilePath);

  if (sourceFile === undefined) {
    console.error("ERROR: Source file was not found.");
    return 1;
  }

  const context = new EmitContext(compilerHost, program);

  let result: EmitResult = undefined!;

  try {
    result = emit(context, sourceFile);
  } catch (error) {
    if (error instanceof EmitError) {
      console.error(error.message);
    } else {
      console.error(error);
    }
    return 1;
  }

  await ensureDirectoryExists(path.dirname(outputFilePath));
  await fs.writeFile(outputFilePath, result.output, "utf8");

  return 0;
}

process.exit(await main(process.argv.slice(2)));
