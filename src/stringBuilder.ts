import { EOL } from "node:os";

export class StringBuilder {
  private data: (string | StringBuilder)[] = [""];

  private indentLevel = 0;

  private get currentLine(): string {
    return this.data[this.data.length - 1] as string;
  }

  private set currentLine(value: string) {
    this.data[this.data.length - 1] = value;
  }

  private get lineIsBeingWritten(): boolean {
    return this.currentLine.length > 0;
  }

  public indent(): void {
    this.indentLevel += 1;
  }

  public unindent(): void {
    this.indentLevel -= 1;
  }

  public append(value: string): void {
    if (!this.lineIsBeingWritten) {
      this.currentLine += "\t".repeat(this.indentLevel);
    }
    this.currentLine += value;
  }

  public appendLine(value: string = ""): void {
    if (value) {
      this.append(value);
    }
    this.data.push("");
  }

  public removeLine(): void {
    if (this.currentLine.length > 0) {
      this.currentLine = "";
    } else {
      this.data.pop();
    }
  }

  public insertPlaceholder(): StringBuilder {
    const placeholder = new StringBuilder();
    this.data.push(placeholder, "");
    return placeholder;
  }

  public toString(): string {
    let result = this.data
      .map((x) => x.toString())
      // Strip out extra EOL(s)
      .map((x) => (x.endsWith(EOL) ? x.slice(0, -EOL.length) : x))
      .join(EOL);

    if (this.currentLine.length > 0) {
      result += this.currentLine;
    }

    return result;
  }
}
