// This program should invoke each function in emit.ts at least once.

const USER_NAME = "smack0007";
const MAGIC_NUMBER = 42;

const USER_MAP = {
  admin: USER_NAME,
  developer: "Zachary Snow",
} as const;

type IsNotUsed = {
  task: string;
};

function sayHello(name: string, age: number): void {
  console.info(`Hello ${name}, you are ${age} years old!`);
}

function main(): i32 {
  // sayHello(USER_NAME, MAGIC_NUMBER);
  // sayHello("Bob", 42 / 2);

  // arrays();
  // booleans();
  // whileLoop();
  // doWhile();
  // floats();
  structs();

  return 0;
}

function arrays(): void {
  const data = [1, 2, 3, 4];
  console.info(data, data.length);
  console.info(data.pop());
  data.push(5);
  console.info(data, data.length);
}

function booleans(): void {
  let condition = !false;
  if (condition) {
    console.info("Condition is true.");
  } else {
    console.info("Condition is false.");
  }
  condition = !true;
  if (condition) {
    console.info("Condition is true.");
  } else {
    console.info("Condition is false.");
  }
  condition = !!true;
  if (condition) {
    console.info("Condition is true.");
  } else {
    console.info("Condition is false.");
  }
}

function whileLoop(): void {
  let counter = 1;
  while (counter <= 30) {
    if (counter < 30) {
      console.info(counter, "Hello World!");
    } else {
      console.info(counter, "Done.");
    }
    counter += 1;
  }
}

function doWhile(): void {
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
}

function floats(): void {
  const value = 12.34;
  const value2: f32 = 12.34 as f32;
  const value3: f64 = 12.34;
  const value4: f32 = (12 as f32) + (0.34 as f32);
  const value5: f64 = value + value2 + value3 + value4;
  console.info(value, value2, value3, value4, value5);
}

interface Point {
  x: f64;
  y: f64;
}

type Person = {
  name: string;
  age: i32;
};

function structs(): void {
  const p1: Point = { x: 1.2, y: 3.4 };
  console.info(`(${p1.x}, ${p1.y})`);

  greetPerson(createPerson("Bob Freeman", 42));
}

function createPerson(name: string, age: number): Person {
  return { name, age };
}

function greetPerson(person: Person): void {
  console.info(`Hello ${person.name} you are ${person.age} years old.`);
}
