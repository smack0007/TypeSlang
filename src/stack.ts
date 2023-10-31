export class Stack<T> {
  private _initialLength;

  constructor(private _data: T[] = []) {
    this._initialLength = _data.length;
  }

  public at(index: number): T {
    if (this._data[index] === undefined) {
      throw new Error("Index out of bounds");
    }

    return this._data[index];
  }

  public push(item: T): void {
    this._data.push(item);
  }

  public pop(): T {
    if (this._data.length <= this._initialLength) {
      throw new Error("Stack is empty.");
    }
    return this._data.pop() as T;
  }

  public get top(): T {
    if (this._data.length <= 0) {
      throw new Error("Stack empty.");
    }
    return this._data[this._data.length - 1];
  }
}
