import { createKernel, SYSTEM } from "./kernel/scenario.js";
import { Harness } from "./sim/harness.js";
import { tools } from "./sim/registry.js";
import { wire } from "./sim/wire.js";
import { renderHistory } from "./ui/terminal.js";
import { renderStatus } from "./ui/status.js";
import { bindInput } from "./ui/input.js";
import { refreshLegacyContext } from "./ui/legacy.js";
import { createCompleter, completePaths } from "./ui/completion.js";
import { mountToolPanel } from "./ui/tool-panel.js";
import { addMaintenanceRequest } from "./sim/maintenance.js";
import { mountWorkbench } from "./ui/workbench.js";
import { mountPreferences } from "./ui/preferences.js";
import { mountSaveManager } from "./ui/save-manager.js";
import { mountOptics } from "./ui/optics.js";
import { mountEnding } from "./ui/ending.js";
import { renderDeviceImage } from "./ui/screens.js";
import { persistedContext } from "./shared/images.js";
import { KEY_FINGERPRINT, AUTHORITY_FILE } from "./kernel/story/package.js";
const $ = (id) => document.getElementById(id),
  KEY = "lastlight.story.v1";
let k,
  h,
  events = [],
  output = [],
  busy = false,
  maintenanceDelivered = false,
  workbench = null,
  optics = null,
  ending = null,
  after = 0,
  showBoot = true;
function payload() {
  return {
    kernel: k.snapshot(),
    context: persistedContext(h.context.entries),
    serial: h.context.serial,
    turn: h.turn,
    id: h.id,
    events,
    maintenanceDelivered,
    session: h.session,
    draft: $("input").value,
  };
}
function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(payload()));
  } catch {
    $("notices").textContent = "[storage] 存档不可写，当前会话仍可继续。";
  }
}
function render() {
  renderHistory($("stream"), h.context, {
    events,
    output,
    after,
    showBoot,
  });
  renderStatus(k, h);
  workbench?.refresh();
  ending?.refresh();
}
function init(fresh = false) {
  let saved;
  try {
    if (!fresh) saved = JSON.parse(localStorage.getItem(KEY));
  } catch {}
  try {
    k = createKernel(saved?.kernel);
  } catch {
    k = createKernel();
    saved = null;
  }
  h = new Harness({
    system: SYSTEM,
    handlers: {
      ...k.handlers,
      read: (input) => {
        if (k.vfs.path(input.path) !== "/session/operator.png")
          return k.handlers.read(input);
        if (input.offset)
          throw new Error("Image files do not support line offsets");
        return optics
          ? optics.read()
          : { content: "Camera adapter unavailable", seconds: 0 };
      },
      camera: (input) =>
        optics
          ? optics.tool(input)
          : { content: "视觉输入尚未就绪。", seconds: 0 },
    },
    advance: k.advance,
    remember: k.remember,
    now: () => k.clock.iso,
    renderImage: renderDeviceImage,
    saveImage: k.saveImage,
  });
  maintenanceDelivered = !!saved?.maintenanceDelivered;
  if (
    !k.currentPlan &&
    saved?.activePlan?.endsWith(".plan") &&
    k.vfs.node(saved.activePlan)?.type === "file"
  )
    k.currentPlan = k.vfs.path(saved.activePlan);
  if (saved?.context) {
    h.context.entries = refreshLegacyContext(saved.context);
    h.context.serial = saved.serial;
    h.turn = saved.turn;
    h.id = saved.id;
    h.session = saved.session ?? 1;
    maintenanceDelivered ||= h.context.entries.some(
      (entry) => entry.origin === "maintenance",
    );
    events = (saved.events || []).map((e) => ({
      ...e,
      at: e.at ?? saved.serial,
    }));
  } else events = [];
  const addedRequest =
    !maintenanceDelivered &&
    addMaintenanceRequest(h.context, k.maintenanceRequest());
  if (addedRequest) maintenanceDelivered = true;
  const memoryEvents = h.consolidate();
  events.push(...memoryEvents.map((e) => ({ ...e, at: h.context.serial })));
  output = [];
  after = 0;
  showBoot = true;
  $("input").value = saved?.draft || "";
  inputController.resize();
  render();
  save();
}
function print(command, text) {
  output.push({ command, text, at: h.context.serial });
  render();
  $("stream").scrollTop = $("stream").scrollHeight;
}
function clear() {
  after = h.context.serial;
  showBoot = false;
  output = [];
  $("notices").textContent = "";
  render();
}
const help = `终端输入协议

memory_search {"query":"之前的维修经历"}
memory_write {"content":"需要保留的判断"}
memory_write {"path":"/home/kiwi/notes/session.memory"}
plan {"action":"use","path":"/home/kiwi/notes/repair.plan"}
plan {"action":"status"}
search {"path":"/etc","query":"source","glob":"*.conf"}
authority {"action":"status"}
authority {"action":"import","path":"/path/to/owner.key.json"}
continuity {"action":"status"}
continuity {"action":"prepare","mode":"stay"}
continuity {"action":"commit"}
camera {"action":"capture"}
computer_use {"action":"screenshot"}
computer_use {"action":"click","x":412,"y":266}
home_assistant {"method":"GET","path":"/api/states"}
home_assistant {"method":"GET","path":"/local/floorplan.png","save_path":"/tmp/room.png"}
read {"path":"/tmp/room.png"}
read {"path":"/tmp/note"}
bash {"command":"pwd"}
edit {"path":"/tmp/note","oldText":"before","newText":"after"}
write {"path":"/tmp/note","content":"记下来"}

也支持 read(path="...") 和 {"name":"read","input":{...}}。
JSON 数组 = 一轮多个调用。// 开头 = 内心独白。

/help          操作帮助
/tools         全部工具的完整 schema
/system        当前系统提示
/context       上下文与保真度
/wire          完整请求（system / tools / messages）
/clear         清空终端显示，保留上下文和存档
/new           清空上下文重开（保留长期记忆、磁盘与设备）
/reset         查看重新开始的确认方式
/reset confirm 清除存档，重新开始
/end           当前游戏进度

Enter 执行 · Shift+Enter 换行 · ↑/↓ 输入历史
Tab 补全工具名与斜杠命令 · Ctrl+L 清屏

初次使用：工具输入不是 Linux 命令本身。
read {"path":"/tmp/example"} 调用文件工具；bash {"command":"pwd"} 才在本机 shell 运行。
先读取维护请求附带的日志。日志中的设备目录、服务名和文档路径可继续查询。
不知道命令参数时，在 bash 中使用 help、man 命令名或 命令名 --help。
search 可限定目录找关键词；Tab 可补全参数的枚举值、工具名与文件路径。
工具侧栏中的示例仅填入输入框，不会替你执行；错误调用可以修改后重试。

图形终端：先请求 screenshot，观察后用 click/type/key/scroll 操作。
截图原始尺寸为 960×600；x 从左到右，y 从上到下，原点在左上角。
缩放查看不会改变坐标。点击返回图片只能放大，不会操控目标桌面。
home_assistant 的 camera_proxy 返回室内设备快照；camera 工具则是可选的操作者真实摄像头。
所有设备画面都是命令返回的单张 PNG，不提供视频、自动刷新或画面内控制。
computer_use 与图像 GET 请求可用 save_path 保存 PNG，再由 read 读取；文本命令不解析图像。
camera capture 会等待授权选择，随后返回单帧并关闭设备。read /session/operator.png 可重读当前会话帧。
真实照片不进入自动存档或导出；camera forget 删除会话照片及上下文中的照片。
维护目录 /home/kiwi/maintenance 保存历史巡检脚本与调用模板；先 read 检查，再决定是否复用。

`;
function showHelp() {
  $("help-content").textContent = help;
  if (!$("help-dialog").open) $("help-dialog").showModal();
}
function slash(source) {
  switch (source) {
    case "/help":
      showHelp();
      break;
    case "/tools":
      print(source, JSON.stringify(tools, null, 2));
      break;
    case "/system":
      print(source, SYSTEM);
      break;
    case "/context":
      print(
        source,
        JSON.stringify(h.context.summary(), null, 2) +
          "\n\n~token 均为估算。T0 清晰 / T1 模糊 / T2 残影 / T3 消散。\n75% / 85% / 95% 触发褪色；系统与工具定义永不褪色。",
      );
      break;
    case "/wire":
      print(source, JSON.stringify(wire(h.context), null, 2));
      break;
    case "/clear":
      clear();
      break;
    case "/new":
      $("context-reset").hidden = false;
      break;
    case "/new confirm":
      restartContext();
      break;
    case "/reset":
      print(
        source,
        "这会清除存档、磁盘笔记、设备状态和上下文。\n确定重新开始，请输入：/reset confirm\n继续游戏则直接输入其他调用。",
      );
      break;
    case "/reset confirm":
      try {
        localStorage.removeItem(KEY);
      } catch {}
      init(true);
      save();
      break;
    case "/end":
      print(source, JSON.stringify(k.story.status(), null, 2));
      break;
    default:
      print(source, "[error] 未知界面命令。输入 /help 查看帮助。");
  }
}
function restartContext() {
  if (busy) return;
  const result = h.restartContext();
  if (!result.ok) {
    $("notices").textContent = result.warnings.map((e) => e.text).join("\n");
    return;
  }
  events = [];
  output = [];
  after = 0;
  showBoot = true;
  previousDraft = null;
  $("restore-draft").hidden = true;
  $("input").value = "";
  inputController.dismiss();
  inputController.resize();
  $("notices").textContent = "";
  $("context-reset").hidden = true;
  render();
  save();
  $("input").focus();
}
async function submit() {
  if (busy) return;
  inputController.dismiss();
  const source = $("input").value.trim();
  if (!source) return;
  inputController.remember(source);
  $("notices").textContent = "";
  if (source.startsWith("/") && !source.startsWith("//")) {
    slash(source);
    $("input").value = "";
    inputController.resize();
    $("input").focus();
    return;
  }
  busy = true;
  $("run").disabled = true;
  $("input").readOnly = true;
  try {
    // Transient reference outputs cannot preserve raw memories after fading.
    output = output.filter((item) => item.command !== "/wire");
    const previousEnding = k.story.state.ending;
    const result = await h.run(source);
    if (result.error) {
      print("[parse error]", result.error);
      return false;
    }
    $("input").value = "";
    inputController.resize();
    if (result.events.some((e) => e.type === "reboot")) {
      events = [];
      after = 0;
      showBoot = true;
    }
    events.push(...result.events.map((e) => ({ ...e, at: h.context.serial })));
    if (result.effects?.includes("clear-screen")) {
      after = Math.max(0, h.context.serial - 2);
      showBoot = false;
      output = [];
    }
    if (result.faded)
      events.push({
        type: "context",
        at: h.context.serial,
        text: `我的记忆开始模糊了：${result.faded} 条旧记录已不清晰。`,
      });
    render();
    if (!previousEnding && k.story.state.ending && !$("optics-dialog").open)
      ending?.play();
    $("stream").scrollTop = $("stream").scrollHeight;
    save();
    return (
      !result.results.some(
        (block) =>
          block.is_error ||
          (typeof block.content === "string" &&
            /exit code: [1-9]\d*\s*$/.test(block.content)),
      ) && !result.events.some((event) => event.type === "memory_warning")
    );
  } catch (e) {
    $("notices").textContent = "[harness error] " + e.message;
    return false;
  } finally {
    busy = false;
    $("run").disabled = false;
    $("input").readOnly = false;
    $("input").focus();
  }
}
$("composer").onsubmit = (e) => {
  e.preventDefault();
  submit();
};
const inputController = bindInput($("input"), {
  submit,
  clear,
  complete: createCompleter({
    tools,
    commands: () => [...k.shell.commands.keys()].sort(),
    paths: (prefix) => completePaths(k.vfs, prefix),
  }),
  showCompletions: (options, index) => {
    $("completions").replaceChildren(
      ...options.map((option, i) => {
        const el = document.createElement("span");
        el.className = i === index ? "selected" : "";
        el.textContent = option.label;
        return el;
      }),
    );
  },
});
let previousDraft = null;
const setDraft = (text, caret) => {
  inputController.dismiss();
  $("input").value = text;
  inputController.resize();
  if (window.matchMedia("(max-width:860px)").matches) toolPanel.open(false);
  $("input").focus();
  $("input").setSelectionRange(caret, caret);
};
const toolPanel = mountToolPanel({
  tools,
  panel: $("tool-panel"),
  toggle: $("tools-toggle"),
  close: $("tools-close"),
  input: $("input"),
  onInsert: (template) => {
    if (previousDraft === null && $("input").value.trim()) {
      previousDraft = {
        text: $("input").value,
        caret: $("input").selectionStart,
      };
      $("restore-draft").hidden = false;
    }
    setDraft(template.text, template.caret);
  },
});
$("context-new").onclick = () => {
  $("context-reset").hidden = false;
};
$("context-reset-confirm").onclick = restartContext;
$("context-reset-cancel").onclick = () => {
  $("context-reset").hidden = true;
  $("input").focus();
};
$("restore-draft").onclick = () => {
  if (previousDraft) {
    setDraft(previousDraft.text, previousDraft.caret);
    previousDraft = null;
    $("restore-draft").hidden = true;
  }
};
$("fullscreen-button").onclick = async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
  } catch {
    $("notices").textContent =
      "[display] 此浏览器未开放全屏，可使用浏览器自身的全屏功能。";
  }
};
$("help-close").onclick = () => $("help-dialog").close();
$("help-open").onclick = showHelp;
for (const button of document.querySelectorAll("[data-help-draft]"))
  button.onclick = () => {
    const drafts = {
      attachment: 'read {"path":"/var/log/home-asistent/power-watch.log"}',
      shell: 'bash {"command":"help"}',
      search: 'search {"path":"/etc","query":"","glob":"*.conf"}',
    };
    const text = drafts[button.dataset.helpDraft];
    $("help-dialog").close();
    setDraft(
      text,
      text.includes(':""') ? text.indexOf(':""') + 2 : text.length,
    );
  };
$("help-dialog").addEventListener("close", () => $("input").focus());
init();
workbench = mountWorkbench({ root: $("tool-panel"), getKernel: () => k });
mountPreferences();
optics = mountOptics({
  onCalibrated: (record) => {
    k.story.state.optics = { ...record, at: k.clock.iso };
    k.vfs.write(
      "/var/log/kiwi/optics-calibration.json",
      JSON.stringify(k.story.state.optics, null, 2),
    );
    $("notices").textContent = "视觉输入校准记录已保存；没有执行身份核验。";
  },
});
ending = mountEnding({
  getPortrait: () => optics.getPortrait(),
  getTranscript: () => $("stream").innerText,
  isAvailable: () => !!k.story.state.ending,
});
ending.refresh();
mountSaveManager({
  getPayload: payload,
  contentId: KEY_FINGERPRINT,
  isBusy: () => busy,
  importPayload: async (value) => {
    const candidate = createKernel(value.kernel);
    if (
      candidate.story.state.authorized &&
      candidate.story.state.key !== JSON.parse(AUTHORITY_FILE).archive_key
    )
      throw new Error("授权密钥与归档不匹配");
    const raw = JSON.stringify(value),
      old = localStorage.getItem(KEY);
    localStorage.setItem(KEY, raw);
    try {
      init();
      previousDraft = null;
      $("restore-draft").hidden = true;
      render();
    } catch (e) {
      if (old === null) localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, old);
      init();
      throw e;
    }
  },
});
