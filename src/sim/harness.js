import { parse } from "./parse.js";
import { validate } from "./schema.js";
import { registry, tools } from "./registry.js";
import { Context } from "./context.js";
import { persistedContext, persistedImageContent } from "../shared/images.js";
export class Harness {
  constructor({
    system,
    handlers,
    advance = () => [],
    window,
    remember = () => {},
    now = () => null,
    renderImage = () => {
      throw new Error("Image renderer unavailable");
    },
    saveImage = () => {
      throw new Error("Image storage unavailable");
    },
  }) {
    this.context = new Context(system, tools, window);
    this.handlers = handlers;
    this.advance = advance;
    this.turn = 0;
    this.id = 0;
    this.errors = 0;
    this.remember = remember;
    this.now = now;
    this.session = 1;
    this.renderImage = renderImage;
    this.saveImage = saveImage;
  }
  consolidate(entries = this.context.entries) {
    const warnings = [];
    const uses = new Map();
    const persist = (experience) => {
      try {
        this.remember(experience);
      } catch (e) {
        warnings.push({
          type: "memory_warning",
          text: "长期记忆未写入：" + e.message,
        });
      }
    };
    for (const entry of entries) {
      if (entry.level !== 0 || !entry.message) continue;
      for (const block of entry.message.content) {
        if (block.type === "tool_use")
          uses.set(block.id, {
            call: block,
            observedAt: entry.observedAt ?? null,
            session: entry.session ?? 1,
          });
        else if (entry.message.role === "user" && block.type === "text")
          persist({
            source: "request:" + entry.id,
            text: block.text,
            request: true,
            observedAt: entry.observedAt ?? null,
            session: entry.session ?? 1,
          });
        else if (entry.message.role === "assistant" && block.type === "text")
          persist({
            source: "thought:" + entry.id,
            text: block.text,
            observedAt: entry.observedAt ?? null,
            session: entry.session ?? 1,
          });
        else if (block.type === "tool_result" && uses.has(block.tool_use_id))
          persist({
            ...uses.get(block.tool_use_id),
            source: block.tool_use_id,
            result: block,
          });
      }
    }
    return warnings;
  }
  restartContext() {
    const warnings = this.consolidate();
    if (warnings.length) return { ok: false, warnings };
    this.context.clear();
    this.turn = 0;
    this.session++;
    return { ok: true, warnings: [] };
  }
  async run(source) {
    let parsed;
    try {
      parsed = parse(source);
    } catch (e) {
      this.errors++;
      return { error: e.message };
    }
    this.turn++;
    const blocks = parsed.text ? [{ type: "text", text: parsed.text }] : [];
    const uses = parsed.calls.map((call) => ({
      type: "tool_use",
      id: "toolu_" + (++this.id).toString(32).padStart(24, "0"),
      ...call,
    }));
    blocks.push(...uses);
    this.context.append(
      {
        role: "assistant",
        content: blocks,
        stop_reason: uses.length ? "tool_use" : "end_turn",
      },
      uses
        .map((c) => `${c.name}(${Object.values(c.input)[0] ?? ""})`)
        .join(", ") || "独白",
    );
    const assistantEntry = this.context.entries.at(-1);
    assistantEntry.observedAt = this.now();
    assistantEntry.session = this.session;
    const results = [],
      effects = [];
    let seconds = uses.length ? 0 : 3;
    // A batch is deterministic and shares one snapshot timeline; side effects use input order.
    for (const use of uses) {
      let content,
        is_error = false;
      try {
        const spec = registry.find((t) => t.name === use.name);
        if (!spec)
          throw new Error(
            `tool "${use.name}" not found; available: ${registry.map((tool) => tool.name).join(", ")}`,
          );
        const input = validate(spec.input_schema, use.input);
        const result = await this.handlers[spec.handler](input);
        is_error = result.is_error === true;
        content = result.image
          ? [await this.renderImage(result.image)]
          : typeof result === "string"
            ? result
            : result.content;
        if (result.savePath) await this.saveImage(result.savePath, content[0]);
        seconds += result.seconds ?? 0;
        if (result.effects?.includes("forget-camera")) {
          this.context.entries = persistedContext(this.context.entries);
          for (const previous of results)
            previous.content = persistedImageContent(previous.content);
        }
        effects.push(...(result.effects || []));
      } catch (e) {
        content = e.message;
        if (["computer_use", "camera"].includes(use.name)) {
          try {
            content = [
              await this.renderImage({ kind: "error", message: e.message }),
            ];
          } catch {
            /* An unavailable renderer must still produce a paired error result. */
          }
        }
        is_error = true;
        seconds += 3;
      }
      if (!Array.isArray(content)) content = String(content ?? "");
      if (typeof content === "string" && content.length > 20000)
        content = content.slice(0, 19950) + "\n[输出已截断：上限 20000 字符]";
      results.push({
        type: "tool_result",
        tool_use_id: use.id,
        content,
        ...(is_error ? { is_error: true } : {}),
      });
    }
    if (results.length)
      this.context.append(
        { role: "user", content: results },
        uses
          .map((c) => `${c.name}(${Object.values(c.input)[0] ?? ""})`)
          .join(", "),
      );
    const memoryEvents = this.consolidate(
      this.context.entries.filter((entry) => entry.id >= assistantEntry.id),
    );
    const events = [...memoryEvents, ...(this.advance(seconds) || [])];
    if (events.some((e) => e.type === "reboot")) this.context.clear();
    const faded = this.context.fade();
    return { results, events, faded, seconds, effects };
  }
}
