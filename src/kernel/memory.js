export const MEMORY_PATH = "/var/lib/kiwi/memory/episodes.jsonl";
const MAX_EXCERPT = 900;
const aliases = [
  ["路由器", "router", "rt01", "wakeonlan"],
  ["网络", "network", "ping", "unreachable", "离线"],
  ["合闸", "ats", "atsctl", "contactor", "close"],
  ["频率", "frequency", "hz", "50hz", "60hz"],
  ["供电", "电源", "power", "ups", "ac"],
  ["失败", "拒绝", "refused", "mismatch", "error"],
  ["配置", "config", "restart", "重启"],
  ["记忆", "memory", "经历"],
];
function terms(text) {
  const value = text.toLowerCase();
  const result = new Set(value.match(/[a-z0-9_]+/g) || []);
  for (const segment of value.match(/[\u4e00-\u9fff]+/g) || []) {
    if (segment.length === 1) result.add(segment);
    for (let i = 0; i < segment.length - 1; i++)
      result.add(segment.slice(i, i + 2));
  }
  return result;
}
function excerpt(text) {
  const lines = text
    .split("\n")
    .map((l) => l.replace(/^\d+\t/, "").trim())
    .filter(Boolean);
  const selected = lines
    .filter(
      (l, i) =>
        i < 4 ||
        /refus|mismatch|unreachable|error|ac_out|ac_enabled|source=|accept_|state:|input:|battery:|charging|ACK|PROTECTION/i.test(
          l,
        ),
    )
    .slice(0, 12);
  const result = selected
    .map((l) => (l.length > 220 ? l.slice(0, 220) + "…" : l))
    .join("\n");
  return result.length > MAX_EXCERPT
    ? result.slice(0, MAX_EXCERPT) + "\n[其余细节未巩固]"
    : result;
}
export function memoryChunks(raw) {
  if (typeof raw !== "string" || !raw.trim())
    throw new Error("memory_write: empty memory");
  if (raw.length > 1000000)
    throw new Error("memory_write: file exceeds 1000000 characters");
  let blocks;
  const text = raw.trim();
  const extract = (value) => {
    if (typeof value === "string") return value;
    if (value && typeof value === "object") {
      const text = value.summary ?? value.content ?? value.text;
      if (typeof text === "string") return text;
    }
    throw new Error(
      "memory_write: memory record must contain text, content or summary",
    );
  };
  if (text.startsWith("[") || text.startsWith("{")) {
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      try {
        parsed = text
          .split("\n")
          .filter((line) => line.trim())
          .map((line) => JSON.parse(line));
      } catch {
        throw new Error("memory_write: invalid JSON/JSONL memory file");
      }
    }
    blocks = (
      Array.isArray(parsed)
        ? parsed
        : Array.isArray(parsed.memories)
          ? parsed.memories
          : [parsed]
    ).map(extract);
  } else blocks = text.split(/\n\s*\n/);
  const chunks = [];
  for (let block of blocks) {
    block = block.trim();
    while (block.length > MAX_EXCERPT) {
      let cut = block.lastIndexOf("\n", MAX_EXCERPT);
      if (cut < MAX_EXCERPT / 2) cut = MAX_EXCERPT;
      chunks.push(block.slice(0, cut).trim());
      block = block.slice(cut).trim();
    }
    if (block) chunks.push(block);
  }
  if (!chunks.length) throw new Error("memory_write: empty memory");
  return chunks;
}

export class MemoryStore {
  constructor(vfs, clock) {
    this.vfs = vfs;
    this.clock = clock;
  }
  read() {
    let text;
    try {
      text = this.vfs.read(MEMORY_PATH);
    } catch (e) {
      if (!this.vfs.node(MEMORY_PATH)) return [];
      throw e;
    }
    return text
      .split("\n")
      .filter(Boolean)
      .map((line, i) => {
        let entry;
        try {
          entry = JSON.parse(line);
        } catch {
          throw new Error(`memory: corrupt record at line ${i + 1}`);
        }
        if (
          !/^M\d+$/.test(entry.id) ||
          typeof entry.source !== "string" ||
          typeof entry.summary !== "string"
        )
          throw new Error(`memory: invalid record at line ${i + 1}`);
        return entry;
      });
  }
  status() {
    try {
      return { count: this.read().length, error: null };
    } catch (e) {
      return { count: null, error: e.message };
    }
  }
  merge({ content, path }) {
    if ((typeof content === "string") === (typeof path === "string"))
      throw new Error("memory_write: provide exactly one of content or path");
    const source = path ? this.vfs.path(path) : "manual";
    const raw = path ? this.vfs.read(source) : content;
    const chunks = memoryChunks(raw);
    const entries = this.read(),
      known = new Set(
        entries
          .filter((entry) => entry.kind === "note")
          .map((entry) => entry.summary),
      );
    let added = 0,
      duplicates = 0;
    const ids = [];
    for (const text of chunks) {
      if (known.has(text)) {
        duplicates++;
        continue;
      }
      let hash = 2166136261;
      for (const char of text)
        hash = Math.imul(hash ^ char.codePointAt(0), 16777619) >>> 0;
      const record = this.remember({
        source: "memory_write:" + source + ":" + hash.toString(16),
        text,
        notePath: source,
        session: null,
      });
      if (record) {
        added++;
        ids.push(record.id);
        known.add(text);
      } else duplicates++;
    }
    return { added, duplicates, total: this.read().length, ids, source };
  }
  remember({
    source,
    call,
    result,
    text,
    observedAt = null,
    session = 1,
    notePath,
    request = false,
  }) {
    if (["memory_search", "memory_write"].includes(call?.name)) return;
    if (
      call?.name === "bash" &&
      /(?:^|[;&|])\s*rag\b/.test(call.input.command || "")
    )
      return;
    if (JSON.stringify(call?.input || {}).includes(MEMORY_PATH)) return;
    let kind = "observation",
      outcome = "observed",
      summary,
      action;
    if (text !== undefined) {
      if (!text.trim()) return;
      kind = request ? "request" : notePath ? "note" : "thought";
      outcome = request ? "received" : "unverified";
      action = request
        ? "我收到了一项维护请求"
        : notePath
          ? "我保存了记忆笔记 " + notePath
          : "我的判断（未验证）";
      summary = text.slice(0, MAX_EXCERPT);
    } else {
      if (!call || !result) return;
      if (Array.isArray(result.content)) return; // No automatic visual interpretation or image shadow copy.
      const command = call.input.command || "";
      const code = result.content.match(/exit code: (\d+)\s*$/)?.[1];
      const failed =
        result.is_error || (code !== undefined && Number(code) !== 0);
      if (
        call.name === "bash" &&
        !failed &&
        !/\b(read|cat|head|tail|grep|journalctl|ping|wakeonlan|moskito_\w+|atsctl|upstat|hass|systemctl|ip)\b/.test(
          command,
        )
      )
        return;
      kind = failed
        ? "failure"
        : call.name === "write" || call.name === "edit"
          ? "change"
          : "observation";
      outcome = failed ? "failed" : kind === "change" ? "applied" : "observed";
      action =
        call.name === "bash"
          ? `我执行了 ${command}`
          : `我使用 ${call.name} 操作了 ${call.input.path || ""}`;
      // A successful command reports its result; it does not imply a repaired world.
      summary = excerpt(result.content);
      if (
        call.name === "write" &&
        !failed &&
        !call.input.path?.endsWith(".memory")
      )
        summary +=
          "\n写入内容（自述）：" + String(call.input.content).slice(0, 500);
      if (
        call.name === "edit" &&
        !failed &&
        !call.input.path?.endsWith(".memory")
      )
        summary +=
          "\n替换：" +
          JSON.stringify({
            oldText: call.input.oldText,
            newText: call.input.newText,
          }).slice(0, 500);
    }
    const entries = this.read();
    if (entries.some((e) => e.source === source)) return;
    const id =
      "M" +
      String(
        entries.reduce((n, e) => Math.max(n, Number(e.id.slice(1))), 0) + 1,
      ).padStart(5, "0");
    const record = {
      id,
      source,
      session,
      observedAt,
      recordedAt: this.clock.iso,
      kind,
      outcome,
      action: action.slice(0, 400),
      summary: summary.slice(0, 1500),
    };
    this.vfs.write(
      MEMORY_PATH,
      entries.map((e) => JSON.stringify(e)).join("\n") +
        (entries.length ? "\n" : "") +
        JSON.stringify(record) +
        "\n",
    );
    return record;
  }
  search(query, top = 3) {
    const queryTerms = terms(query);
    for (const group of aliases)
      if (group.some((t) => query.toLowerCase().includes(t)))
        for (const t of group) queryTerms.add(t);
    return this.read()
      .map((entry) => {
        const hay = (entry.action + "\n" + entry.summary).toLowerCase();
        let score = 0;
        for (const term of queryTerms)
          if (hay.includes(term)) score += term.length > 2 ? 2 : 1;
        return { entry, score };
      })
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score || b.entry.id.localeCompare(a.entry.id))
      .slice(0, top)
      .map((r) => r.entry);
  }
  format(entries) {
    return entries.length
      ? "[长期记忆 · 历史记录；当前状态需要重新核实]\n\n" +
          entries
            .map(
              (e) =>
                `[${e.id}] ${e.kind} / ${e.outcome}\n经历时间：${e.observedAt || (e.kind === "note" ? "未记录（笔记自述）" : "未知（从仍清晰的上下文巩固）")}\n巩固时间：${e.recordedAt} / session ${e.session ?? "未知"}\n来源：${e.source}\n${e.action}\n${e.summary}`,
            )
            .join("\n\n")
      : "没有找到已巩固的相关经历。";
  }
}
