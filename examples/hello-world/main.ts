function main(): i32 {
  const message = "Hello";
  const message2 = "World!";
  const value = 21 + 21 - 10;
  if (value > 30) {
    const message3 = message + " " + message2;
    console.info(message3, message3.length);
  } else {
    console.info("We shouldn't be here.");
  }
  return 0;
}
