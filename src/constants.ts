import { dirname, join, resolve } from "node:path";

export const SRC_PATH = dirname(new URL(import.meta.url).pathname);
export const ROOT_PATH = resolve(join(SRC_PATH, ".."));
