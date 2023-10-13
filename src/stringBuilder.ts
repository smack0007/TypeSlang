import { EOL } from "node:os";

export class StringBuilder {
  private data = "";

  private indentLevel = 0;
  private lineIsBeingWritten = false;

  public indent(): void {
    this.indentLevel += 1;
  }

  public unindent(): void {
    this.indentLevel -= 1;
  }

  public append(value: string): void {
    if (!this.lineIsBeingWritten) {
      this.data += "\t".repeat(this.indentLevel);
      this.lineIsBeingWritten = true;
    }
    this.data += value;
  }

  public appendLine(value: string = ""): void {
    if (value) {
      this.append(value);
    }
    this.append(EOL);
    this.lineIsBeingWritten = false;
  }

  public toString(): string {
    return this.data;
  }
}
