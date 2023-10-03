function main(): i32 {
  const message = "Hello";
  const message2 = "World!";
  const value = 21 + 21 - 10;
  if (value > 30) {
    console.info(message + " " + message2);
  } else {
    console.info("We shouldn't be here.");
  }
  return 0;
}
