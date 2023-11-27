import fs from "node:fs/promises";
import { isError } from "./utils.ts";

export async function ensureDirectoryExists(directory: string): Promise<void> {
  try {
    await fs.stat(directory);
  } catch (error) {
    if (isError(error)) {
      try {
        await fs.mkdir(directory);
      } catch (err) {}
    }
  }
}
