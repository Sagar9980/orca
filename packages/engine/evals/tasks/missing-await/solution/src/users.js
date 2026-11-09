const USERS = new Map([
  [1, { id: 1, name: "Ada" }],
  [2, { id: 2, name: "Grace" }],
  [3, { id: 3, name: "Linus" }],
]);

/** Looks up one user, as if over the network. Higher ids take longer. */
export async function fetchUser(id) {
  await new Promise((resolve) => setTimeout(resolve, 5 * id));
  const user = USERS.get(id);
  if (!user) throw new Error(`No user ${id}`);
  return user;
}

/** The names of the given users, in the same order as the ids. */
export async function userNames(ids) {
  const users = await Promise.all(ids.map((id) => fetchUser(id)));
  return users.map((user) => user.name);
}
