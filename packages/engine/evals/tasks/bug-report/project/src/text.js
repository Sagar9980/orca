/** Number of words in the text. */
export function wordCount(text) {
  return text.split(" ").length;
}

/** "hello big world" -> "Hello Big World" */
export function titleCase(text) {
  return text.replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
}
