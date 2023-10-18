function main(): i32 {
  const data = [1, 2, 3, 4];
  console.info(data, data[1] + data[2]);

  const message = "Hello";
  const message2 = "World!";
  let counter = 1;
  do {
    if (counter < 30) {
      const message3 = message + " " + message2;
      console.info(counter, message3);
    } else {
      console.info(counter, "Done.");
    }
    counter += 1;
  } while (counter <= 30);
  return 0;
}
