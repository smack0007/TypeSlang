import fs from "node:fs/promises";
import process from "node:process";
import ts from "typescript";
import { emit, type EmitResult } from "./backends/cpp/emit.js";

async function main(args: string[]): Promise<i32> {
  // TODO: Check these
  const inputFilePath = args[0] as string;
  const outputFilePath = args[1] as string;

  const program = ts.createProgram([inputFilePath], {
    target: ts.ScriptTarget.ES2022,
  });
  
  const typeChecker = program.getTypeChecker();

  const sourceFiles = program.getSourceFiles().filter((x) =>
    !x.isDeclarationFile
  );

  if (sourceFiles.length > 1) {
    console.error("Multiple source files currently not supported.");
    return 1;
  }

  const sourceFile = sourceFiles[0]!;
  let result: EmitResult = undefined!;

  try {
    result = await emit(typeChecker, sourceFile);
  } catch (error) {
    console.error(error);
    return 1;
  }

  await fs.writeFile(outputFilePath, result.output, "utf8");

  return 0;
}

process.exit(await main(process.argv.slice(2)));
