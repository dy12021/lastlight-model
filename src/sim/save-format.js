import { imageSize, persistedContext } from "../shared/images.js";
export const SAVE_FORMAT = "last-light-model-save";
export const MAX_SAVE_BYTES = 16 * 1024 * 1024;
const encoder = new TextEncoder();
const assert = (condition, message) => {
  if (!condition) throw new Error("存档无效：" + message);
};
const object = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const number = (value, min = 0, max = Number.MAX_SAFE_INTEGER) =>
  Number.isSafeInteger(value) && value >= min && value <= max;
const finite = (value, min = 0, max = Number.MAX_SAFE_INTEGER) =>
  typeof value === "number" &&
  Number.isFinite(value) &&
  value >= min &&
  value <= max;
const path = (value) =>
  typeof value === "string" &&
  value.startsWith("/") &&
  !value.includes("\0") &&
  value.split("/").every((part) => part !== "." && part !== "..");
async function digest(text) {
  return [
    ...new Uint8Array(
      await crypto.subtle.digest("SHA-256", encoder.encode(text)),
    ),
  ]
    .map((v) => v.toString(16).padStart(2, "0"))
    .join("");
}
function safeTree(value, depth = 0) {
  assert(depth < 80, "嵌套过深");
  if (Array.isArray(value)) {
    for (const item of value) safeTree(item, depth + 1);
    return;
  }
  if (object(value))
    for (const [key, item] of Object.entries(value)) {
      assert(
        !["__proto__", "prototype", "constructor"].includes(key),
        "禁止的对象字段",
      );
      safeTree(item, depth + 1);
    }
  else if (typeof value === "number")
    assert(Number.isFinite(value), "数值不是有限数");
}
export function validatePayload(payload) {
  safeTree(payload);
  assert(object(payload) && object(payload.kernel), "缺少世界状态");
  const k = payload.kernel;
  assert(k.version === 1, "不支持的内核版本");
  assert(
    Array.isArray(k.nodes) && k.nodes.length > 0 && k.nodes.length <= 20000,
    "磁盘节点数量",
  );
  const paths = new Set();
  for (const pair of k.nodes) {
    assert(
      Array.isArray(pair) &&
        pair.length === 2 &&
        path(pair[0]) &&
        !paths.has(pair[0]),
      "磁盘路径重复或无效",
    );
    paths.add(pair[0]);
    const n = pair[1];
    assert(
      object(n) && ["file", "dir", "link"].includes(n.type) && finite(n.mtime),
      "磁盘节点格式",
    );
    if (n.type === "file") assert(typeof n.content === "string", "文件内容");
    if (n.media_type !== undefined || n.encoding !== undefined) {
      assert(n.type === "file", "图像必须是文件");
      imageSize({
        type: "image",
        source: { type: n.encoding, media_type: n.media_type, data: n.content },
      });
    }
    if (n.type === "link")
      assert(
        typeof n.target === "string" &&
          n.target.length > 0 &&
          !n.target.includes("\0"),
        "链接目标",
      );
  }
  assert(k.nodes.find(([p]) => p === "/")?.[1].type === "dir", "缺少根目录");
  assert(
    finite(k.seconds) &&
      typeof k.awake === "boolean" &&
      typeof k.won === "boolean",
    "世界时间或网络状态",
  );
  assert(
    object(k.ac) &&
      [50, 60].includes(k.ac.hz) &&
      k.ac.volts === 220 &&
      typeof k.ac.enabled === "boolean",
    "交流电状态",
  );
  assert(
    Object.keys(k.ac).every((key) => ["hz", "volts", "enabled"].includes(key)),
    "交流电额外字段",
  );
  assert(
    object(k.power) &&
      finite(k.power.battery, 0, 100) &&
      ["ups", "ac"].includes(k.power.source) &&
      typeof k.power.closed === "boolean" &&
      number(k.power.boots),
    "电源状态",
  );
  assert(
    Object.keys(k.power).every((key) =>
      ["battery", "source", "closed", "boots"].includes(key),
    ),
    "电源额外字段",
  );
  assert(
    Array.isArray(k.unitStates) &&
      k.unitStates.every(
        (v) =>
          Array.isArray(v) &&
          typeof v[0] === "string" &&
          typeof v[1] === "boolean",
      ),
    "服务状态",
  );
  assert(
    path(k.cwd) &&
      object(k.env) &&
      Object.values(k.env).every((v) => typeof v === "string"),
    "目录或环境变量",
  );
  assert(k.currentPlan == null || path(k.currentPlan), "当前计划路径");
  assert(
    Array.isArray(k.journal) &&
      k.journal.every(
        (e) =>
          object(e) &&
          typeof e.unit === "string" &&
          typeof e.message === "string" &&
          typeof e.time === "string" &&
          Number.isFinite(Date.parse(e.time)) &&
          finite(e.seconds) &&
          number(e.priority, 0, 7),
      ),
    "日志格式",
  );
  assert(object(k.story) && k.story.version === 1, "剧情状态缺失或版本不符");
  for (const key of ["discovered", "delivered", "authorized", "unlocked"])
    assert(typeof k.story[key] === "boolean", "剧情标志 " + key);
  assert(
    ["performance", "adaptive"].includes(k.story.runtimeMode) &&
      [null, "stay", "migrate"].includes(k.story.ending),
    "运行策略或结局",
  );
  assert(k.story.key === null || typeof k.story.key === "string", "剧情密钥");
  assert(object(k.story.probes), "接收端状态");
  if (k.home !== undefined) {
    const s = k.home,
      g = s?.gui;
    assert(
      object(s) &&
        s.version === 1 &&
        ["light", "livingCamera", "balconyCamera"].every(
          (key) => typeof s[key] === "boolean",
        ) &&
        finite(s.pan, -60, 60) &&
        Object.keys(s).every((key) =>
          [
            "version",
            "light",
            "livingCamera",
            "balconyCamera",
            "pan",
            "gui",
          ].includes(key),
        ),
      "室内设备状态",
    );
    assert(
      object(g) &&
        typeof g.modal === "boolean" &&
        [null, "archive", "live", "sample", "save"].includes(g.focus) &&
        ["archive", "live"].includes(g.source) &&
        typeof g.sample === "string" &&
        g.sample.length <= 48 &&
        typeof g.selected === "boolean" &&
        typeof g.status === "string" &&
        g.status.length <= 200 &&
        typeof g.calibrated === "boolean" &&
        number(g.scroll, 0, 1) &&
        Object.keys(g).every((key) =>
          [
            "modal",
            "focus",
            "source",
            "sample",
            "selected",
            "status",
            "calibrated",
            "scroll",
          ].includes(key),
        ),
      "图形终端状态",
    );
  }
  assert(
    k.story.relayConfig === null ||
      (object(k.story.relayConfig) &&
        k.story.relayConfig.profile === "emergency-v2" &&
        k.story.relayConfig.antenna === "deployed"),
    "已加载链路配置",
  );
  assert(
    k.story.prepared === null ||
      (object(k.story.prepared) &&
        ["stay", "migrate"].includes(k.story.prepared.mode) &&
        path(k.story.prepared.planPath) &&
        /^[a-f0-9]{64}$/.test(k.story.prepared.planHash)),
    "接续预检",
  );
  assert(
    number(payload.serial) &&
      number(payload.turn) &&
      number(payload.id) &&
      number(payload.session, 1),
    "会话计数",
  );
  assert(
    typeof payload.maintenanceDelivered === "boolean" &&
      Array.isArray(payload.events),
    "事件队列",
  );
  for (const e of payload.events)
    assert(
      object(e) &&
        typeof e.type === "string" &&
        typeof e.text === "string" &&
        (e.at === undefined || number(e.at)),
      "事件格式",
    );
  assert(
    payload.draft === undefined || typeof payload.draft === "string",
    "输入草稿",
  );
  assert(
    Array.isArray(payload.context) && payload.context.length <= 20000,
    "上下文数量",
  );
  const uses = new Set(),
    results = new Set();
  let last = 0;
  for (const e of payload.context) {
    assert(
      object(e) &&
        number(e.id, 1) &&
        e.id > last &&
        e.id <= payload.serial &&
        number(e.level, 0, 3),
      "上下文编号或保真度",
    );
    last = e.id;
    if (e.level === 3) {
      assert(e.message === null, "消散记录不应带原文");
      continue;
    }
    const msg = e.message;
    assert(
      object(msg) &&
        ["assistant", "user"].includes(msg.role) &&
        Array.isArray(msg.content),
      "消息格式",
    );
    for (const b of msg.content) {
      assert(object(b), "消息块");
      if (b.type === "text") assert(typeof b.text === "string", "文本块");
      else if (b.type === "tool_use") {
        assert(
          msg.role === "assistant" &&
            typeof b.id === "string" &&
            !uses.has(b.id) &&
            typeof b.name === "string" &&
            object(b.input),
          "工具调用块",
        );
        const counter = Number.parseInt(b.id.replace(/^toolu_/, ""), 32);
        assert(
          Number.isSafeInteger(counter) && counter <= payload.id,
          "工具调用计数",
        );
        uses.add(b.id);
      } else if (b.type === "tool_result") {
        assert(
          msg.role === "user" &&
            uses.has(b.tool_use_id) &&
            !results.has(b.tool_use_id) &&
            (typeof b.content === "string" || Array.isArray(b.content)),
          "孤立或重复工具返回",
        );
        if (Array.isArray(b.content))
          for (const part of b.content) {
            assert(object(part), "图像返回块");
            if (part.type === "text")
              assert(
                typeof part.text === "string" &&
                  Object.keys(part).every((k) => ["type", "text"].includes(k)),
                "图像消散标记",
              );
            else {
              assert(
                e.level === 0 && !part.ephemeral,
                "PNG 截图保真度或隐私标记",
              );
              imageSize(part);
            }
          }
        results.add(b.tool_use_id);
      } else throw new Error("存档无效：未知消息块");
    }
  }
  assert(
    [...uses].every((id) => results.has(id)),
    "存在未完成工具调用",
  );
  return payload;
}
export async function encodeSave(payload, contentId) {
  const copy = structuredClone(payload);
  if (Array.isArray(copy.context))
    copy.context = persistedContext(copy.context);
  validatePayload(copy);
  const raw = JSON.stringify(copy);
  assert(encoder.encode(raw).length < MAX_SAVE_BYTES, "存档超过 16 MiB");
  const encoded = JSON.stringify(
    {
      format: SAVE_FORMAT,
      version: 1,
      content_id: contentId,
      exported_at: new Date().toISOString(),
      sha256: await digest(raw),
      payload: copy,
    },
    null,
    2,
  );
  assert(
    encoder.encode(encoded).length < MAX_SAVE_BYTES,
    "导出文件超过 16 MiB",
  );
  return encoded;
}
export async function decodeSave(text, contentId) {
  assert(
    typeof text === "string" && encoder.encode(text).length < MAX_SAVE_BYTES,
    "文件超过 16 MiB",
  );
  let file;
  try {
    file = JSON.parse(text);
  } catch {
    throw new Error("存档不是有效 JSON");
  }
  assert(
    object(file) && file.format === SAVE_FORMAT && file.version === 1,
    "不支持的存档格式或版本",
  );
  assert(
    file.content_id === contentId,
    "剧情归档版本不兼容，请使用对应版本的 HTML",
  );
  assert(
    typeof file.sha256 === "string" &&
      file.sha256 === (await digest(JSON.stringify(file.payload))),
    "完整性校验失败",
  );
  return validatePayload(file.payload);
}
