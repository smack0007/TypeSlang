import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import ts from "typescript";
import { emit } from "./backends/cpp/emit.js";
import { ensureDirectoryExists } from "./fs.js";
import { ROOT_PATH } from "./constants.js";
import type { EmitResult } from "./backends/emitResult.js";
import { EmitError } from "./backends/emitError.js";

async function main(args: string[]): Promise<i32> {
  // TODO: Check these
  const inputFilePath = args[0] as string;
  const outputFilePath = args[1] as string;

  const program = ts.createProgram([path.join(ROOT_PATH, "TypeSlang.d.ts"), inputFilePath], {
    target: ts.ScriptTarget.ES2022,
  });

  const typeChecker = program.getTypeChecker();

  const sourceFiles = program.getSourceFiles().filter((x) => !x.isDeclarationFile);

  if (sourceFiles.length > 1) {
    console.error("Multiple source files currently not supported.");
    return 1;
  }

  const sourceFile = sourceFiles[0]!;
  let result: EmitResult = undefined!;

  try {
    result = await emit(typeChecker, sourceFile);
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
