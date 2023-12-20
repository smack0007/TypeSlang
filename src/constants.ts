import ts from "typescript";
import { dirname, join, resolve } from "node:path";

export const SRC_PATH = dirname(new URL(import.meta.url).pathname);
export const ROOT_PATH = resolve(join(SRC_PATH, ".."));

export const SCRIPT_TARGET = ts.ScriptTarget.ES2022;

export const NUMBER_SUPPORTED_RADIX = ["2", "10", "16"];

export const TYPESLANG_BINDING_HEADER = "/** @TypeSlang */";
