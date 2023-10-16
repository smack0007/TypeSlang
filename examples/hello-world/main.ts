function main(): i32 {
  const message = "Hello";
  const message2 = "World!";
  let counter = 1;
  for (let i = 1; i <= 30; i++) {
    if (counter < 30) {
      const message3 = message + " " + message2;
      console.info(counter, message3);
    } else {
      console.info(counter, "Done.");
    }
    counter += 1;
  }
  return 0;
}
