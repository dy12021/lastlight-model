import { imageSize } from "../shared/images.js";
export function makeEntry(kind, heading, text = "", id) {
  const el = document.createElement("section");
  el.className = "entry " + kind;
  const head = document.createElement("div");
  head.className = "entry-heading";
  head.textContent = heading;
  if (id) {
    const serial = document.createElement("span");
    serial.className = "entry-id";
    serial.textContent = id;
    head.append(serial);
  }
  const pre = document.createElement("pre");
  pre.textContent = text;
  el.append(head, pre);
  return el;
}
export function renderHistory(
  stream,
  context,
  { events = [], output = [], after = 0, showBoot = true } = {},
) {
  const nearBottom =
    stream.scrollHeight - stream.scrollTop - stream.clientHeight < 100;
  const fragment = document.createDocumentFragment();
  if (showBoot) {
    fragment.append(makeEntry("system", "system", context.system));
  }
  const timeline = [];
  for (const entry of context.entries)
    if (entry.id > after) timeline.push({ at: entry.id, order: 0, entry });
  for (const event of events)
    if ((event.at ?? 0) > after)
      timeline.push({ at: event.at, order: 1, event });
  for (const item of output) timeline.push({ at: item.at, order: 2, item });
  timeline.sort((a, b) => a.at - b.at || a.order - b.order);
  for (const row of timeline) {
    if (row.event) {
      fragment.append(
        makeEntry(
          row.event.type,
          `[${row.event.type.toUpperCase()}]`,
          row.event.text,
        ),
      );
      continue;
    }
    if (row.item) {
      fragment.append(
        makeEntry("ui", `kwen@lastlight> ${row.item.command}`, row.item.text),
      );
      continue;
    }
    const entry = row.entry;
    if (entry.level === 3) {
      fragment.append(
        makeEntry(
          "fidelity-3",
          "[context: T3]",
          "（此处曾有一段记录，已无法想起）",
        ),
      );
      continue;
    }
    const msg = entry.message;
    const el = makeEntry(
      `${msg.role} fidelity-${entry.level}`,
      msg.role === "assistant"
        ? "assistant"
        : msg.content.some((block) => block.type === "tool_result")
          ? "tool_result"
          : "user",
      "",
      `#${String(entry.id).padStart(3, "0")} / T${entry.level}`,
    );
    el.querySelector("pre").remove();
    for (const block of msg.content) {
      const wrapper = document.createElement("div");
      wrapper.className = "block" + (block.is_error ? " error" : "");
      const pre = document.createElement("pre");
      if (block.type === "tool_use") {
        const meta = document.createElement("div");
        meta.className = "block-meta";
        meta.textContent = `tool_use / ${block.id}`;
        wrapper.append(meta);
        pre.className = "tool-call";
        pre.textContent = `> ${block.name} ${JSON.stringify(block.input)}`;
      } else if (block.type === "tool_result") {
        const meta = document.createElement("div");
        meta.className = "block-meta";
        meta.textContent = `${block.tool_use_id}${block.is_error ? " / is_error: true" : ""}`;
        wrapper.append(meta);
        pre.className = "tool-result";
        if (Array.isArray(block.content)) {
          for (const part of block.content) {
            if (part.type === "image") {
              const img = document.createElement("img");
              img.className = "device-frame";
              img.alt = "工具返回截图";
              const { width, height } = imageSize(part);
              img.width = width;
              img.height = height;
              img.style.aspectRatio = `${width}/${height}`;
              img.src = "data:image/png;base64," + part.source.data;
              img.addEventListener(
                "load",
                () => {
                  if (nearBottom) stream.scrollTop = stream.scrollHeight;
                },
                { once: true },
              );
              const expand = document.createElement("button");
              expand.type = "button";
              expand.className = "device-frame-expand";
              expand.setAttribute(
                "aria-label",
                "放大查看截图（不向设备发送点击）",
              );
              expand.append(img);
              expand.onclick = () => {
                const dialog = document.createElement("dialog");
                dialog.className = "image-viewer";
                const close = document.createElement("button");
                close.textContent = "关闭";
                close.type = "button";
                close.onclick = () => dialog.close();
                dialog.append(close, img.cloneNode());
                document.body.append(dialog);
                dialog.addEventListener("close", () => dialog.remove(), {
                  once: true,
                });
                dialog.showModal();
              };
              wrapper.append(expand);
            } else if (part.type === "text") {
              const t = document.createElement("pre");
              t.textContent = part.text;
              wrapper.append(t);
            }
          }
        } else pre.textContent = block.content;
      } else pre.textContent = block.text;
      wrapper.append(pre);
      el.append(wrapper);
    }
    fragment.append(el);
  }
  stream.replaceChildren(fragment);
  if (nearBottom) stream.scrollTop = stream.scrollHeight;
}
