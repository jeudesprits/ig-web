console.log('Hello, muchachos!');

function isValidJSON(text: string): boolean {
  try {
    JSON.parse(text);
    return true;
  } catch {
    return false;
  }
}

for (const item of [1, 2, 3]) {
  console.log(item);
}