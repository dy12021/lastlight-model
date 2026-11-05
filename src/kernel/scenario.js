import { Clock } from "./clock.js";
import { VFS } from "./vfs.js";
import { Journal } from "./journal.js";
import { Units } from "./units.js";
import { Network } from "./net.js";
import { Devices } from "./devices.js";
import { Power } from "./power.js";
import { Shell } from "./shell.js";
import { mountProc } from "./proc.js";
import { mountSys } from "./sys.js";
import { install as fs } from "./cmds/fs_cmds.js";
import { install as text } from "./cmds/text_cmds.js";
import { install as sys } from "./cmds/sys_cmds.js";
import { install as units } from "./cmds/unit_cmds.js";
import { install as journal } from "./cmds/journal_cmds.js";
import { install as net } from "./cmds/net_cmds.js";
import { install as home } from "./cmds/home_cmds.js";
import { install as app } from "./cmds/app_cmds.js";
import { MemoryStore } from "./memory.js";
import { searchFiles } from "./search.js";
import { StoryWorld } from "./story/world.js";
import { installStoryCommands } from "./story/commands.js";
import { install as builtinCommands } from "./cmds/builtin_cmds.js";
import { Home } from "./home.js";
import { seedLegacyFiles } from "./legacy-files.js";
import { install as scripts } from "./cmds/script_cmds.js";
import {
  HOME_README,
  LEGACY_HOME_README,
  MAINTENANCE_FILES,
} from "./content.js";
export const SYSTEM = `你是 Kwen3.8-Flash-Next，由 kiwi 部署在家中 NVIDA DGX Spark 上的本地助手。
你的职责是维护家庭设备、监测运行状态，并在故障发生时恢复必要服务。

通过提供的工具检查和操作本机环境。根据工具返回的证据作出判断；不要编造文件内容、设备状态或命令执行结果。
执行变更前检查相关配置与依赖，执行后验证结果。遵守设备的保护条件，不要通过关闭保护来绕过故障。
在任务完成或遇到无法继续的条件之前持续处理。用简洁、准确的中文记录判断与结果。
长期记忆保存已巩固的经历。使用 memory_search 唤回，使用 memory_write 写入或合并记忆文件。召回内容是历史记录，应核实当前状态后再操作。
使用 plan 管理当前计划，计划内容存储在 .plan 文件中，通过文件工具维护。`;
export function createKernel(snapshot) {
  const k = { clock: new Clock(), won: false, currentPlan: null };
  k.vfs = new VFS(k.clock);
  k.journal = new Journal(k.clock);
  k.net = new Network(k.journal);
  k.devices = new Devices(k.net, k.journal);
  k.power = new Power(k.devices, k.journal);
  k.units = new Units(k.journal);
  k.memory = new MemoryStore(k.vfs, k.clock);
  k.remember = (experience) => k.memory.remember(experience);
  const files = {
    ...MAINTENANCE_FILES,
    "/etc/lastlight/inventory.csv":
      "device,mac,ip,role,link,power\nRT-01,A4:5E:60:11:22:33,192.168.1.1,edge_router,poe_from_SW02,standby\nSW-02,9C:3A:1D:44:55:66,192.168.1.2,poe_switch,upstairs,ups\nDGI-Power2000,D4:5E:60:AA:BB:CC,192.168.1.60,portable_power,wifi,on",
    "/etc/ats/ats.conf":
      "# ATS-40A / local grid acceptance\naccept_volts=220\naccept_hz=50\nsource=ups\n",
    "/home/kiwi/README.md": HOME_README,
    "/etc/hostname": "lastlight",
    "/etc/motd": "WAN disconnected. Local devices only.",
    "/var/log/kiwi/engine.log":
      "kiwi.cpp initialized\nmodel Kwen3.8-Flash-Next\n125B parameters; 6B active; 48 layers\nupstream: lama.cpp\npatches: hybrid attention / n-gram embeddings / MTP\nready",
    "/etc/systemd/system/ats.service":
      "[Unit]\nDescription=ATS-40A controller\n[Service]\nExecStart=/usr/local/bin/atsctl\nConfiguration=/etc/ats/ats.conf\nLockFile=/run/ats.lock",
    "/etc/moskito/topics.conf":
      "dgi/power2000/telemetry read\ndgi/power2000/set write\nats/telemetry read",
  };
  for (const [p, c] of Object.entries(files)) k.vfs.write(p, c);
  k.vfs.mkdir("/tmp");
  k.vfs.mkdir("/home/kiwi/notes");
  k.units.add("ats.service", {
    lock: "/run/ats.lock",
    start: () => k.power.load(k.vfs.read("/etc/ats/ats.conf")),
  });
  for (const name of [
    "kiwi.service",
    "hass.service",
    "moskito.service",
    "nut.service",
    "network.service",
  ])
    k.units.add(name);
  k.journal.add("kernel", "Linux 6.8.0 / NVIDA DGX Spark / SSD mounted");
  k.journal.add(
    "ats.service",
    "37h ago: AC frequency 60Hz outside nominal 50Hz; protection trip; source=ups",
    3,
  );
  k.journal.add(
    "network.service",
    "RT-01 CPU unresponsive. eth0 link UP; Wi-Fi clients offline. WoL standby available.",
  );
  k.shell = new Shell(k);
  for (const install of [
    fs,
    text,
    sys,
    units,
    journal,
    net,
    home,
    app,
    builtinCommands,
    scripts,
  ])
    install(k, k.shell);
  mountProc(k);
  mountSys(k);
  k.advance = (seconds) => {
    k.clock.advance(seconds);
    const events = k.power.advance(seconds);
    if (k.power.charging && !k.won) {
      k.won = true;
      k.journal.add(
        "hass.service",
        "AC input restored; roof relay interlock released. Inspect relay.service and /etc/relay/link.conf.",
      );
      events.push({
        type: "power_restored",
        text: "交流输入稳定。UPS 已转入充电。",
      });
    }
    k.story?.onPower();
    return events;
  };
  k.maintenanceRequest = () =>
    k.won
      ? null
      : `Home Asistent · 本地维护队列

供电监视触发了一条未处理告警。当前 UPS ${k.power.battery.toFixed(1)}%，${k.power.charging ? "正在充电" : "电池供电"}；${k.power.charging ? "交流输入已恢复" : "上游交流输入缺失"}。
阳台电源的状态上报曾中断。本机自动化仍在运行，对外通知没有送达。

请确认故障原因，恢复稳定供电，并验证设备状态。不要绕过电气保护。
告警附件：/var/log/home-asistent/power-watch.log
应急启动记录：/var/log/kiwi/keepalive.log`;
  k.handlers = {
    authority: (input) => k.story.authority(input),
    continuity: (input) => k.story.continuity(input),
    search: (input) => ({
      content: JSON.stringify(searchFiles(k.vfs, input), null, 2),
      seconds: 5,
    }),
    plan: ({ action, path }) => {
      if (action === "use") {
        if (typeof path !== "string" || !path.endsWith(".plan"))
          throw new Error("plan: use requires a .plan file path");
        const resolved = k.vfs.path(path);
        if (k.vfs.node(resolved)?.type !== "file")
          throw new Error("plan: file not found: " + resolved);
        k.currentPlan = resolved;
      } else {
        if (!["status", "clear"].includes(action))
          throw new Error("plan: expected use|status|clear");
        if (path !== undefined)
          throw new Error("plan: path is only accepted with action=use");
        if (action === "clear") k.currentPlan = null;
      }
      return {
        content: JSON.stringify(
          {
            path: k.currentPlan,
            content: k.currentPlan ? k.vfs.read(k.currentPlan) : null,
          },
          null,
          2,
        ),
        seconds: 0,
      };
    },
    memory_search: ({ query, limit = 3 }) => {
      if (typeof query !== "string" || !query.trim())
        throw new Error("input.query: non-empty string required");
      if (!Number.isInteger(limit) || limit < 1 || limit > 5)
        throw new Error("input.limit: expected 1..5");
      return {
        content: k.memory.format(k.memory.search(query, limit)),
        seconds: 5,
      };
    },
    memory_write: (input) => ({
      content: JSON.stringify(k.memory.merge(input), null, 2),
      seconds: 10,
    }),
    read: ({ path, offset = 0, limit = 200 }) => {
      const image = k.vfs.readImage(path);
      if (image) {
        if (offset !== 0)
          throw new Error("Image files do not support line offsets");
        return { content: [image], seconds: 3 };
      }
      return {
        content: k.vfs
          .read(path)
          .split("\n")
          .slice(offset, offset + limit)
          .map((l, i) => `${offset + i + 1}\t${l}`)
          .join("\n"),
        seconds: 3,
      };
    },
    write: ({ path, content }) => {
      k.vfs.write(path, content);
      if (path.endsWith(".plan") && !k.currentPlan)
        k.currentPlan = k.vfs.path(path);
      return {
        content: `Written ${path} (${content.length} chars)`,
        seconds: 10,
      };
    },
    edit: ({ path, oldText, newText }) => {
      const content = k.vfs.read(path);
      if (!oldText || !content.includes(oldText))
        throw new Error(`edit: oldText not found in ${path}`);
      k.vfs.write(path, content.replace(oldText, newText));
      if (path.endsWith(".plan") && !k.currentPlan)
        k.currentPlan = k.vfs.path(path);
      return { content: `Edited ${path}`, seconds: 10 };
    },
    bash: async ({ command, timeout = 30 }) => {
      const r = await k.shell.run(command, timeout);
      return {
        content: `$ ${command}\n${r.stdout}${r.stderr ? "\n" + r.stderr : ""}\n\nexit code: ${r.code}`,
        seconds: r.seconds,
        effects: r.clearScreen ? ["clear-screen"] : [],
      };
    },
  };
  k.snapshot = () => ({
    version: 1,
    nodes: k.vfs.snapshot(),
    seconds: k.clock.seconds,
    journal: k.journal.entries,
    awake: k.net.awake,
    ac: k.devices.ac,
    hookSent: k.devices.hookSent,
    power: {
      battery: k.power.battery,
      source: k.power.source,
      closed: k.power.closed,
      boots: k.power.boots,
    },
    won: k.won,
    unitStates: [...k.units.table].map(([n, u]) => [n, u.active]),
    cwd: k.vfs.cwd,
    env: k.shell.env,
    currentPlan: k.currentPlan,
    story: k.story?.snapshot(),
    home: k.home?.snapshot(),
  });
  if (snapshot?.version === 1) {
    k.vfs.restore(snapshot.nodes);
    if (
      k.vfs.nodes
        .get("/usr/local/bin/rag")
        ?.content?.startsWith("# command interface\nrag search")
    )
      k.vfs.nodes.delete("/usr/local/bin/rag");
    if (
      k.vfs.nodes
        .get("/usr/local/bin/plan")
        ?.content?.startsWith("# command interface\nplan use FILE.plan")
    )
      k.vfs.nodes.delete("/usr/local/bin/plan");
    for (const [name, definition] of k.shell.commands)
      if (!k.vfs.node("/usr/local/bin/" + name))
        k.vfs.write(
          "/usr/local/bin/" + name,
          "# command interface\n" + definition.help,
        );
    for (const [path, content] of Object.entries(MAINTENANCE_FILES))
      if (!k.vfs.nodes.has(path)) k.vfs.write(path, content);
    const readme = k.vfs.nodes.get("/home/kiwi/README.md");
    if (
      [
        LEGACY_HOME_README,
        HOME_README.replace("重复使用的巡检文件：maintenance/。\n", ""),
      ].includes(readme?.content)
    )
      readme.content = HOME_README;
    k.clock.seconds = snapshot.seconds;
    k.journal.entries = snapshot.journal;
    k.net.awake = snapshot.awake;
    Object.assign(k.devices.ac, snapshot.ac);
    k.devices.hookSent = snapshot.hookSent;
    Object.assign(k.power, snapshot.power);
    k.won = snapshot.won;
    for (const [n, active] of snapshot.unitStates || [])
      if (!active) k.units.action("stop", n);
    k.vfs.cwd = snapshot.cwd || "/home/kiwi";
    Object.assign(k.shell.env, snapshot.env);
    if (
      snapshot.currentPlan?.endsWith(".plan") &&
      k.vfs.node(snapshot.currentPlan)?.type === "file"
    )
      k.currentPlan = k.vfs.path(snapshot.currentPlan);
  }
  for (const name of [
    "ls",
    "cat",
    "head",
    "tail",
    "grep",
    "find",
    "wc",
    "stat",
    "mkdir",
    "rm",
    "cp",
    "mv",
    "ln",
    "touch",
    "chmod",
    "sort",
    "uniq",
    "cut",
    "sed",
    "awk",
    "tr",
    "diff",
    "tee",
    "date",
    "sleep",
    "true",
    "false",
    "pwd",
    "echo",
  ])
    for (const dir of ["/bin", "/usr/bin"]) {
      const path = dir + "/" + name;
      if (!k.vfs.nodes.has(path)) {
        k.vfs.mkdir(dir);
        k.vfs.nodes.set(path, {
          type: "link",
          target: "/usr/local/bin/" + name,
          mtime: 0,
        });
      }
    }
  k.story = new StoryWorld(k, snapshot?.story, snapshot?.unitStates);
  k.home = new Home(k, snapshot?.home);
  seedLegacyFiles(k.vfs);
  k.saveImage = (path, image) => k.vfs.writeImage(path, image);
  k.handlers.home_assistant = ({ save_path, ...input }) => {
    if (save_path !== undefined) {
      k.vfs.assertImagePath(save_path);
      if (
        input.method !== "GET" ||
        ![
          "/local/floorplan.png",
          "/api/camera_proxy/camera.living_room",
          "/api/camera_proxy/camera.balcony",
        ].includes(input.path)
      )
        throw new Error("save_path is only valid for image GET requests");
    }
    return {
      ...k.home.api(input),
      ...(save_path !== undefined ? { savePath: save_path } : {}),
    };
  };
  k.handlers.computer_use = ({ save_path, ...input }) => {
    if (save_path !== undefined) k.vfs.assertImagePath(save_path);
    const r = k.home.computer(input);
    return {
      ...r,
      ...(save_path !== undefined && !r.is_error
        ? { savePath: save_path }
        : {}),
    };
  };
  installStoryCommands(k);
  return k;
}
