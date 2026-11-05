import { tokens, messageTokens } from "./tokens.js";
export class Context {
  constructor(system, tools, window = 32000) {
    this.system = system;
    this.tools = tools;
    this.window = window;
    this.entries = [];
    this.serial = 0;
  }
  get fixedTokens() {
    return tokens(this.system) + tokens(JSON.stringify(this.tools));
  }
  get used() {
    return (
      this.fixedTokens +
      this.entries.reduce(
        (n, e) => n + (e.level === 3 ? 0 : messageTokens(e.message)),
        0,
      )
    );
  }
  append(message, label = "记录") {
    const id = ++this.serial;
    const previous = this.entries.at(-1);
    const group =
      message.content.some((b) => b.type === "tool_result") &&
      previous?.message?.content.some((b) => b.type === "tool_use")
        ? previous.group
        : id;
    this.entries.push({
      id,
      group,
      level: 0,
      label,
      message: structuredClone(message),
    });
  }
  fade() {
    const pressure = this.used / this.window;
    const target =
      pressure >= 0.95 ? 3 : pressure >= 0.85 ? 2 : pressure >= 0.75 ? 1 : 0;
    let changed = 0;
    // Keep the most recent turn legible; old entries lose information irreversibly.
    const protectedGroups = new Set(
      this.entries.slice(-2).map((e) => e.group ?? e.id),
    );
    for (const entry of this.entries.filter(
      (e) => !protectedGroups.has(e.group ?? e.id),
    )) {
      if (target <= entry.level) continue;
      entry.level = target;
      changed++;
      entry.message.content = entry.message.content.map((block) => {
        const key =
          block.type === "tool_result"
            ? "content"
            : block.type === "text"
              ? "text"
              : null;
        if (!key)
          return target >= 2
            ? {
                ...block,
                input: Object.fromEntries(
                  Object.entries(block.input || {}).slice(0, 1),
                ),
              }
            : block;
        // Images have no text surrogate. At first fade destroy original bytes.
        if (Array.isArray(block[key]))
          return {
            ...block,
            [key]: [
              {
                type: "text",
                text:
                  target >= 2 ? "图像已不可辨" : "图像细节已消散；需重新观测",
              },
            ],
          };
        const lines = block[key].split("\n");
        const value =
          target >= 2
            ? entry.label + " — 内容已不可辨"
            : lines.length > 2
              ? `${lines[0]}\n…（${lines.length - 2} 行已模糊）…\n${lines.at(-1)}`
              : "…（短记录已模糊）…";
        return { ...block, [key]: value };
      });
      if (target === 3) entry.message = null;
    }
    while (this.used > this.window) {
      const entry = this.entries.find((e) => e.level < 3);
      if (!entry) break;
      for (const sibling of this.entries.filter(
        (e) => (e.group ?? e.id) === (entry.group ?? entry.id) && e.level < 3,
      )) {
        sibling.level = 3;
        sibling.message = null;
        changed++;
      }
    }
    return changed;
  }
  get messages() {
    return this.entries.filter((e) => e.level < 3).map((e) => e.message);
  }
  clear() {
    this.entries = [];
  }
  summary() {
    return {
      tokens: this.used,
      window: this.window,
      fixed: this.fixedTokens,
      levels: [0, 1, 2, 3].map(
        (l) => this.entries.filter((e) => e.level === l).length,
      ),
      nextFade: Math.max(0, Math.ceil(this.window * 0.75 - this.used)),
    };
  }
}
