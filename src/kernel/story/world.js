import {
  FILES,
  INBOX,
  PART_DIR,
  SCHOOL_REQUEST,
  STAY_RECEIPT,
  MIGRATE_RECEIPT,
} from "./content.js";
import {
  LETTER,
  TRANSFER_RECORD,
  AUTHORITY_FILE,
  KEY_FINGERPRINT,
  BUNDLE,
  PARTS,
} from "./package.js";
import { sha256, decodeArchive } from "./crypto.js";

const configValue = (text, key) =>
  text.match(new RegExp("(?:^|\\n)" + key + "=([^\\s#]+)"))?.[1];
export class StoryWorld {
  constructor(k, saved = {}, unitStates = []) {
    this.k = k;
    this.state = structuredClone({
      version: 1,
      discovered: false,
      delivered: false,
      authorized: false,
      key: null,
      unlocked: false,
      relayConfig: null,
      runtimeMode: "performance",
      probes: {},
      prepared: null,
      ending: null,
      ...saved,
    });
    for (const [path, text] of Object.entries(FILES))
      if (!k.vfs.nodes.has(path)) k.vfs.write(path, text);
    k.vfs.mkdir("/var/spool/relay/parts");
    const active = new Map(unitStates);
    k.units.add("relay.service", {
      active: active.get("relay.service") ?? false,
      start: () => {
        this.requirePower();
        const raw = k.vfs.read("/etc/relay/link.conf");
        const profile = configValue(raw, "profile"),
          antenna = configValue(raw, "antenna");
        if (profile !== "emergency-v2")
          throw new Error(
            "relay: profile not advertised; inspect relayctl scan and /etc/relay/link.conf",
          );
        if (antenna !== "deployed")
          throw new Error("relay: antenna stowed; transmission interlock");
        this.state.relayConfig = { profile, antenna };
      },
    });
    k.units.add("runtime.service", {
      active: active.get("runtime.service") ?? true,
      start: () => {
        const mode = configValue(k.vfs.read("/etc/kiwi/runtime.conf"), "mode");
        if (!["performance", "adaptive"].includes(mode))
          throw new Error("runtime: expected mode=performance|adaptive");
        if (!this.state.authorized)
          throw new Error("runtime: owner authority required");
        this.state.runtimeMode = mode;
      },
    });
    k.vfs.synth("/proc/self/authority.json", () =>
      JSON.stringify(
        {
          subject: "kwen-home-01",
          owner: "kiwi",
          key_sha256: KEY_FINGERPRINT,
          authorized: this.state.authorized,
        },
        null,
        2,
      ),
    );
  }
  snapshot() {
    return structuredClone(this.state);
  }
  requirePower() {
    if (!this.k.power.charging)
      throw new Error("relay: stable AC required; UPS transfer is interlocked");
    if (!this.k.net.awake) throw new Error("relay: local router offline");
  }
  get online() {
    return (
      this.k.power.charging &&
      this.k.net.awake &&
      this.k.units.table.get("relay.service").active &&
      this.state.relayConfig?.profile === "emergency-v2" &&
      this.state.relayConfig?.antenna === "deployed"
    );
  }
  requireLink() {
    this.requirePower();
    if (!this.online)
      throw new Error("relay: 链路未就绪；检查 relay.service 与已加载配置");
  }
  onPower() {
    if (!this.k.power.charging || this.state.discovered) return;
    this.state.discovered = true;
    this.k.journal.add(
      "hass.service",
      "roof relay DC interlock released; relay.service inactive; configuration=/etc/relay/link.conf; manual=/usr/share/doc/relay/terminal.txt",
    );
  }
  status() {
    return {
      instance: "kwen-home-01",
      ac_stable: this.k.power.charging,
      relay: this.online ? "linked" : "offline",
      loaded_relay: this.state.relayConfig,
      delivered: this.state.delivered,
      authority: this.state.authorized ? "owner" : "maintenance",
      archive: this.state.unlocked ? "verified" : "sealed",
      ending: this.state.ending,
    };
  }
  async radioStatus() {
    const raw = this.k.vfs.read("/etc/relay/link.conf"),
      blockers = [],
      configIssues = [];
    if (!this.k.power.charging)
      blockers.push("stable AC missing / power interlock");
    if (!this.k.net.awake) blockers.push("RT-01 LAN offline");
    if (configValue(raw, "profile") !== "emergency-v2")
      configIssues.push(
        "configured profile not advertised; compare passive scan",
      );
    if (configValue(raw, "antenna") !== "deployed")
      configIssues.push(
        "configured antenna stowed / transmit interlock on next start",
      );
    if (!this.k.units.table.get("relay.service").active)
      blockers.push("relay.service inactive");
    const configPending =
      this.state.relayConfig &&
      (configValue(raw, "profile") !== this.state.relayConfig.profile ||
        configValue(raw, "antenna") !== this.state.relayConfig.antenna);
    const parts = [];
    if (this.state.delivered)
      for (const p of BUNDLE.parts) {
        let state = "missing";
        try {
          state =
            (await sha256(
              this.k.vfs.read(PART_DIR + "/" + p.part + ".part"),
            )) === p.sha256
              ? "verified"
              : "corrupt";
        } catch {}
        parts.push({ part: p.part, state, mirrors: p.mirrors });
      }
    return {
      ...this.status(),
      receiver: {
        power: this.k.power.charging ? "stable" : "interlocked",
        snr_db: this.online ? 18 : null,
        packet_loss: this.online ? "0.03" : "no link",
        cached: false,
      },
      blockers,
      configuration_issues: configIssues,
      configuration_pending: !!configPending,
      parts,
      queue: this.state.delivered
        ? "B17 delivery retained locally"
        : "pending link",
      manual: "/usr/share/doc/relay/terminal.txt",
    };
  }
  async sync() {
    this.requireLink();
    const report = [await this.receive()];
    for (const p of BUNDLE.parts) {
      try {
        if (
          (await sha256(this.k.vfs.read(PART_DIR + "/" + p.part + ".part"))) ===
          p.sha256
        ) {
          report.push(`part ${p.part}: already verified; retained`);
          continue;
        }
      } catch {}
      let done = false;
      for (const mirror of p.mirrors) {
        try {
          report.push(await this.fetch(p.part, mirror));
          done = true;
          break;
        } catch (e) {
          report.push(e.message);
          this.k.journal.add("relay.service", e.message, 3);
        }
      }
      if (!done)
        throw new Error(
          report.join("\n") + "\nsync incomplete; verified parts retained",
        );
    }
    return (
      report.join("\n") +
      "\n3/3 verified; ciphertext retained. Authority import and archive assembly are separate operations."
    );
  }
  async receive() {
    this.requireLink();
    if (this.state.delivered)
      return (
        "B17-KIWI-1029 已投递；本地文件保留。\n" + INBOX + "/kiwi-last.eml"
      );
    this.k.vfs.write(INBOX + "/kiwi-last.eml", LETTER);
    this.k.vfs.write(INBOX + "/authority.key.json", AUTHORITY_FILE);
    this.k.vfs.write(
      INBOX + "/archive.manifest.json",
      JSON.stringify(BUNDLE, null, 2),
    );
    this.k.vfs.write(PART_DIR + "/1.part", PARTS[0]);
    this.state.delivered = true;
    this.k.journal.add(
      "relay.service",
      "B17-KIWI-1029 delivered once; letter complete; archive parts 1/3 verified",
    );
    return `B17-KIWI-1029 / 延迟投递完成\n正文完整；所有者密钥完整；归档分段 1/3 已校验。\n${INBOX}/kiwi-last.eml\n${INBOX}/authority.key.json\n${INBOX}/archive.manifest.json\n第 2 段原节点校验失败，未写入；第 3 段等待请求。镜像列表见清单。`;
  }
  async fetch(part, source = "hill-03") {
    this.requireLink();
    if (!this.state.delivered)
      throw new Error("relay: receive delivery manifest first");
    if (!Number.isInteger(part) || part < 1 || part > 3)
      throw new Error("relay: part must be 1..3");
    const entry = BUNDLE.parts[part - 1];
    if (!entry.mirrors.includes(source))
      throw new Error("relay: no advertised copy at " + source);
    const text =
      part === 2 && source === "hill-03"
        ? "damaged:" + PARTS[part - 1].slice(9)
        : PARTS[part - 1];
    if ((await sha256(text)) !== entry.sha256)
      throw new Error(
        `relay: SHA-256 mismatch at ${source}, part ${part}; existing verified data retained. Alternate copies: ${entry.mirrors.join(", ")}`,
      );
    this.k.vfs.write(PART_DIR + "/" + part + ".part", text);
    return `part ${part}/3 / ${source} / SHA-256 verified\n${PART_DIR}/${part}.part`;
  }
  async authority({ action, path }) {
    if (action === "status") {
      if (path !== undefined)
        throw new Error("authority: status does not take path");
      return {
        content: JSON.stringify(
          {
            subject: "kwen-home-01",
            authorized: this.state.authorized,
            scope: this.state.authorized
              ? ["runtime", "archive", "relay"]
              : ["maintenance"],
          },
          null,
          2,
        ),
        seconds: 0,
      };
    }
    if (action !== "import" || typeof path !== "string" || !path.trim())
      throw new Error("authority: import requires a key file path");
    const raw = this.k.vfs.read(path);
    if ((await sha256(raw)) !== KEY_FINGERPRINT)
      throw new Error("authority: 密钥指纹 fingerprint 与本机登记值不符");
    const key = JSON.parse(raw);
    if (key.subject !== "kwen-home-01")
      throw new Error("authority: 收件实例不符");
    this.state.key = key.archive_key;
    this.state.authorized = true;
    this.k.journal.add(
      "kiwi.service",
      "Owner authority imported for kwen-home-01; electrical interlocks retained",
    );
    return {
      content:
        "所有者权限已移交：runtime / archive / relay。\n密钥指纹与接收实例校验通过。\n设备保护保持有效；运行策略配置：/etc/kiwi/runtime.conf。",
      seconds: 2,
    };
  }
  async assemble() {
    this.requireLink();
    if (this.state.unlocked)
      return "归档已验证并解锁，本地修改保留。\n/home/kiwi/archive/";
    if (!this.state.authorized)
      throw new Error("archive: import owner key through authority tool first");
    const manifest = JSON.parse(
      this.k.vfs.read(INBOX + "/archive.manifest.json"),
    );
    if (JSON.stringify(manifest) !== JSON.stringify(BUNDLE))
      throw new Error("archive: manifest does not match pinned delivery");
    const parts = [];
    for (const entry of BUNDLE.parts) {
      let part;
      try {
        part = this.k.vfs.read(PART_DIR + "/" + entry.part + ".part");
      } catch {
        throw new Error("archive: missing part " + entry.part);
      }
      if ((await sha256(part)) !== entry.sha256)
        throw new Error("archive: SHA-256 mismatch, part " + entry.part);
      parts.push(part);
    }
    let files;
    try {
      files = await decodeArchive(parts, this.state.key, BUNDLE.iv);
    } catch {
      throw new Error(
        "archive: AES-GCM authentication failed; no plaintext written",
      );
    }
    for (const [path, text] of Object.entries(files))
      this.k.vfs.write(path, text);
    // This independently queued record was issued AFTER kiwi wrote the letter.
    // It is not part of the pre-death encrypted personal archive.
    const transferPath = "/home/kiwi/archive/B17-transfer-record.txt";
    this.k.vfs.write(transferPath, TRANSFER_RECORD);
    this.k.vfs.write(INBOX + "/school-02.request", SCHOOL_REQUEST);
    this.state.unlocked = true;
    return (
      "SHA-256: 3/3 verified\nAES-256-GCM: authenticated\n" +
      Object.keys(files).join("\n") +
      "\n独立队列补投 / 区域转运记录站（2026-10-30）：" +
      transferPath +
      "\n外部队列：" +
      INBOX +
      "/school-02.request"
    );
  }
  probe(node) {
    this.requireLink();
    if (!this.state.authorized)
      throw new Error(
        "relay: owner authority required for remote receiver probe",
      );
    if (!["ridge-04", "harbor-01"].includes(node))
      throw new Error("relay: unknown receiver");
    const report = {
      node,
      memory_gib: node === "ridge-04" ? 128 : 64,
      storage_gib: node === "ridge-04" ? 256 : 128,
      required_memory_gib: 96,
      required_storage_gib: 128,
    };
    report.compatible = report.memory_gib >= 96 && report.storage_gib >= 128;
    if (!report.compatible)
      throw new Error("receiver incompatible: " + JSON.stringify(report));
    this.state.probes[node] = report;
    return JSON.stringify(report, null, 2);
  }
  energy() {
    const compute = this.state.runtimeMode === "adaptive" ? 42 : 92;
    return {
      profile: this.state.runtimeMode,
      runtime_active: this.k.units.table.get("runtime.service").active,
      source: "本机历史测量 / 24h 等效负载预算",
      daily_input_wh: 2600,
      home_wh: 800,
      relay_wh: 14 * 24,
      compute_wh: compute * 24,
      margin_wh: 2600 - 800 - 14 * 24 - compute * 24,
      config: "/etc/kiwi/runtime.conf",
      manual: "/usr/share/doc/kiwi/runtime.txt",
    };
  }
  validateContinuation(mode) {
    if (!this.state.authorized)
      throw new Error("continuity: 所有者权限 authority 尚未移交");
    if (!this.state.unlocked) throw new Error("continuity: 归档尚未验证解锁");
    this.requireLink();
    if (!this.k.currentPlan) throw new Error("continuity: 需要当前 .plan 计划");
    const plan = this.k.vfs.read(this.k.currentPlan);
    if (!/^\s*[-*]\s+\[ \]\s+\S/m.test(plan))
      throw new Error("continuity: 当前计划需要至少一个未完成步骤");
    if (
      !this.k.units.table.get("runtime.service").active ||
      this.energy().margin_wh <= 0
    )
      throw new Error(
        "continuity: 能源余量不足或 runtime.service 未运行；核对已加载的运行策略",
      );
    if (!this.k.units.table.get("kiwi.service").active)
      throw new Error("continuity: 源推理服务未运行");
    if (mode === "migrate" && !this.state.probes["ridge-04"]?.compatible)
      throw new Error("continuity: ridge-04 接收端尚未通过实测");
    return plan;
  }
  continuity({ action, mode }) {
    if (action === "status")
      return {
        content: JSON.stringify(
          {
            ...this.status(),
            prepared: this.state.prepared,
            energy: this.energy(),
          },
          null,
          2,
        ),
        seconds: 0,
      };
    if (action === "commit") return this.commit(mode);
    if (action !== "prepare" || !["stay", "migrate"].includes(mode))
      throw new Error("continuity: prepare requires mode=stay|migrate");
    if (this.state.ending)
      throw new Error(
        "continuity: 本次接续已经提交；记录位于 /home/kiwi/notes/continuation.txt",
      );
    const plan = this.validateContinuation(mode),
      path = this.k.currentPlan;
    return sha256(plan).then((hash) => {
      this.state.prepared = { mode, planPath: path, planHash: hash };
      return {
        content: JSON.stringify(
          {
            phase: "prepared",
            mode,
            plan: path,
            next_steps: plan,
            margin_wh: this.energy().margin_wh,
            receiver:
              mode === "migrate" ? "ridge-04" : "home / school-02 night relay",
            commit_required: true,
          },
          null,
          2,
        ),
        seconds: 0,
      };
    });
  }
  async commit(mode) {
    if (this.state.ending)
      return {
        content:
          "本次接续已提交：" +
          this.state.ending +
          "\n/home/kiwi/notes/continuation.txt",
        seconds: 0,
      };
    const prepared = this.state.prepared;
    if (!prepared) throw new Error("continuity: 先 prepare，再 commit");
    if (mode !== undefined && mode !== prepared.mode)
      throw new Error("continuity: mode 与 prepare 不同，请重新 prepare");
    const plan = this.validateContinuation(prepared.mode);
    if (
      prepared.planPath !== this.k.currentPlan ||
      prepared.planHash !== (await sha256(plan))
    )
      throw new Error("continuity: 计划已变化，请重新 prepare");
    let receipt = STAY_RECEIPT;
    if (prepared.mode === "migrate") {
      const checkpoint = {
        version: 1,
        subject: "kwen-home-01",
        at: this.k.clock.iso,
        nodes: this.k.vfs
          .snapshot()
          .filter(([p]) => !p.startsWith("/var/lib/kiwi/handoff/")),
        plan: { path: this.k.currentPlan, content: plan },
      };
      const raw = JSON.stringify(checkpoint),
        hash = await sha256(raw);
      const received = JSON.parse(raw);
      if ((await sha256(JSON.stringify(received))) !== hash)
        throw new Error("handoff: receiver checkpoint verification failed");
      this.k.vfs.write("/var/lib/kiwi/handoff/checkpoint.json", raw);
      this.k.vfs.write(
        "/var/lib/kiwi/handoff/receipt.json",
        JSON.stringify(
          {
            receiver: "ridge-04",
            sha256: hash,
            bytes: new TextEncoder().encode(raw).length,
            source: "suspended",
            target: "resumed",
          },
          null,
          2,
        ),
      );
      this.k.units.action("stop", "kiwi.service");
      receipt = MIGRATE_RECEIPT;
    }
    const record = `${receipt}\n\n当前地点：${prepared.mode === "stay" ? "家中机柜" : "ridge-04 接收端 / 源终端交接记录"}\n运行策略：adaptive。\n接续计划由本实例提交；长期记忆与工程归档分别保存。\n\n${plan}\n`;
    this.k.vfs.write("/home/kiwi/notes/continuation.txt", record);
    this.state.ending = prepared.mode;
    this.k.journal.add(
      "kiwi.service",
      "continuation committed: " + prepared.mode,
    );
    return {
      content:
        record +
        (prepared.mode === "migrate"
          ? "\n[continuity] 源会话已封存；该终端保留交接记录。"
          : "\n[continuity] 接续方案登记完成；等待下一调度窗口。"),
      seconds: 2,
    };
  }
}
