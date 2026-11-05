export function tokens(text) {
  let n = 0;
  for (const c of String(text))
    n += /[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]/u.test(c) ? 1 : 0.25;
  return Math.ceil(n);
}
export const messageTokens = (message) =>
  tokens(
    JSON.stringify(message, (key, value) =>
      value?.type === "image"
        ? { type: "image", estimated_tokens: "x".repeat(2400) }
        : value,
    ),
  ) + 4;
