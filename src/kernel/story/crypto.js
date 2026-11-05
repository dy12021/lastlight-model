const encoder = new TextEncoder();
export async function sha256(text) {
  const hash = await crypto.subtle.digest("SHA-256", encoder.encode(text));
  return [...new Uint8Array(hash)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
export const fromBase64 = (text) =>
  Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
export async function decodeArchive(parts, key, iv) {
  const imported = await crypto.subtle.importKey(
    "raw",
    fromBase64(key),
    { name: "AES-GCM" },
    false,
    ["decrypt"],
  );
  const raw = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64(iv) },
    imported,
    fromBase64(parts.join("")),
  );
  const files = JSON.parse(
    new TextDecoder("utf-8", { fatal: true }).decode(raw),
  );
  if (!files || typeof files !== "object" || Array.isArray(files))
    throw new Error("归档格式无效");
  for (const [path, content] of Object.entries(files))
    if (
      !path.startsWith("/home/kiwi/archive/") ||
      path.includes("..") ||
      typeof content !== "string"
    )
      throw new Error("归档文件路径或内容无效");
  return files;
}
