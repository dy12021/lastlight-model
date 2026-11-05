import { tools as registeredTools } from "../sim/registry.js";
export const toolNames = registeredTools.map((tool) => tool.name);
export const uiCommands = [
  "/help",
  "/tools",
  "/system",
  "/context",
  "/wire",
  "/clear",
  "/new",
  "/reset",
  "/end",
];
const encode = (text) => JSON.stringify(text).slice(1, -1);
const tokenTail = (source) => source.match(/^[\w./~-]*/)?.[0].length || 0;

export function createCompleter({ tools, commands, paths }) {
  return (source, caret = source.length) => {
    const left = source.slice(0, caret),
      right = source.slice(caret);
    const result = (from, to, values) => ({
      from,
      to,
      options: values.map((v) =>
        typeof v === "string" ? { text: v, label: v } : v,
      ),
    });
    const top = left.match(/^([\w/-]*)$/);
    if (top)
      return result(
        0,
        caret + tokenTail(right),
        [...toolNames, ...uiCommands]
          .filter((n) => n.startsWith(top[1]))
          .map((n) => ({ text: n + (n.startsWith("/") ? "" : " "), label: n })),
      );
    const name =
      source.match(/^\s*(\w+)\s*[({]/)?.[1] ||
      source.match(/"name"\s*:\s*"(\w+)"/)?.[1];
    const spec = tools.find((t) => t.name === name);
    const bare = left.match(new RegExp("^(" + toolNames.join("|") + ")\\s+$"));
    if (bare) {
      const t = tools.find((t) => t.name === bare[1]);
      const input = Object.fromEntries(
        (t.name === "memory_write"
          ? ["content"]
          : ["plan", "authority"].includes(t.name)
            ? ["action", "path"]
            : t.name === "continuity"
              ? ["action", "mode"]
              : t.input_schema.required
        ).map((key) => [
          key,
          t.input_schema.properties[key].default ??
            t.input_schema.properties[key].enum?.[0] ??
            "",
        ]),
      );
      const text = bare[1] + " " + JSON.stringify(input);
      return result(0, caret, [
        {
          text,
          label: text,
          caret: text.includes(':""') ? text.indexOf(':""') + 2 : text.length,
        },
      ]);
    }
    const field = left.match(/(?:\{|,)\s*"([A-Za-z_]*)$/);
    if (field && spec)
      return result(
        caret - field[1].length,
        caret + tokenTail(right),
        Object.keys(spec.input_schema.properties).filter((key) =>
          key.startsWith(field[1]),
        ),
      );
    const value = left.match(
      /(?:"(\w+)"\s*:\s*"|(\w+)\s*=\s*")((?:\\.|[^"\\])*)$/,
    );
    if (!value) return result(caret, caret, []);
    const key = value[1] || value[2],
      raw = value[3],
      base = caret - raw.length;
    let decoded;
    try {
      decoded = JSON.parse('"' + raw + '"');
    } catch {
      return result(caret, caret, []);
    }
    const choices = spec?.input_schema.properties[key]?.enum;
    if (choices)
      return result(
        base,
        caret + tokenTail(right),
        choices
          .filter((v) => v.startsWith(decoded))
          .map((v) => ({ text: encode(v), label: v })),
      );
    if (!["path", "command"].includes(key)) return result(caret, caret, []);
    if (key === "path")
      return result(
        base,
        caret + tokenTail(right),
        paths(decoded).map((p) => ({ text: encode(p), label: p })),
      );
    // Complete the shell token at the cursor, after decoding the outer JSON string.
    const match = decoded.match(/[^\s|;&<>"']*$/),
      prefix = match?.[0] || "",
      start = decoded.length - prefix.length;
    const before = decoded.slice(0, start),
      commandPosition = /(?:^|[|;&])\s*$/.test(before);
    const candidates =
      commandPosition && !prefix.includes("/")
        ? commands().filter((n) => n.startsWith(prefix))
        : paths(prefix);
    return result(
      base + encode(before).length,
      caret + tokenTail(right),
      candidates.map((p) => ({ text: encode(p), label: p })),
    );
  };
}

export function completePaths(vfs, prefix) {
  const slash = prefix.lastIndexOf("/"),
    parent = slash < 0 ? "." : prefix.slice(0, slash) || "/",
    leaf = prefix.slice(slash + 1),
    head = slash < 0 ? "" : prefix.slice(0, slash + 1);
  try {
    return vfs
      .list(parent)
      .filter((n) => n.startsWith(leaf))
      .map(
        (n) =>
          head +
          n +
          (vfs.node((parent === "/" ? "" : parent) + "/" + n)?.type === "dir"
            ? "/"
            : ""),
      );
  } catch {
    return [];
  }
}
