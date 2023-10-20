function main(): i32 {
  const data = [1, 2, 3, 4];
  console.info(data, data.length);
  console.info(data.pop());
  data.push(5);
  console.info(data, data.length);

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
