/** "1h30m" -> 5400. Throws a RangeError for anything it can't read. */
export function parseDuration(text) {
  const match = /^(?:(\d+)h)?\s*(?:(\d+)m)?\s*(?:(\d+)s)?$/.exec(text);
  if (!match || !text.trim()) throw new RangeError(`Can't read duration: ${text}`);
  const [, h = 0, m = 0, s = 0] = match;
  return Number(h) * 3600 + Number(m) * 60 + Number(s);
}
