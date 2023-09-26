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
    this.append("\n");
  }

  public toString(): string {
    return this.data;
  }
}
