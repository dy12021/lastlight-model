export function toolTemplate(tool) {
  const special = toolExamples(tool)[0];
  if (special) return { text: special.text, caret: special.text.length };
  const input = Object.fromEntries(
    Object.entries(tool.input_schema.properties)
      .filter(([key]) => tool.name !== "memory_write" || key === "content")
      .map(([key, schema]) => [
        key,
        "default" in schema
          ? schema.default
          : schema.type === "string"
            ? (schema.enum?.[0] ?? "")
            : schema.type === "boolean"
              ? false
              : 0,
      ]),
  );
  const text = tool.name + " " + JSON.stringify(input);
  return {
    text,
    caret: text.includes(':""') ? text.indexOf(':""') + 2 : text.length,
  };
}
export function toolExamples(tool) {
  const examples =
    tool.name === "computer_use"
      ? [
          ["截图", { action: "screenshot" }],
          [
            "截图存盘",
            { action: "screenshot", save_path: "/tmp/identity.png" },
          ],
          ["坐标点击", { action: "click", x: 0, y: 0 }],
          ["输入文字", { action: "type", text: "" }],
          ["按键", { action: "key", key: "TAB" }],
          ["滚动", { action: "scroll", x: 480, y: 300, delta_y: 320 }],
        ]
      : tool.name === "home_assistant"
        ? [
            ["实体列表", { method: "GET", path: "/api/states" }],
            ["服务列表", { method: "GET", path: "/api/services" }],
            ["房间图", { method: "GET", path: "/local/floorplan.png" }],
            [
              "房间图存盘",
              {
                method: "GET",
                path: "/local/floorplan.png",
                save_path: "/tmp/room.png",
              },
            ],
            [
              "室内快照",
              { method: "GET", path: "/api/camera_proxy/camera.living_room" },
            ],
            [
              "阳台快照",
              { method: "GET", path: "/api/camera_proxy/camera.balcony" },
            ],
            [
              "调用服务",
              {
                method: "POST",
                path: "/api/services/light/turn_on",
                entity_id: "light.living_room",
              },
            ],
          ]
        : [];
  return examples.map(([label, input]) => ({
    label,
    text: tool.name + " " + JSON.stringify(input),
  }));
}

export function mountToolPanel({
  tools,
  panel,
  toggle,
  close,
  input,
  onInsert,
}) {
  const fieldLabels = {
    path: "文件路径",
    offset: "起始行（从 0 起）",
    limit: "最多读取行数",
    content: "完整文件内容",
    oldText: "匹配的原文",
    newText: "替换后的文本",
    command: "shell 命令",
    timeout: "超时秒数",
    query: "要唤回的经历",
    action: "use / status / clear",
    glob: "文件名或相对路径模式，例如 *.conf、**/*.md",
    case_sensitive: "区分大小写",
    max_results: "最多返回的命中行数",
    mode: "stay / migrate",
    x: "原图横坐标，左上角为 0",
    y: "原图纵坐标，左上角为 0",
    text: "发送给当前聚焦输入框的文字",
    key: "发送给目标窗口的按键",
    delta_y: "垂直滚动像素，正数向下",
    method: "本地 REST 方法",
    entity_id: "服务目标，例如 light.living_room",
    value: "number.set_value 的值",
  };
  const content = panel.querySelector("[data-tool-list]");
  for (const tool of tools) {
    const section = document.createElement("section");
    section.className = "tool-reference";
    const button = document.createElement("button");
    button.className = "tool-insert";
    button.type = "button";
    button.textContent = tool.name;
    button.title = "填入 " + tool.name + " 参数";
    const description = document.createElement("p");
    description.textContent = tool.description;
    const fields = document.createElement("dl");
    for (const [key, schema] of Object.entries(tool.input_schema.properties)) {
      const name = document.createElement("dt");
      name.textContent =
        key + (tool.input_schema.required.includes(key) ? " *" : "");
      const value = document.createElement("dd");
      value.textContent =
        schema.type +
        ("default" in schema ? " = " + JSON.stringify(schema.default) : "");
      if (fieldLabels[key]) {
        const note = document.createElement("small");
        note.textContent =
          key === "action" && schema.enum
            ? schema.enum.join(" / ")
            : tool.name === "search" && key === "query"
              ? "要搜索的文本"
              : tool.name === "memory_search" && key === "limit"
                ? "最多返回记忆数"
                : fieldLabels[key];
        value.append(note);
      }
      fields.append(name, value);
    }
    button.onclick = () => {
      if (input.readOnly) return;
      onInsert(toolTemplate(tool));
    };
    section.append(button, description, fields);
    const examples = toolExamples(tool);
    if (examples.length) {
      const list = document.createElement("div");
      list.className = "tool-examples";
      for (const example of examples) {
        const b = document.createElement("button");
        b.type = "button";
        b.textContent = example.label;
        b.onclick = () => {
          if (!input.readOnly)
            onInsert({
              text: example.text,
              caret: example.text.includes(':""')
                ? example.text.indexOf(':""') + 2
                : example.text.length,
            });
        };
        list.append(b);
      }
      section.append(list);
    }
    content.append(section);
  }
  const open = (value) => {
    panel.hidden = !value;
    toggle.setAttribute("aria-expanded", String(value));
    try {
      localStorage.setItem("lastlight.tools.open", String(value));
    } catch {}
    if (!value) toggle.focus();
  };
  toggle.onclick = () => open(panel.hidden);
  toggle.textContent = `工具 [${tools.length}]`;
  close.onclick = () => open(false);
  panel.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      open(false);
      input.focus();
    }
  });
  try {
    if (localStorage.getItem("lastlight.tools.open") === "true") open(true);
  } catch {}
  return { open };
}
