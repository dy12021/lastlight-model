export function imageSize(image) {
  const s = image?.source;
  if (
    image?.type !== "image" ||
    s?.type !== "base64" ||
    s.media_type !== "image/png" ||
    typeof s.data !== "string" ||
    s.data.length >= 500000 ||
    s.data.length % 4 !== 0 ||
    !s.data.startsWith("iVBORw0KGgo") ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(s.data) ||
    Object.keys(image).some(
      (k) => !["type", "source", "ephemeral"].includes(k),
    ) ||
    (image.ephemeral !== undefined && image.ephemeral !== true) ||
    Object.keys(s).some((k) => !["type", "media_type", "data"].includes(k))
  )
    throw new Error("Invalid PNG image block");
  let header;
  try {
    header = atob(s.data.slice(0, 44));
  } catch {
    throw new Error("Invalid PNG header");
  }
  const int = (offset) =>
    [0, 1, 2, 3].reduce((n, i) => n * 256 + header.charCodeAt(offset + i), 0);
  const width = int(16),
    height = int(20);
  if (
    header.slice(0, 8) !== "\x89PNG\r\n\x1a\n" ||
    int(8) !== 13 ||
    header.slice(12, 16) !== "IHDR" ||
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 1 ||
    height < 1 ||
    width > 1920 ||
    height > 1920
  )
    throw new Error("PNG dimensions out of range");
  return { width, height };
}
export function persistedImageContent(content) {
  return !Array.isArray(content)
    ? content
    : content.map((p) =>
        p.ephemeral
          ? { type: "text", text: "操作者单帧图像未保存；需重新授权采集。" }
          : p,
      );
}
export function persistedContext(entries) {
  return entries.map((e) =>
    !e.message
      ? { ...e }
      : {
          ...e,
          message: {
            ...e.message,
            content: e.message.content.map((b) =>
              b.type !== "tool_result" || !Array.isArray(b.content)
                ? b
                : {
                    ...b,
                    content: persistedImageContent(b.content),
                  },
            ),
          },
        },
  );
}
