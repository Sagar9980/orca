/** "Hello, World!" -> "hello-world" */
export function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/, "-")
    .replace(/^-|-$/g, "");
}
