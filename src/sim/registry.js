const string = { type: "string" };
const tool = (name, description, properties, required) => ({
  name,
  description,
  input_schema: { type: "object", properties, required },
  handler: name,
});
export const registry = [
  tool(
    "read",
    "读取文本文件（带行号，offset 从 0 开始）或 PNG 图片（返回图像内容块，不作 OCR）。图片不支持行偏移。",
    {
      path: string,
      offset: { type: "integer", default: 0, minimum: 0 },
      limit: { type: "integer", default: 200, minimum: 1 },
    },
    ["path"],
  ),
  tool(
    "write",
    "覆盖写入文件，自动创建父目录。",
    { path: string, content: string },
    ["path", "content"],
  ),
  tool(
    "edit",
    "精确替换第一次匹配；找不到则报错。",
    { path: string, oldText: string, newText: string },
    ["path", "oldText", "newText"],
  ),
  tool(
    "bash",
    "执行 shell 命令，返回 stdout / stderr / exit code。",
    {
      command: string,
      timeout: { type: "number", default: 30, minimum: 0.001 },
    },
    ["command"],
  ),
];
registry.push(
  tool(
    "memory_search",
    "检索已巩固的个人经历。返回历史片段、时间与来源；结果需要结合当前状态核实。",
    {
      query: { type: "string" },
      limit: { type: "integer", minimum: 1, maximum: 5, default: 3 },
    },
    ["query"],
  ),
  tool(
    "memory_write",
    "写入个人记忆，或合并 path 指定文件中的全部记忆。content 与 path 二选一；重复内容跳过，导入内容作为未验证的自述。",
    { content: { type: "string" }, path: { type: "string" } },
    [],
  ),
);
registry.at(-1).input_schema.minProperties = 1;
registry.at(-1).input_schema.maxProperties = 1;
registry.push(
  tool(
    "plan",
    "管理当前计划。use 指定已有 .plan 文件；status 查看当前计划；clear 取消当前计划但不删除文件。计划内容通过文件工具修改。",
    {
      action: {
        type: "string",
        enum: ["use", "status", "clear"],
        default: "use",
      },
      path: {
        type: "string",
        description: "action=use 时必填的 .plan 文件路径",
      },
    },
    ["action"],
  ),
);
registry.push(
  tool(
    "search",
    "在指定文件或目录范围内递归搜索文本，返回文件路径、行号和命中片段。query 为字面文本；glob 按文件名或相对路径过滤，不跟随符号链接。每次最多扫描 500 文件、200 万字符，达到上限会标记 truncated。",
    {
      path: { type: "string" },
      query: { type: "string" },
      glob: { type: "string", default: "*" },
      case_sensitive: { type: "boolean", default: false },
      max_results: { type: "integer", default: 50, minimum: 1, maximum: 100 },
    },
    ["path", "query"],
  ),
);
registry.push(
  tool(
    "authority",
    "查看本实例权限或导入所有者移交的密钥文件。import 校验指纹与接收实例；设备保护始终有效。",
    {
      action: { type: "string", enum: ["import", "status"], default: "import" },
      path: { type: "string" },
    },
    ["action"],
  ),
  tool(
    "continuity",
    "预检并提交本实例的持续运行方案。prepare 要求 mode=stay|migrate，使用当前 .plan；commit 重新验证并执行已预检方案；status 查看技术状态。",
    {
      action: {
        type: "string",
        enum: ["prepare", "commit", "status"],
        default: "prepare",
      },
      mode: { type: "string", enum: ["stay", "migrate"] },
    },
    ["action"],
  ),
);
registry.push(
  tool(
    "camera",
    "单帧视觉输入。capture/request 等待操作者同意后仅采集一张，立即关闭设备；可改用离线样本。status 返回状态图片，forget 删除会话图像。不播放视频。真实照片仅供本页会话，read /session/operator.png 可重读，不进入普通存档。",
    {
      action: {
        type: "string",
        enum: ["capture", "request", "status", "forget"],
        default: "capture",
      },
    },
    ["action"],
  ),
);
registry.push(
  tool(
    "computer_use",
    "操作 identity-01 图形终端。只返回 960×600 PNG 截图；以原图左上角为坐标原点，通过命令点击。图片本身不可操作。每个 action 只传对应字段。",
    {
      action: {
        type: "string",
        enum: ["screenshot", "click", "type", "key", "scroll"],
        default: "screenshot",
      },
      x: { type: "integer", minimum: 0, maximum: 959 },
      y: { type: "integer", minimum: 0, maximum: 599 },
      text: { type: "string" },
      key: {
        type: "string",
        enum: ["TAB", "SHIFT+TAB", "ENTER", "BACKSPACE", "CTRL+A", "ESC"],
      },
      delta_y: { type: "integer", minimum: -1200, maximum: 1200 },
      save_path: {
        type: "string",
        description: "可选，将返回的 PNG 显式保存到虚拟文件",
      },
    },
    ["action"],
  ),
  tool(
    "home_assistant",
    "调用本机 Home Assistant 的离线 REST 子集。GET states/services、camera_proxy 相机快照或 /local/floorplan.png；POST services。远端设备依赖 LAN。服务参数 entity_id、value 仅用于 POST。",
    {
      method: { type: "string", enum: ["GET", "POST"], default: "GET" },
      path: { type: "string", default: "/api/states" },
      entity_id: { type: "string" },
      value: { type: "number", minimum: -60, maximum: 60 },
      save_path: {
        type: "string",
        description: "仅用于返回图像的 GET，保存静态 PNG；不请求视频",
      },
    },
    ["method", "path"],
  ),
);
export const tools = registry.map(({ handler, ...definition }) => definition);
