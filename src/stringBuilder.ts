import { EOL } from "node:os";

export class StringBuilder {
  private data = "";
  private indentLevel = 0;

  public append(value: string): void {
    this.data += value;
  }

  public appendLine(value: string = ""): void {
    if (value) {
      this.append(value);
    }
    this.append(EOL);
  }

  public toString(): string {
    return this.data;
  }
}
