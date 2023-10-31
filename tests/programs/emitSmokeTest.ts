// This program should invoke each function in emit.ts at least once.

function sayHello(name: string, age: number): void {
  console.info(`Hello ${name}, you are ${age} years old!`);
}

function main(): i32 {
  sayHello("Joe", 42);
  sayHello("Bob", 42 / 2);

  arrays();

  const name = "World";
  let counter = 1;
  do {
    if (counter < 30) {
      console.info(`${counter} Hello ${name}!`);
    } else {
      console.info(counter, "Done.");
    }
    counter += 1;
  } while (counter <= 30);
  return 0;
}

function arrays(): void {
  const data = [1, 2, 3, 4];
  console.info(data, data.length);
  console.info(data.pop());
  data.push(5);
  console.info(data, data.length);
}
