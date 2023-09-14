import fs from "node:fs/promises";
import process from "node:process";
import ts from "typescript";

async function main(args: string[]): Promise<i32> {
  // TODO: Check these
  const inputFilePath = args[0] as string;
  const outputFilePath = args[1] as string;

  console.info(`${inputFilePath} => ${outputFilePath}`);
  const inputFile = await fs.readFile(inputFilePath, "utf8");

  const sourceFile: ts.SourceFile = ts.createSourceFile(
    "main.ts",
    inputFile,
    ts.ScriptTarget.ES2022,
    true,
    ts.ScriptKind.TS,
  );

  for (const child of sourceFile.getChildren()) {
    console.info(child.getText());
  }

  const printer: ts.Printer = ts.createPrinter();
  console.log(printer.printFile(sourceFile));

  return 0;
}

process.exit(await main(process.argv.slice(2)));
