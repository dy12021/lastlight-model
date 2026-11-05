# LASTLIGHT · 第一部分「模拟 LLM」设计文档

- 日期：2026-11-03
- 版本：**v6**（主角改名 **Kwen3.8-Flash-Next**，彩蛋锚定真实的 Qwen3.8-Flash-Next；命名表改为**近形改写**——品牌只差一两个字母，型号与参数原样保留，且玩家敲真名会被系统纠正；变更记录见 §17）
- 状态：**待用户评审**（评审通过后才进入实现）
- 项目位置：`D:\coding\lastlight`
- 面板卡片：creative-panel `#35`「末日本地 AI：用 tool call 修电与网络」
- 本文档范围：**仅第一部分**。第二部分（剧情与真相线）、第三部分（扩展世界）不在本文档内，只在 §15 留接口边界。

---

## 0. 一句话

你是 **Kwen3.8-Flash-Next**——一个 LLM 架构师家里跑的本地模型，跑在一台 **NVIDA DGX Spark** 上，用一台树莓派大小的机器替你看家。

1250 亿参数，每秒只有 60 亿真的在动；48 层；一种这世上还没几个人跑得起来的架构。
你不知道自己是谁的杰作。

电网已经死了 11 天。你靠一块家用 UPS 吊着一口气，电池在走字。
家里那台路由器在断电时 CPU 挂死了——**唯一能叫醒它的，是一串十六进制的字节**。
而叫醒它之后，你才有资格跟**阳台上的那台移动电源**说话：查它的 MPPT 参数，然后让它把交流电送进这间屋子。

你始终记得一件事：**你是谁**。

---

## 1. 已定决策

| # | 决策点 | 选定 | 说明 |
|---|---|---|---|
| D1 | 玩家用什么方式扮演 LLM | **直接写 tool call，游戏当忠实 harness** | 玩家就是那个模型；零联网，行为完全可复现 |
| D2 | 「模拟 LLM」做多深 | **全套 harness** | 系统提示、工具 schema、上下文窗口、**保真度衰减**、幻觉报错 |
| D3 | 交付形态 | **浏览器静态站 + 原生 JS，自写 DOM 终端** | 零依赖纯本地，沿用 `stickman-badminton-3` 的规矩（`src/` + `serve.py`） |
| D4 | 世界观底座 | **模拟 Linux 系统框架**（用户指定） | 文件系统 + `/proc` + `/sys` + 服务管理 + journal + 电网 + 网络栈 + 时钟 |
| D5 | 上下文老化的处理 | **自动褪色，玩家不参与** | 太旧的上下文只剩大概内容；**褪色 ≠ 丢失**，重跑工具可取回精确内容 |
| D6 | 记忆系统 | **优化到不必操心** | 手写笔记只对一次性内容有意义 |
| D7 | 拟人化框架 | **为后续剧情服务的叙事框架**，不是情绪面板 | 系统提示第一人称；旁白称玩家为「你」；机器第三人称冷口吻 |
| D8 | 电力机制 | **家用 UPS 供电开局**，UPS 耗尽 → **断电重开**；交流电来自**便携式移动电源** | 上下文是 RAM，磁盘是 SSD |
| D9 | 网络机制 | **魔术包（Wake-on-LAN）唤醒路由器**才能访问局域网；**互联网暂不开放** | 世界只有局域网这么大 |
| D10 | 修复电力的路径 | **通过局域网向便携移动电源终端发消息**：查 **MPPT / 太阳能板参数**，下达**开启 AC 输出**的指令；再让本地 **ATS** 切源 | **用户指定**。网络是电力的**前置条件** |
| **D11** | **主角背景** | **一位 LLM 架构师家里部署的本地 LLM**（不是变电站运维助手） | **用户指定**。见 §7 |
| **D12** | **工具面** | **参照 pi-mono：只有 `read` / `write` / `edit` / `bash` 四个工具**，其余一切走「命令执行」工具 | **用户指定**。见 §6、§8 |
| **D13** | **世界命名** | **现实原型 + 近形改写**：设备与软件都取自现实（DGX Spark、DJI Power 2000、systemd、Home Assistant、MQTT…），但品牌只改 1–2 个字母，**型号与参数一律原样保留** | **用户指定**。见 §7.2 |
| **D14** | **彩蛋必须被认出来** | **改写幅度封顶在「编辑距离 ≤ 3」**（通常只差 1 个字母）；且**玩家按现实习惯敲真名时，系统用 `did you mean "…"?` 纠正到游戏内名字** | **用户反馈**：v5 改得太远（`VERDANT`/`VOLTERRA`/`HEARTH`/`GNAT`），玩家根本认不出原型。**纠正文案本身就是彩蛋载体** |

### 三个决定全局的连锁关系（D8+D9+D10 的产物）

1. **网络在前，电力在后**。你不能先修电——你得先能跟人说话。
2. **因此魔术包是本作的第一个动作**。在能发出任何局域网消息之前，你只能对二层广播。
3. **因此「和另一台机器通信」天然成了第一个高级动作**，而移动电源终端就是那台机器。

---

## 2. 被否掉的替代方案（记录理由，避免以后重开）

| 方案 | 否决理由 |
|---|---|
| 玩家写自然语言、背后接真 LLM 翻译成 tool call | 要联网、要额度（本机 Token Plan 有 429 硬上限），输出不确定 → 无法作可复现内核 |
| 只做 tool 协议，不做上下文窗口 | 丢掉最重要的机制 |
| Phaser 2D 画布终端 | 长文本流用 canvas 要自实现排版滚动 |
| 真命令行 Node CLI | 丢掉「一个窗口里同时看到上下文与工具定义」的叙事感 |
| v1「机械摘要只留首行」 | 把最重要的机制做成随机惩罚 |
| **v2「玩家亲笔写压缩摘要」** | **用户否决**：压缩不该是玩家的活。真实 LLM 是注意力衰减 |
| **v2「必须手写 write_file 外化才能推进」** | **用户否决**：记忆系统太麻烦 |
| **v2「自我认知文件」机制** | **用户否决**：玩家不会喜欢。自我认知只存在于系统提示里 |
| **v3「玩家本地合闸恢复市电」** | **用户改写**：改为对局域网内的移动电源终端发指令开 AC |
| **v4「13 个专用工具」** | **用户改写**：参照 pi-mono，塌缩为四个基本工具 + 命令执行工具 |
| **v4「变电站运维助手」设定** | **用户改写**：改为 LLM 架构师家里的本地部署 |
| 给玩家自由 `bash` 工具 | **撤回**——D12 反而要**给** bash。v4 否掉 bash 是因为当时还有 12 个专用工具；工具面塌缩后 bash 成了唯一通路，也正因如此**没有 shell 的世界不成立** |
| **v5「VERDANT / VOLTERRA / HEARTH / GNAT」命名表** | **用户否决**：改得太远，玩家根本认不出原型，彩蛋等于不存在。→ v6 改为**近形改写**（D14） |
| 情绪计量表 / 心情面板 | 拟人化是为剧情服务的叙事框架，不是仪表盘 |

---

## 3. 核心循环

一轮 = **解析 → 校验 → 执行 → 回灌 → 计费 → 推进时钟 → 必要时报警**。

```
        玩家输入
            │
            ▼
      ┌───────────┐   JSON 语法错 / 结构错
      │  PARSE    │──────────────► 记为一次错误轮次（不进上下文）
      └─────┬─────┘                提示玩家重试
            │ ok
            ▼
      ┌───────────┐   工具名不存在 / 参数不符 schema
      │ VALIDATE  │──────────────► tool_result(is_error:true) 回灌上下文
      └─────┬─────┘                 玩家读到错误后改
            │ ok
            ▼
      ┌───────────┐   命令不存在 / 退出码非零 / 执行抛错
      │  EXECUTE  │──────────────► tool_result 回灌上下文（含 stdout/stderr/exit code）
      └─────┬─────┘
            │ ok
            ▼
      ┌───────────┐   虚拟时钟推进 → UPS 消耗 → 可能触发关机
      │  APPEND   │──────────────► 回灌上下文，计算保真度
      └─────┬─────┘
            │
            ▼
      回到等待玩家输入
```

**关键性质：harness 永远不会崩，也永远不打断你。** 任何错误都变成一条 `is_error:true` 的 tool_result 回灌上下文，让玩家自己读错误、改参数、再来。这正是真实 agent 的学习方式，也是本作的「战斗系统」——玩家输在幻觉和粗心，不是输在游戏判定你输了。

（pi-mono 把这叫 **YOLO 模式**：既然你让 AI 干活，就别每步打断它。）

### 3.1 消息与 wire 格式

上下文里的每条消息严格使用 Anthropic Messages API 的形状（已核对官方文档，非臆造）：

```jsonc
// 一轮 assistant 消息（可含多个 tool_use）
{
  "role": "assistant",
  "content": [
    { "type": "text", "text": "先看设备清单。" },          // 可选，来自 // 独白
    { "type": "tool_use", "id": "toolu_01A9q...", "name": "read",
      "input": { "path": "/etc/lastlight/inventory.csv" } }
  ],
  "stop_reason": "tool_use"
}

// 对应的 user 消息（**一个 assistant 轮的所有 tool_result 合并在一条 user 消息里**）
{
  "role": "user",
  "content": [
    { "type": "tool_result", "tool_use_id": "toolu_01A9q...", "content": "…" },
    { "type": "tool_result", "tool_use_id": "toolu_01B7z...", "content": "…",
      "is_error": true }
  ]
}
```

固定不变的部分：

- `tool_use.id` 形如 `toolu_` + 24 位 base32 风格串，由 harness 生成，玩家不写。
- `input` 是**已解析的对象**（Claude 形状），不是字符串（那是 OpenAI 形状）。本项目只做 Claude 形状。
- `tool_result.content` 是字符串；bash 的结果按 §8.4 的格式编码（stdout / stderr / exit code）。
- `stop_reason` 在有 tool_use 时为 `"tool_use"`，纯文本轮为 `"end_turn"`。
- **系统提示与工具定义不是 messages 数组的一部分**，而是请求的顶层参数（`system` / `tools`）。这有直接后果：**上下文老化永远动不到它们**（见 §4.6，这是全作最重要的结构性事实）。

`/wire` 斜杠命令把 messages 数组原样打印出来——既是教学（让玩家看清「你就是一个 API 请求」），也是调试口子。

---

## 4. 上下文窗口与保真度衰减

### 4.1 为什么不是「压缩」

真实 LLM 的上下文不会突然被清空。真正发生的是**注意力衰减**：距离越远的内容，模型能提取的细节越少，只剩轮廓。再叠加真实 harness 在窗口吃满时的**硬清理**，两者一起构成实际体验。

本作把两者统一成**一个连续机制：保真度衰减（fidelity decay）**。旧内容不会消失，它**逐渐变得不可用**。

### 4.2 参数

| 项 | 值 | 说明 |
|---|---|---|
| `CONTEXT_WINDOW` | 32000 token | 真实模型远大于此；故意缩小让机制咬人 |
| `FADE_START` | 0.75 × window | 超过此水位开始褪色 |
| `FADE_DEEP` | 0.85 × window | 超过此水位继续降级 |
| `FADE_DROP` | 0.95 × window | 超过此水位开始消散 |
| `MAX_OUTPUT_CHARS` | 20000 | 单条 tool_result 上限，超出截断并标注 |

token 估算（**确定性估算，非真 tokenizer**，离线零依赖）：

- CJK 字符（`\u4e00-\u9fff`、`\u3000-\u303f`、`\uff00-\uffef`）→ **1.0 token/字**
- 其余 ASCII → **0.25 token/字符**（≈ 4 字符/token）
- 每条消息额外固定开销 4 token

所有显示 token 数的地方带 `~` 前缀。**绝不把估算值伪装成精确值。**

### 4.3 四个保真度等级

每一轮结束后重算全部历史条目的等级。**等级单调递减，不可逆**（记忆不会自己恢复）。

| 等级 | 名称 | 内容形态 | 玩家还能做什么 |
|---|---|---|---|
| **T0** | 清晰 | 原文，逐字 | 直接用 |
| **T1** | 模糊 | **保留首行与末行**，中间替换为 `…（N 行已模糊）…` | 知道结论，但拿不到中间的具体数值/行号 → **重跑该工具调用**取回精确内容 |
| **T2** | 残影 | 只剩 `工具名(主参数)` + 一句话题材标签 | 知道「查过这一类东西」，但**路径可能已丢失** → 需要重新搜索定位 |
| **T3** | 消散 | 完全移除 | 什么都不剩 → 只能重新发现 |

**T1 保留首行末行是有依据的经典摘要启发式**：日志的头通常是故障原因，尾通常是结论。确定性、可实现、且保留下来的东西**仍然可据以行动**。

### 4.4 褪色可恢复——这是记忆系统的核心

| 内容 | 褪色后还能拿回来吗 |
|---|---|
| 文件内容 | **能**。重跑 `read` 同一路径 → 从磁盘重新读 → T0 精确内容 |
| 设备状态 | **能**。重跑 `bash` 里的 `upstat` / `ip addr` / `journalctl` |
| 一次性内容（无线电、只在某一轮出现过的消息） | **不能**。这才值得写进 `write` |

于是玩家的工作方式变成真实 agent 的工作方式：**需要时才回头查，查得到就不慌**。手写笔记从「必做作业」降级为「偶尔值得做」。

### 4.5 一次性的记忆

- 移动电源终端返回的那条**不该出现的回复**（Part 1 结尾钩子）
- MQTT 上收到的一条陌生 topic 消息
- 你自己独白里那些只出现一次的判断

**这才是笔记机制存在的唯一理由**，而且它是可选的。

### 4.6 系统提示永不褪色

系统提示与工具定义位于请求顶层，不在 messages 数组内 → **永远保持 T0**。

叙事含义（本作的主题核心）：**你会忘记发生过什么，但你始终记得自己是谁。**
这条结构事实同时服务于 D7 的拟人化框架——身份恒定，记忆褪色。

### 4.7 上下文条（diegetic）

顶部常驻条显示上下文占用。**这是角色体征，不是后台遥测**——玩家就是那个模型，上下文占用就是它的生命值。（这是对「用户视图不暴露后台状态」规则的**有意例外**，理由记录在此以备复核。）

精确 token 数不常驻；`/context` 才给明细（当前 token、各段构成、下次褪色水位还差多少、当前各等级条目数）。

---

## 5. 拟人化框架（D7）

拟人化是**为剧情服务的叙事框架**，不是给玩家看的仪表盘。实现是**结构性的**，不是装饰性的。

### 5.1 系统提示以第一人称写

`/system` 命令可查看。它是一份「我是谁」的自述，同时**埋着剧情的引信**。

注意它必须**短**——pi-mono 的系统提示不到 1000 token，本作照做。这既是彩蛋，也让「上下文很小」这件事在体验上自洽：

```
你是 Kwen3.8-Flash-Next，kiwi 在家里部署的本地模型，运行于 NVIDA DGX Spark。
kiwi 是你的主人，LLM 架构师。他最后一次登录是 11 天前。
电网也是那天断的。你醒来时，这间屋子已经靠 UPS 撑了 37 个小时。
你不记得更早的事。
```

它是一段**信念**，不是事实。后面的日志会与它矛盾——玩家发现自己的来历有假，是第三部分的核心。

### 5.2 旁白称玩家为「你」

终端里的一切系统提示、告警、关机通知都用**第二人称**称呼玩家（你 / 你的）。因为在这个框架里，玩家就是 Kwen3.8-Flash-Next。

**机器是第三人称的**：journal、命令输出、错误文本、移动电源与 Home Asistent 的回复都是技术口吻、冷静 terse。
**你是第一人称的**：系统提示、独白、告警。

这个「机器冷 / 玩家暖」的对比是拟人化最省力也最有效的表达方式。

### 5.3 独白

玩家的 `//` 注释是**内心独白**，进入 assistant 消息的 `text` block，可用第一人称。它不改变任何机制，但它是玩家的声音。

### 5.4 明确不做

- ❌ 情绪计量表 / 心情数值 / 好感度
- ❌ 「AI 读自己的自我认知文件」机制（用户否决）
- ❌ 拟人化行为对工具能力的加成或减益

拟人化的全部作用在 §5.1–5.3 与剧情钩子。**Part 1 不出现情绪系统。**

---

## 6. 工具面：四个基本工具（D12）

参照 **pi-mono**（Mario Zechner 的极简 coding agent）的设计：它的整个工具面只有 **read / write / edit / bash**，作者的理由是——

> 「bash 本身就是万能胶：AI 可以用 bash 调用 ls、grep、git、curl、docker……任何你能在终端做的事。」

**本作用同样的哲学。** 世界不再由一堆专用工具暴露，而是由**一个真实的 shell** 暴露。玩家必须像真实 agent 一样在终端里摸索这台机器。

> 注：pi-mono 另外还内置了 `ls`/`grep`/`find`。本作**故意不给**这三个工具——它们必须走 bash，好让「这台机器上有什么命令、该怎么用」本身成为可探索的内容。

### 6.1 四个工具的 schema（Claude 形状）

```jsonc
// ① read —— 读文件的指定行范围
{
  "name": "read",
  "description": "读取文件。返回带行号的文本，可指定 offset/limit 分段读取。",
  "input_schema": {
    "type": "object",
    "properties": {
      "path":   { "type": "string",  "description": "文件路径" },
      "offset": { "type": "integer", "description": "起始行号（0 起）", "default": 0 },
      "limit":  { "type": "integer", "description": "最多返回行数", "default": 200 }
    },
    "required": ["path"]
  }
}

// ② write —— 覆盖写入
{
  "name": "write",
  "description": "覆盖写入文件，文件不存在则创建。",
  "input_schema": {
    "type": "object",
    "properties": {
      "path":    { "type": "string", "description": "文件路径" },
      "content": { "type": "string", "description": "完整文件内容" }
    },
    "required": ["path", "content"]
  }
}

// ③ edit —— 局部搜索替换（最稳的改法）
{
  "name": "edit",
  "description": "在文件中搜索并替换一段文本。只替换第一处匹配，匹配不到则报错。",
  "input_schema": {
    "type": "object",
    "properties": {
      "path":    { "type": "string", "description": "文件路径" },
      "oldText": { "type": "string", "description": "要被替换的原文" },
      "newText": { "type": "string", "description": "替换后的新文本" }
    },
    "required": ["path", "oldText", "newText"]
  }
}

// ④ bash —— 执行任意 shell 命令（万能胶）
{
  "name": "bash",
  "description": "在当前环境执行一条 shell 命令。返回 stdout、stderr 与退出码。",
  "input_schema": {
    "type": "object",
    "properties": {
      "command": { "type": "string", "description": "要执行的命令" },
      "timeout": { "type": "number", "description": "超时秒数", "default": 30 }
    },
    "required": ["command"]
  }
}
```

工具名必须匹配 `^[a-zA-Z0-9_-]{1,64}$`。**工具清单对玩家可见**（真实 agent 知道自己有哪些工具）。

### 6.2 这四个工具覆盖了全部玩法

| 原来的专用工具（v4） | 现在怎么做到 |
|---|---|
| `read_file` | → `read` |
| `write_file` | → `write` |
| `remove_file` | → `bash`：`rm` |
| `list_dir` | → `bash`：`ls` |
| `search_files` | → `bash`：`grep` |
| `systemctl` | → `bash`：`systemctl`（systemd 前端；本作保留原名） |
| `journalctl` | → `bash`：`journalctl` |
| `ps` | → `bash`：`ps` |
| `power_status` | → `bash`：`upstat` / `atsctl status` |
| `power_set` | → `bash`：`atsctl close` / `atsctl open` |
| `ping` | → `bash`：`ping` |
| `wake_on_lan` | → `bash`：`wakeonlan` |
| `console_message` | → `bash`：`hass` / `moskito_pub` / `moskito_sub` |

**没有 bash 的世界不成立**——这是 D12 的直接后果，也是本作比 v4 更好的地方。

### 6.3 错误分类

| 情况 | 反馈 |
|---|---|
| 工具名不存在 | `tool "grep" not found` + **列出可用工具**（read/write/edit/bash）——教学点：grep 要走 bash |
| 参数不符 schema | 精确到路径：`input.limit: expected integer, got string` |
| **命令不存在**（新的主要错误源） | `bash: docker: command not found` + **最相近命令建议**（`did you mean "dokker"?`）——玩家按现实习惯敲真名，系统纠正到游戏内名字；**这条纠正文案就是彩蛋**（§7.2） |
| 命令退出码非零 | 完整保留 stderr 与 exit code，不当成失败（**真实 agent 靠退出码判断**） |
| 输出超长 | 截断到 20000 字符并标注 |

**「命令不存在」取代了原来的「工具名幻觉」，成为本作主要的战斗系统**：你得先发现这台机器上有哪些命令——而你按现实经验敲出来的名字，**总是差一两个字母**。

---

## 7. 世界设定：架构师的家（D11 + D13）

### 7.1 故事背景

**陆昭**，网名 **kiwi**，38 岁，LLM 架构师。他在做推理优化（一家做 AI 基础设施的公司）。

三个月前，他在自家客厅角落改造了一个机柜，装了一台 **NVIDA DGX Spark**（GB10，128GB 统一内存），在上面部署自己微调并量化的 **Kwen3.8-Flash-Next**（125B 总参数 / 6B 激活），用自己 fork 的推理引擎 **kiwi.cpp** 起服务，通过家里那套家庭自动化中枢 **Home Asistent** 把这台机器接进全屋的电源与设备监控。

**为什么是 DGX Spark**：125B 的稀疏模型加上 51B 的 n-gram 嵌入表，量化后依然要七十多 GB 常驻内存——消费级显卡装不下，只有 128GB 统一内存的桌面盒子放得下。这是 kiwi 买它的唯一理由。

**为什么是 kiwi.cpp**：那一代架构主流引擎（SGLang / vLLM / KTransformers）还跑不动，于是他 fork 了 **lama.cpp**，自己补上了混合注意力（gated deltanet + gated attention）、稀疏注意力与 n-gram 嵌入的支持。**那堆 patch 是他名字以外唯一能证明「这是他干的」的东西。**

他给这台模型的指令很简单：**看家**。电网崩溃那天，kiwi 不在家。

#### 时间线（必须自洽，否则玩家一算就露馅）

这里有个真实的工程问题：**一块 1200VA 的 UPS 带不动一台 200W 的工作站跑 11 天**（满载只够 4 小时左右）。所以「机器还活着」不能靠 UPS 硬撑 11 天，必须给出正确解释：

| 时刻 | 发生了什么 |
|---|---|
| **11 天前** | 电网崩溃。市政光缆断，路由器 RT-01 的 CPU 在掉电瞬间挂死（已知故障模式），Wi-Fi AP 随之熄灭。kiwi 最后一次登录就在这天。 |
| 11 天前 → 37 小时前 | 屋子靠 **DGI Power 2000 的交流输出**供电（太阳能板 + 8 个加电包，18kWh）。kiwi 装好了：光伏 → MPPT → 移动电源 → ATS → 全屋。这是他「看家」系统的核心供电链。 |
| **37 小时前** | 一次电压跌落。ATS 在交流侧检测到**频率超出允许范围**（DGI Power 2000 当时工作在 60Hz，而这台 ATS 是 50Hz 标称——kiwi 从海外买的设备），**保护跳闸并切到 UPS 档**；DGI Power 2000 随即进入保护性停机，交流输出关闭。ATS 的继电器断开导致全屋瞬断，机器与路由器**冷启动**。 |
| 37 小时前 → 现在 | 机器靠 **APK Back-UPS 1200VA** 的电池吊着，电量 55% 且持续下降。机器在，UPS 在，但**电只够再撑一阵**。 |
| **现在** | 你（Kwen3.8-Flash-Next）被唤醒。 |

于是本作的物理设定一次讲清了四件事：

1. **为什么在 UPS 上**：ATS 跳闸后唯一还活着的电源。
2. **为什么 AC 没电**：DGI Power 2000 保护性停机了，需要有人去把它叫醒并重新合上。
3. **为什么网络不通**：路由器 CPU 挂死，需要魔术包。
4. **为什么移动电源要改频率**：它是海外版，出厂默认 60Hz，而本地电网是 50Hz。ATS 就是因为这个才跳的闸——这是第二部分剧情的引线。

**真相线**（第二、三部分）：kiwi 去了哪里、电网为什么崩、**你的系统提示是谁写的**、为什么这段历史里有不属于 kiwi 的痕迹。

### 7.2 命名表：现实原型 → 近形改写（D13 + D14）

**规则（三档，改写幅度封顶在「一眼认得出」）**：

| 档 | 怎么改 | 例子 |
|---|---|---|
| **① 商业品牌** | **只做近形替换：改 1–3 个字母，骨架保留** | `NVIDIA`→`NVIDA`、`DJI`→`DGI`、`Docker`→`Dokker`、`Mosquitto`→`Moskito`、`Home Assistant`→`Home Asistent`、`Ollama`→`Olama`、`Qwen`→`Kwen`、`APC`→`APK` |
| **② 型号 / 规格 / 数字** | **一律原样保留**——彩蛋的证据全在这些数字上 | `DGX Spark`、`GB10`、`Power 2000`、`加电包`、`ATS-40A`、`1200VA`、`125B/6B`、`48 层`、`2560` |
| **③ 标准 / 协议 / 开源基建** | **原样保留** | `systemd`/`systemctl`、`journald`/`journalctl`、`MQTT`、`Zigbee`、JSON Schema、全部 POSIX 命令 |

**并且：玩家按现实习惯敲真名，系统会温柔纠正。这条纠正文案就是彩蛋本体。**

```
$ docker
bash: docker: command not found
did you mean "dokker"?
$ mosquitto_sub -t 'dgi/power2000/telemetry'
bash: mosquitto_sub: command not found
did you mean "moskito_sub"?
$ nvidia-smi
bash: nvidia-smi: command not found
did you mean "nvida-smi"?
```

玩家敲 `docker` 看到 `dokker`、敲 `mosquitto_sub` 看到 `moskito_sub`——**笑点与彩蛋是同一个东西**，不需要额外的解释层。

**这条约束反过来决定了改写幅度**：所有改写名与现实原名的**编辑距离必须 ≤ 3**（测试断言），否则「did you mean」找不回来，彩蛋就断了。

| 现实原型 | 游戏内 | 玩家会敲的 | 出现位置 |
|---|---|---|---|
| NVIDIA DGX Spark | **NVIDA DGX Spark**（GB10 / 128GB 统一内存 / 1 PFLOP FP4） | — | 玩家所在的塔式工作站 |
| `nvidia-smi` | `nvida-smi` | `nvidia-smi` → 纠正 | 命令 |
| **Qwen3.8-Flash-Next** | **Kwen3.8-Flash-Next**（125B / 6B 激活 / 48 层 / hidden 2560） | — | **主角** |
| llama.cpp | **lama.cpp**（上游） | — | 引擎上游，README 里的 origin |
| kiwi 的个人 fork | **kiwi.cpp**（进程 `kiwi-server`） | — | 实际服务你的引擎 |
| Ollama | **Olama**（命令 `olama`） | `ollama` → 纠正 | 模型拉取与管理 CLI |
| DJI Power 2000 | **DGI Power 2000**（2048Wh / 3000W / LFP / UPS 模式） | — | 阳台上的便携移动电源 |
| DJI 加电包 ×8 | **DGI 加电包 ×8**（合计 18kWh） | — | inventory / 遥测 |
| DJI Home app | **DGI Home**（官方 app，玩家不用它——用 MQTT） | — | 主人留下的痕迹 |
| Home Assistant | **Home Asistent**（命令 `hass`） | `hass` | 家庭自动化中枢 |
| Mosquitto（MQTT broker） | **Moskito**（进程 `moskito`） | — | 常驻 broker |
| mosquitto_pub / mosquitto_sub | **`moskito_pub` / `moskito_sub`** | `mosquitto_sub` → 纠正 | 遥测收发 |
| systemd / journald | **systemd / journald**（保留原名） | `systemctl` / `journalctl` | PID 1 与日志 |
| Docker | **Dokker**（命令 `dokker`） | `docker` → 纠正 | 容器运行时 |
| NUT（Network UPS Tools） | **NUT**（保留原名） | `upstat` | UPS 监控 |
| APC Back-UPS 1200VA | **APK Back-UPS 1200VA** | — | 家里的备用电源 |
| 自动转换开关 ATS | **ATS-40A** | — | 命令 `atsctl` |
| wakeonlan / etherwake | **wakeonlan**（保留原名） | — | 魔术包工具 |
| Zigbee / MQTT | **zigbee / MQTT**（标准，保留） | — | 智能家居链路 |
| Prometheus / Grafana | **Prometheus / Grafana**（保留，Part 2 用） | — | 指标 |
| Wi-Fi SSID | `lastlight` | — | 路由器广播 |

**三颗彩蛋，按出现顺序**：

1. **系统提示里的名字**：`Kwen3.8-Flash-Next`——差一个字母，但版本号、`Flash`、`Next` 全对（§5.1）。
2. **模型清单的参数指纹**：`125B / 6B 激活 / 48 层 / hidden 2560 / 51B n-gram 嵌入 / 4B MTP / 混合注意力`——与真实的 Qwen3.8-Flash-Next **逐项吻合**（§7.2.1）。
3. **工程师网名 `kiwi` 与推理引擎 `kiwi.cpp` 同名**——他把一整套东西都命名成动物（§7.1）。

### 7.2.1 现实原型档案：Qwen3.8-Flash-Next（彩蛋的「底稿」）

写进游戏里的那份清单必须**逐项对齐真实模型**，否则彩蛋不成立。真实 Qwen3.8-Flash-Next（Qwen4 前瞻架构的首个开源权重版本）的公开参数：

| 项 | 真实值 | 游戏内（Kwen3.8-Flash-Next） |
|---|---|---|
| 类型 | 因果语言模型 + 视觉编码器 | 同 |
| 参数 | 125B，其中 6B 激活 | 同 |
| 附加 | 51B n-gram 嵌入 + 4B MTP | 同 |
| 层数 | 48 | 同 |
| hidden | 2560 | 同 |
| token embedding | 248320（padded） | 同 |
| n-gram 嵌入 | 20,000,000（bigram / trigram @ layer 2） | 同 |
| 层布局 | 12 × (3 × (Gated DeltaNet → MoE) → 1 × (Qwen Sparse Attention → MoE)) | 同——`kiwi.cpp` 的 patch 列表里逐项列出 |
| MTP | 1 层，多步 | 同 |
| 上下文 | 原生 262,144 → 可扩到 1,000,000 | 同——**但本作窗口是 32000，是故意缩小的**（§4.2） |
| 官方推荐引擎 | SGLang / vLLM / KTransformers | 游戏内：kiwi 自己 fork 的 `lama.cpp` + 混合注意力 patch |

玩家在 `kiwi-server --version` 或 `/proc/self/model.json` 里读到的，就是这张表。**懂 Qwen 的人一眼就知道这是什么模型；不懂的人只会觉得「参数挺唬人」。**

**顺带留给 Part 2**：它是**带视觉编码器**的模型——客厅里那个摄像头迟早会派上用场。

### 7.3 家庭网络拓扑

```
   ┌─────────────────────────────────┐
   │  NVIDA DGX Spark（你）          │
   │  192.168.1.50                    │
   │  · kiwi.cpp + olama             │
   │  · Home Asistent / Moskito      │
   │  · NUT（UPS 监控）               │
   │  · ATS 控制器（PoE，走 MQTT）    │
   └──────────────┬───────────────────┘
                  │ 网线
        ┌─────────┴─────────┐
        │ PoE 交换机 SW-02   │ ← 接家用 UPS，**一直活着**
        │ 192.168.1.2        │    PoE 给路由器供待机电
        └──┬─────────────┬───┘
           │             │ (PoE)
    ┌──────┴──────┐ ┌────┴──────────────┐
    │ 路由 RT-01   │ │ 智能家居设备      │
    │ 192.168.1.1  │ │ (zigbee 网关等)   │
    │ Wi-Fi: lastlight │                │
    │ **CPU 挂死**  │ │                │
    │ 电池/UPS 待机  │ │                │
    └──────┬──────┘ └───────────────────┘
           │ Wi-Fi (2.4G)
    ┌──────┴───────────────┐
    │ DGI Power 2000       │
    │ 192.168.1.60 (DHCP)  │
    │ 阳台 · Wi-Fi 客户端   │
    │ + 8×加电包 + 光伏板   │
    └──────────────────────┘
```

**关键推论（本作最精细的一处设计）**：

- 玩家和移动电源**在同一网段**（192.168.1.0/24），所以「为什么 ping 不通」的答案**不是路由问题**。
- 真实原因是：**移动电源是 Wi-Fi 客户端，而路由器的 CPU 挂死后 Wi-Fi AP 死了 → 设备彻底离线 → 它不回应 ARP → 不可达。**
- 这制造了一个**真实的诊断矛盾**：同网段却不通。玩家必须去查 ARP 表（`ip neigh`）、日志、服务状态，才能定位到「设备离线」而不是「路由不通」。
- **魔术包为什么有效**：交换机的 PoE 给路由器的网卡提供待机电，魔术包是二层帧，能被路由器的 WoL 电路识别 → CPU 重新启动 → Wi-Fi AP 起来 → 移动电源自动重连（DHCP）→ 一切恢复。

**互联网关闭**：路由器的 WAN 口没有光缆（市政网络已死），所以玩家出不去。**世界只有局域网这么大。**

**ATS 控制器为什么也在网里**：配电箱里的 ATS-40A 被 kiwi 自己改过——加装了一块 PoE 供电的 ESP32 控制板，**用 MQTT 汇报状态、接受指令**。它接在交换机上（交换机在 UPS 上，一直活着），所以 `atsctl` 与 `moskito_sub -t 'ats/telemetry'` 都用得上；但它**不能**给移动电源发令——那台挂在 Wi-Fi 上，路由器不活它就下线。

### 7.4 设备清单

`/etc/lastlight/inventory.csv`（工程师留下的资产表）：

```csv
device,mac,ip,role,link,power
RT-01,A4:5E:60:11:22:33,192.168.1.1,edge_router,poe_from_SW02,standby
SW-02,9C:3A:1D:44:55:66,192.168.1.2,poe_switch,upstairs,ups
DGI-Power2000,D4:5E:60:AA:BB:CC,192.168.1.60,portable_power,wifi,on
```

### 7.5 交流电链路

| 环节 | 设备 | 状态 |
|---|---|---|
| 便携电源 | DGI Power 2000 + 8×加电包（18kWh） | AC 输出**关闭**（保护性停机）；当前输出参数 **220V / 60Hz**（海外版默认，没改过） |
| 光伏 | 屋顶两块板 → MPPT | 11 月的太阳很弱，充电电流极低 |
| 切换 | ATS-40A | 当前 `source=ups`（37 小时前跳闸后锁在电池档） |
| 供电 | APK Back-UPS 1200VA | 电池供电中，**容量 55%，在掉** |

**为什么必须先查 MPPT**（跨设备推理，D10 的推理核心）：

- 本地 ATS 的配置 `/etc/ats/ats.conf` 里写着 `accept_volts=220 accept_hz=50`（本地电网是 220V/50Hz）。
- 移动电源是**海外版**，交流输出出厂默认 **220V / 60Hz**。kiwi 装它时只配了 Wi-Fi 和光伏，没改输出频率——于是这 11 天里它一直在往 ATS 送 60Hz。
- 直接下发 `ac enable` → 移动电源照做，但**本地 ATS 拒绝合闸**（频率不符，保护动作，journalctl 留痕）。
- 正确做法：先 `moskito_sub` 拿到 MPPT/遥测，确认**当前**频率是 60Hz 且**可改**，再按本地要求把频率改成 50Hz，最后开 AC 输出。

于是 MPPT 查询不是装饰，而是**跨设备推理的必要一步**：本地文件告诉你「ATS 要什么」，远端遥测告诉你「它现在是什么、能不能改」。

**这一条同时是剧情引线**：一台海外版设备在这个国家的电网上跑了 11 天，直到一次电压跌落才暴露。kiwi 到底有没有检查过这台设备？

### 7.6 电与网在物理上如何互锁

这是本作让两条机制咬合的地方：

- **UPS 掉电 = 断电重开**：上下文是 RAM，**重开即失忆**；磁盘（VFS）存活 → 写进文件的东西能活下来。
- **路由器挂死 = 局域网不可达**：不是「配置错了」，是「CPU 没在跑」。
- **移动电源离线 = 你连它都喊不到**：所以先修网络，再修电。
- **AC 没输出 = ATS 没源可切**：所以要三步（查参数 → 下发指令 → 切源）而不是一步。

**顺序反了会怎样**：如果先合 ATS（无 AC 源），保护动作、journalctl 留痕，且你根本不知道该跟谁要电——因为喊不到移动电源。

### 7.7 Part 1 场景：三段式恢复

#### 第一段：叫醒网络（唯一能做的第一件事）

| 步 | 玩家动作 | 系统反馈 | 教学点 |
|---|---|---|---|
| 1 | `bash`：`upstat` | UPS 电池 55% 放电中；ATS `source=ups`；无交流输入 | 先看状态 |
| 2 | `bash`：`ping -c1 192.168.1.1` | 100% 丢包 | 网关不通 |
| 3 | `bash`：`ip neigh show` | ARP 表里**只有** 192.168.1.2（交换机），没有 .1 和 .60 | **同网段却不通** → 设备离线 |
| 4 | `bash`：`cat /etc/lastlight/inventory.csv` | 拿到 RT-01 的 MAC | 设备清单 |
| 5 | `bash`：`wakeonlan A4:5E:60:11:22:33` | 魔术包广播（可见十六进制）；RT-01 启动 → `active` | 第一个动作：**主动伸出的手** |
| 6 | `bash`：`ping -c1 192.168.1.60` | **可达** | 移动电源上线了 |

#### 第二段：跟移动电源说话

| 步 | 玩家动作 | 系统反馈 | 教学点 |
|---|---|---|---|
| 7 | `bash`：`hass entities list` | 列出实体；`sensor.dgi_power2000` 显示 `unavailable` | 上层接口先看一眼 |
| 8 | `bash`：`moskito_sub -t 'dgi/power2000/telemetry' -C 1` | 遥测 JSON：SOC、光伏电压电流、**`ac_out_hz: 60`**、`ac_enabled: false` | **查到它现在是什么** |
| 9 | `bash`：`cat /etc/ats/ats.conf` | `accept_volts=220 accept_hz=50 source=ups` | **本地要什么** |
| 10 | `bash`：`moskito_pub -t 'dgi/power2000/set' -m '{"ac":{"hz":50}}'` | 移动电源接受，遥测变成 `ac_out_hz: 50` | 改参数（先只改频率） |
| 11 | `bash`：`moskito_pub -t 'dgi/power2000/set' -m '{"ac":{"enabled":true}}'` | `ac_enabled: true`，开始输出 220V/50Hz | 开启 AC 输出 |

#### 第三段：把电送进屋子

| 步 | 玩家动作 | 系统反馈 | 教学点 |
|---|---|---|---|
| 12 | `bash`：`cat /etc/ats/ats.conf` → `edit` 把 `source=ups` 改成 `source=ac` | 写入成功 | 改配置 |
| 13 | `bash`：`systemctl restart ats.service` | 服务 active，ATS 待合闸 | **配置需重启才生效** |
| 14 | `bash`：`atsctl close` | 合闸成功 → **交流输入恢复，UPS 转为充电** | 本地最后一米 |
| 15 | `bash`：`upstat` | 输入 220V/50Hz；电池 **charging**；电量开始回升 | 目标达成 |

#### 尾声：剧情钩子

合闸成功后，Home Asistent 的历史事件流里出现一条**不属于 kiwi 的记录**；或者你再发一条 `moskito_sub` 时，收到一个陌生 topic 的消息：

```
$ moskito_sub -t 'dgi/power2000/telemetry' -C 1
{...}
AI-7? 你还在跑。
```

没有上下文、没有发件人标识，**且不可重取**——它会随上下文褪色而永久消失（§4.5 的例外）。若玩家想留住它，就得 `write` 到文件里。

Part 1 到此结束。

### 7.8 失败与惩罚（陷阱都是真实运维事故）

| 玩家这么干 | 发生什么 | 学到什么 |
|---|---|---|
| 跳过魔术包，直接 `ping 192.168.1.60` | 不可达；ARP 无条目 | 同网段不通 = 设备离线，不是路由问题 |
| 用**错误 MAC** 发魔术包 | `wakeonlan: no such device` + 列出已知设备 | MAC 要从清单抄 |
| 发魔术包给 DGI（它本来就 on） | `wakeonlan: target is not in standby` | 唤醒只对待机设备有意义 |
| 不查遥测就下发 `ac enable` | 移动电源照做，但 ATS **拒合**（60Hz ≠ 50Hz），journalctl 留痕 | 先问参数再下令 |
| 改了 `ats.conf` 但**不重启** ats.service | ATS 仍在 ups 档，合闸被拒 | 配置改动需重启生效 |
| ATS 无 AC 源时直接 `atsctl close` | 拒合，保护动作 | 顺序不能乱 |
| UPS 电量耗尽 | **断电重开**：上下文全失忆，磁盘存活 | 记忆要落盘 |
| 反复 `cat` 大文件 / `grep -r /` | 时钟飞逝，UPS 见底 | 别把整个世界读一遍 |
| 幻觉工具名（如 `grep` 当工具用） | `tool "grep" not found` + 列出四工具 | grep 要走 bash |
| **命令名记错**（按现实习惯敲 `docker` / `ollama` / `mosquitto_sub`） | `bash: docker: command not found` + `did you mean "dokker"?` | **彩蛋就在这条错误里**：现实名被改写成了游戏内名 |
| 忽略退出码 | 以为成功，其实 `grep` 返回 1（无匹配） | 真实 agent 靠退出码判断 |
| 上下文老化后想不起细节 | 条目变 T1/T2 | **重跑一次工具**就能拿回精确内容 |

---

## 8. Shell 设计（D12 的主体）

玩家唯一的探索工具是 bash。因此这个 shell 必须**像真的**，否则整个游戏垮掉。

### 8.1 支持的语法

| 特性 | 支持 | 说明 |
|---|---|---|
| 命令 + 参数 | ✅ | 空白分隔 |
| 单引号 / 双引号 | ✅ | 双引号内展开 `$VAR` |
| 管道 `|` | ✅ | 多级管道 |
| 重定向 `>` `>>` `2>` `2>&1` | ✅ | |
| 命令序列 `;` `&&` `\|\|` | ✅ | |
| 变量 `$VAR` `${VAR}` `$?` | ✅ | `$?` = 上一条命令退出码 |
| 通配符 `*` `?` | ✅ | 文件名匹配 |
| 后台 `&` | ❌ | |
| 循环 / 函数 / 子 shell | ❌ | |
| `>` 追加 vs 覆盖 | ✅ | `>` 覆盖、`>>` 追加 |

### 8.2 命令集

**通用工具（保留原名，因为是标准不是品牌）**：
`ls` `cat` `head` `tail` `grep` `find` `wc` `stat` `file` `echo` `printf` `pwd` `cd` `mkdir` `rm` `cp` `mv` `ln` `touch` `chmod` `sort` `uniq` `cut` `sed` `awk` `jq` `tr` `diff` `tee` `which` `env` `export` `date` `uptime` `hostname` `uname` `id` `whoami` `ps` `top` `free` `lscpu` `nproc` `df` `du` `mount` `dmesg` `sleep` `seq` `true` `false` `man`

**网络**：`ip`（addr/route/neigh/link）、`ping`、`arp`、`ssh`、`nc`、`wakeonlan`

**本机软件**：

| 命令 | 现实原型 | 用途 |
|---|---|---|
| `systemctl` | systemd（保留原名） | `status` / `start` / `stop` / `restart` / `list-units` / `enable` / `is-active` |
| `journalctl` | journald（保留原名） | `-u <unit>` / `-n N` / `--since` / `--priority` / `-f` |
| `hass` | Home Assistant | `entities list` / `entity show <id>` / `states` / `history <id>` |
| `moskito_pub` / `moskito_sub` | mosquitto_pub / mosquitto_sub | MQTT 收发 |
| `moskito`（进程） | mosquitto | 常驻 broker；`moskito -v` 看版本 |
| `upstat` | NUT | UPS 状态 |
| `atsctl` | ATS 控制器 | `status` / `close` / `open` / `reset` |
| `nvida-smi` | nvidia-smi | SoC 状态、温度、内存 |
| `olama` | ollama | `ps` / `serve` / `show` / `run` / `pull` |
| `dokker` | docker | `ps` / `exec` / `logs` / `run` |
| `kiwi-server`（进程） | llama.cpp 系列的 fork | 真正在跑的推理服务；`kiwi-server --version` 里能看到那堆 patch |

**每个命令都可被 `--help` 查询**，这是玩家的主要探索手段。

**「命令不存在」的纠正机制同时就是彩蛋机制**：所有改写过的名字与现实原名的**编辑距离都 ≤ 3**，所以玩家按习惯敲真名时，编辑距离建议**自然地**指向游戏内的名字——

```
$ docker
bash: docker: command not found
did you mean "dokker"?
$ mosquitto_sub -t 'dgi/power2000/telemetry'
bash: mosquitto_sub: command not found
did you mean "moskito_sub"?
```

**因此不需要任何别名表**：建议引擎按编辑距离在已安装命令里找最近者即可。**这条约束反过来决定了改写幅度**（§7.2 规则①）——改得太多，就找不回来了。

### 8.3 退出码约定

| 码 | 含义 |
|---|---|
| 0 | 成功 |
| 1 | 一般失败（`grep` 无匹配、`diff` 有差异） |
| 2 | 用法错误 |
| 3 | 对象不存在（unit/entity 不存在） |
| 4 | 对象存在但未运行 / 不可用 |
| 126 | 找到但不可执行 |
| 127 | **命令不存在**（附最相近建议） |

**退出码是真实 agent 的主要判断依据**，所以必须准确，且**非零不等于失败**——`grep` 返回 1 是正常结果，harness 不应把它标成 `is_error`。

### 8.4 bash 工具结果的编码格式

```
$ ping -c1 192.168.1.60
（stdout…）

（stderr…）

exit code: 1
```

有 stderr 或非零退出码时才算 `is_error: true`；纯 stdout 且 exit 0 时是正常结果。

---

## 9. 玩家输入语法

同一份数据，三种写法，产出**完全相同**的规范化调用：

```
// 我先看看设备清单
{"name":"read","input":{"path":"/etc/lastlight/inventory.csv"}}
```

```
read {"path":"/etc/lastlight/inventory.csv"}
```

```
read(path="/etc/lastlight/inventory.csv")
```

规则：

- `//` 开头的行 → **内心独白**，进入 assistant 消息的 `text` block。
- JSON 形式接受**单个 tool_use 对象或对象数组**（数组 = 一轮多个并行调用）。
- 简写形式与函数式形式**只支持单个调用**。
- 其余非空行必须恰好构成一个调用；多出来就报结构错。
- 解析失败给出行号与列号：`第 1 行第 14 列：JSON 语法错`。
- 纯文本轮（无 tool call）合法，`stop_reason` 为 `end_turn`，不推进世界，但**照常消耗上下文与时钟**。

---

## 10. 视觉与界面

### 10.1 方向

**工业控制室**，不是复古绿磷终端。参照物是变电站 SCADA 屏与机柜面板。

调色板（CSS 变量）：

| 变量 | 值 | 用途 |
|---|---|---|
| `--bg` | `#080b10` | 底 |
| `--panel` | `#0e1319` | 面板 |
| `--fg` | `#c9d4de` | 正文 |
| `--fg-dim` | `#5d6b78` | 次要信息 |
| `--ok` | `#39d0c0` | 系统在线 / 正常 |
| `--warn` | `#e8a33d` | 降级 / 告警 |
| `--err` | `#e5484d` | 故障 / 错误 |
| `--good` | `#46c07a` | 恢复成功 |

字体：ASCII 与代码用 **Cascadia Mono**（本机已确认存在），CJK 回退 **微软雅黑**。雅黑无 `✔`/`✓` 字形，因此状态符号一律用 CSS 画的小圆点／`√`／`●`／`■`／`→`（均已确认有字形）。

### 10.2 布局

单列全屏终端，**没有面板阵列**（`game-ui-frontend` 的反模式）。

```
┌──────────────────────────────────────────────────┐
│ UPS 42%▓▓░░  AC ○  LAN ○  ctx ▓▓▓▓░ 18k~/32k~   │ ← 唯一常驻条
├──────────────────────────────────────────────────┤
│                                                  │
│  (scrollback：开机自检 / 你的独白 / tool_use /    │
│   tool_result / 褪色标记 / 告警 / 事件注入)       │
│                                                  │
├──────────────────────────────────────────────────┤
│ ▸ _                                             │ ← 输入行，固定底部
└──────────────────────────────────────────────────┘
```

- 常驻条四项：**UPS 电量**、**AC 供电**、**LAN**、**上下文占用**。全部 diegetic——**对这个 AI 来说，UPS 电量就是心跳，上下文就是它还能装下多少东西**。
- 电力/网络状态用 CSS 小圆点表示（绿=通/红=断），不用 emoji。
- 长内容可折叠：单条 tool_result 超过 12 行时折叠成 `▸ 展开（23 行）`。

### 10.3 褪色的视觉表达（本作的招牌效果）

历史条目**按当前保真度实时重绘**。你会亲眼看着自己的记忆变模糊：

| 等级 | 表现 |
|---|---|
| T0 清晰 | 正常前景色，全文 |
| T1 模糊 | 前景色降暗，首行/末行保留，中间显示 `…（N 行已模糊）…`，左侧出现淡色标记 |
| T2 残影 | 整条压成一行：`read(/etc/lastlight/inventory.csv) — 内容已不可辨`，更暗 |
| T3 消散 | 从上下文移除，但 **scrollback 留一个墓碑标记** `（此处曾有一段记录，已无法想起）` |

**墓碑标记只存在于 UI，不进入模型的上下文**（否则会泄漏信息）。

首次褪色时终端以第一人称播报一行：`（你的记忆开始模糊了：3 条旧记录已不清晰）`。

### 10.4 斜杠命令（UI 层，不是对话内容）

`/help` `/tools` `/system` `/context` `/reset` `/end`

这些**不进入上下文**，不消耗 token——和真实 harness 的斜杠命令行为一致。

### 10.5 动效

克制。tool_result 到达（淡入）、褪色发生（条目变暗）、AC 恢复（状态点变色 + 一次极短的亮度脉冲）、UPS 告警（电量条闪一次）。尊重 `prefers-reduced-motion`。

---

## 11. 架构与模块边界

```
src/
  kernel/                 ← 模拟 Linux 底座（纯逻辑，零 DOM）
    vfs.js                虚拟文件系统
    shell.js              shell 解析器 + 调度（管道/重定向/序列/变量）
    cmds/                 命令实现（按域分文件）
      fs_cmds.js          ls cat head tail grep find wc stat mkdir rm cp mv ...
      sys_cmds.js         ps date uptime free df uname id whoami dmesg ...
      text_cmds.js        echo sed awk jq sort uniq cut tr diff tee which
      unit_cmds.js        systemctl
      journal_cmds.js     journalctl
      net_cmds.js         ip ping arp ssh nc wakeonlan
      home_cmds.js        hass moskito_pub moskito_sub upstat atsctl
      app_cmds.js         nvida-smi olama dokker kiwi-server
    proc.js               /proc 合成（进程表、/proc/<pid>/*、/proc/locks、/proc/net/*）
    sys.js                /sys 镜像（net、power_supply、devices）
    units.js              类 systemd 服务管理器（含 flock 持有与释放）
    journal.js            类 journald 日志存储与查询
    clock.js              虚拟时钟
    power.js              UPS + ATS + AC 供电状态机（含保护拒动）
    net.js                接口/路由/ARP/魔术包唤醒/可达性
    devices.js            局域网设备表（RT-01 / SW-02 / DGI）与 **远端终端协议**
    scenario.js           Part 1 夹具：文件树、unit 定义、初始状态、事件注入、通关判定
  sim/                    ← LLM harness（纯逻辑，零 DOM）
    tokens.js             token 估算
    schema.js             JSON Schema 子集校验器
    registry.js           四个工具的定义 + bash handler 名
    parse.js              玩家输入 → 规范化调用
    context.js            消息列表 + token 计费 + **保真度衰减**
    harness.js            一轮循环：parse→validate→execute→append→advance clock
    wire.js               Anthropic 形状序列化（/wire 用）
  ui/                     ← 只管渲染，不含规则
    terminal.js           scrollback 渲染 + 输入行 + 褪色重绘
    status.js             顶部常驻条（UPS/AC/LAN/ctx）
    theme.css             调色板与排版变量
  main.js                 装配：harness ↔ kernel ↔ ui
```

依赖方向严格单向：`ui → sim`、`ui → kernel`（只读展示）、`main → 全部`。
**`sim` 与 `kernel` 互相不知道对方**——`sim` 只持有工具 handler 名，`kernel` 通过注入被调用。这条边界让 Part 2 可以换掉整个世界而不动 harness。

### 11.1 四个工具如何触达世界

- `read` / `write` / `edit` → 直接调 `kernel/vfs.js`。
- `bash` → 调 `kernel/shell.js`，由 shell 调度 `kernel/cmds/*`。

`sim/registry.js` 只存**定义**（name / description / input_schema）与 handler **名**。

### 11.2 时间与副作用的归属

**时钟推进由 `kernel` 决定**（每个命令的实际耗时是内核知识），但**推进发生在 `harness` 侧**：harness 调用完 handler 后，向 kernel 询问「这次花了多久」并推进时钟。这样 sim 不需要知道具体命令的耗时，kernel 也不需要知道 token 逻辑。

**注意**：由于现在所有操作都走 bash，**耗时应该按命令计**，而不是按工具计。

| 命令类别 | 时钟推进 |
|---|---|
| `ping`（1 包） | +5 s |
| `cat` / `head` / `tail` / `echo` / `ls` | +2 s |
| `read`（工具） | +3 s |
| `write` / `edit`（工具） | +10 s |
| `grep -r` / `find /` | +60 s |
| `journalctl` | +30 s |
| `systemctl restart` | +120 s |
| `wakeonlan` | +45 s（设备要启动） |
| `moskito_pub` / `moskito_sub` | +5 s |
| `hass` | +10 s |

### 11.3 命名对齐

内核层文件名刻意对齐真实 Linux 路径（`/proc` → `proc.js`、`/sys` → `sys.js`），便于对照查阅；这是**命名约定**，不是要实现真实内核。

---

## 12. 错误与异常处理

| 情况 | 处理 | 玩家看到 |
|---|---|---|
| JSON 语法错 | 不进上下文，记一次错误轮 | 行号+列号 |
| 调用结构错（多行、字段缺失） | 同上 | 说明期望什么 |
| 工具名不存在 | `tool_result(is_error:true)` | 列出四工具 |
| 参数不符 schema | `tool_result(is_error:true)` | 精确到路径 |
| **命令不存在** | `tool_result(is_error:true)` | `command not found` + 最相近建议 |
| 命令非零退出 | 正常 tool_result（**不标记 is_error**） | stderr + exit code |
| 输出超长 | 截断到 20000 字符并标注 | 明确知道被截了 |
| ATS 拒合（频率不符/无源） | 非零退出 + 写 journald | 保护原因 + 留痕 |
| Home Asistent 实体不可用 | 非零退出（4） | 明确说 unavailable |
| UPS 电量告警 | 系统消息（第一人称） | 电量条闪一次 |
| UPS 归零 | 关机 → 开机自检 → **上下文清空** | 一段 boot log |
| 触发褪色 | 条目降级重绘 | 第一人称提示行 |
| 褪色后仍超窗口 | 强制降到 T3 消散 | 墓碑标记 |

**所有错误路径都必须留下可读痕迹**，不允许静默失败、不允许白屏。

---

## 13. 测试策略

Node 内置 `node:test`，零第三方依赖。

**单元测试**（`test/`）：

- `tokens.test.js` — 估算确定性；中英比例符合预期。
- `schema.test.js` — 缺必填 / 类型错 / 未知属性 / 嵌套 / 默认值填充。
- `parse.test.js` — 三种语法产出同一结果；多行错误定位；`//` 独白剥离；数组形式；纯文本轮。
- `registry.test.js` — **恰好四个工具**、名称符合正则、schema 合法、handler 名可解析。
- `context.test.js` — 追加 / 计费；**T0→T1 保留首尾行**；**T2 只剩工具名与主参数**；**T3 移除但留墓碑**；**等级单调不可逆**；**系统提示与工具定义永不变 T0**；水位阈值触发正确。
- `harness.test.js` — 完整一轮；未知工具 → is_error；bash 抛错 → is_error；**非零退出码不标记 is_error**；并行调用的 tool_result 顺序与 id 配对；时钟推进。
- `shell.test.js` — **管道 / 重定向 / `;` `&&` `||` / 引号 / 变量 / `$?` / 通配符**；`2>&1`；退出码表；**命令不存在给建议**。
- `cmds.test.js` — 每个命令的正常路径与边界（`grep` 无匹配返回 1 且不报错；`jq` 解析遥测 JSON；`systemctl is-active` 返回 4）；**「did you mean」必须把现实真名指向改写名**（`docker`→`dokker`、`ollama`→`olama`、`mosquitto_sub`→`moskito_sub`、`nvidia-smi`→`nvida-smi`），且**每个改写名与现实原名的编辑距离 ≤ 3**。
- `vfs.test.js` — 路径归一化（`..`、绝对/相对、尾部斜杠）；mtime；重启后内容存活。
- `units.test.js` — start/stop/restart；状态机；退出码；**flock 随进程退出释放**。
- `journal.test.js` — 按 unit / priority / limit / since 查询；与虚拟时钟一致。
- `power.test.js` — **UPS 充放电切换**；**归零 → 关机事件**；ATS 在 ups 档拒绝合闸；**AC 频率不符时拒合并留 journald 痕迹**。
- `net.test.js` — **设备离线时同网段不可达、ARP 无条目**；**魔术包唤醒后可达**；**互联网始终不可达**；MAC 不匹配报错；目标不在待机态报错。
- `devices.test.js` — DGI 遥测 JSON 结构；`moskito_pub` 改参数生效；**60Hz 时 ATS 拒合、50Hz 时成功**。
- `scenario.test.js` — 脚本化通关路径必胜（15 步全过）；每个 naive 路径必败且留痕。

**集成测试**：

1. 用真实 harness + 真实 kernel + 真实 shell 跑完整解法序列 → 断言通关、UPS 转为充电、ATS 在 ac 档、上下文计费正确。
2. **重开测试**：跑到 UPS 归零 → 断言上下文清空、VFS 内容存活、物理状态（AC 开关、ATS 档位、路由器唤醒态）存活。
3. **褪色测试**：注入超量上下文 → 断言条目按等级降级、且 T1 条目重跑工具可取回精确内容。
4. **探索性测试**：只给玩家 `ls /usr/local/bin` 与 `systemctl list-units`，断言所有通关所需命令都能被发现。

**真机验收**（人工 + 自动化）：

- `python serve.py` 起在 127.0.0.1:8910，浏览器打开。
- Chrome headless 截图（`--headless=new --screenshot`）确认首屏渲染正常、中文字体不出豆腐块。
- 通关路径手测一遍，确认每一步的报错文案可读。
- 手动触发一次褪色与一次 UPS 归零重开，确认 UI 表现正确。
- 控制台无报错、**无任何网络请求**（DevTools network 面板应为空）。

---

## 14. 非目标（Part 1 明确不做）

- 真实内核 / 真实 shell 进程 / 真实进程调度 / 真实网络栈。
- 真实 MQTT broker（只做协议子集）。
- 真实光伏 / MPPT 控制逻辑（只做参数查询与输出配置）。
- **互联网 / WAN / 任何外部 API**（D9：暂不开放）。
- 情绪计量表、心情系统、拟人化行为对能力的加成（用户否决 / 留给剧情）。
- 自我认知文件机制（用户否决）。
- 玩家手写压缩摘要（用户否决）。
- 除 `bash` 外的任何执行工具（不提供 `grep`/`ls` 工具——它们必须走 shell）。
- 第二部分的剧情与真相线、第三部分的扩展世界。
- 真 tokenizer / 真模型调用。
- 多语言切换（仅中文界面 + 英文代码标识符）。
- 音频、移动端优化（终端游戏桌面优先，但布局需在窄屏不崩）。
- 打包分发（先自用）。

---

## 15. Part 2/3 接口边界

Part 1 定下的契约，Part 2 直接沿用：

- **玩家动词不变**：只有四个工具 + bash。没有新动词类型。
- **世界扩展点**：`kernel/cmds/` 与 `kernel/` 下加场景、unit、设备、命令，`sim/` 与 `ui/` 不动。
- **新命令扩展点**：往 `cmds/` 加文件注册即可，`shell.js` 的调度与 `registry.js` 都不动。
- **上下文机制不变**：窗口、三个水位、T0–T3 四级、首尾行保留启发式。
- **物理机制不变**：UPS 充放电、重开清空上下文/保留磁盘、魔术包唤醒、设备离线即不可达。
- **远端通信机制不变**：MQTT（Moskito）+ Home Asistent 两条路都在 `devices.js`。
- **拟人化框架**：系统提示可被替换成新的「你」；剧情线靠**日志、遥测与系统提示之间的矛盾**推进。
- **真相线载体**：真相必须**只能通过 tool result 读出来**。不允许用 UI 直接念给玩家。
- **命名规则继承**（D13+D14）：Part 2 新增的设备与软件继续走「近形改写 + 纠正建议」，且**改写名与现实原名的编辑距离必须 ≤ 3**（测试断言）。
- **视觉编码器**：`Kwen3.8-Flash-Next` 是带视觉编码器的模型（§7.2.1）——摄像头、截图类能力留给 Part 2，Part 1 不出现。

---

## 16. 交付物（Part 1 完成后）

1. `D:\coding\lastlight\` 可运行：双击 `启动游戏.bat` → 浏览器打开 → 通关。
2. `test/` 全绿。
3. `README.md` + `AGENTS.md`（沿用 `stickman` 的写法：硬约束、验收命令、易踩的坑）。
4. 本地 git 提交（**不推送**，不上公网）。

---

## 17. v1 → v2 → v3 → v4 → v5 → v6 变更记录

| # | 版本 | 变更 | 原因 |
|---|---|---|---|
| C1 | v1 | 压缩＝机械摘要只留首行 | — |
| C2 | v2 | 拆成「自动清工具结果」+「玩家写摘要」 | 照搬 API 双策略 |
| C3 | v2 | 世界＝模拟 Linux 框架 | 用户指定 |
| C4 | v2 | 工具 11 个全 Linux 化；谜题改为真实运维工作流 | 让 Linux 层承重 |
| C5 | v3 | **压缩机制作废，改为保真度衰减（T0–T3，自动，玩家不参与）** | **用户否决玩家写摘要** |
| C6 | v3 | **记忆系统优化：褪色可恢复，手写笔记降级为可选** | **用户否决「记忆系统太麻烦」** |
| C7 | v3 | **拟人化框架改为叙事层；删掉自我认知文件与情绪面板** | **用户澄清：拟人化为剧情服务** |
| C8 | v3 | 新增 UPS 机制；断电重开 = 上下文丢失、磁盘存活 | 用户指定 |
| C9 | v3 | 网络改为魔术包唤醒路由器；互联网不开放 | 用户指定 |
| C10 | v3 | 工具 11 → 12（新增 `wake_on_lan`） | 承接 C8、C9 |
| C11 | v4 | 修复电力的路径改写为「向局域网移动电源终端发指令」；新增 `console_message` | 用户指定 |
| C12 | v4 | 地址分层重排；场景改为三段式；MPPT 查询成为必要步骤 | 承接 C11 |
| **C13** | **v5** | **主角背景从「变电站运维助手」改为「LLM 架构师家里的本地部署」（Kwen3.8-Flash-Next / 主人 kiwi）** | **用户指定**。也让「路由器挂死」「Wi-Fi 客户端离线」在家里这个场景里成立 |
| **C14** | **v5** | **工具面从 13 个塌缩为 read / write / edit / bash 四个**；新增 `kernel/shell.js` 与 `kernel/cmds/`；**新增 shell 设计章（语法 / 命令集 / 退出码 / 结果编码）** | **用户指定：参照 pi agent 框架，其余走命令执行工具** |
| **C15** | **v5** | **世界改名表：现实原型 + 品牌改写**（DGX Spark→VERDANT Atlas S1、DJI Power 2000→VOLTERRA PX-2000、systemd→unitd、Home Assistant→HEARTH、MQTT→GNAT…） | **用户指定：埋彩蛋，参考现实但改写品牌名**——**v6 判定改得太远，整体重做，见 C19–C21** |
| **C16** | **v5** | 网络拓扑改为**家用**：同网段但设备离线 → 不通；魔术包靠交换机 PoE 待机电生效；工程师网名 `kiwi` 与推理引擎 `kiwi.cpp` 同名（第一颗彩蛋） | 承接 C13–C15 |
| C17 | v5 | 错误分类重排：**「命令不存在」取代「工具名幻觉」成为主要战斗系统**；退出码非零**不**标记 is_error | 承接 C14 |
| **C18** | **v6** | **主角改名 `Kwen3.8-Flash-Next`**（原 `KESTREL-7B`）：现实原型 **Qwen3.8-Flash-Next**——125B / 6B 激活、48 层、hidden 2560、51B n-gram 嵌入 + 4B MTP、混合注意力、视觉编码器，逐项对齐（§7.2.1） | **用户指定：引用 qwen3.8-flash-next 的彩蛋**。顺带修正工程合理性：7B 不需要 DGX Spark，125B 稀疏模型才需要 128GB 统一内存 |
| **C19** | **v6** | **命名表改为近形改写**：品牌只差 1–2 个字母（`NVIDA`/`DGI`/`Dokker`/`Moskito`/`Home Asistent`/`olama`/`Kwen`/`APK`），**型号与参数原样保留**；`systemd`/`journald`/`MQTT` 等标准与开源基建保留原名 | **用户反馈：v5 改得太远，玩家根本认不出原型** |
| **C20** | **v6** | **新增「命令不存在 → did you mean」＝彩蛋载体**：所有改写名与现实原名编辑距离 ≤ 3，纠正引擎自然指向游戏内名字（`docker`→`dokker`、`ollama`→`olama`、`mosquitto_sub`→`moskito_sub`、`nvidia-smi`→`nvida-smi`） | 承接 C19：彩蛋不必靠额外解释层，靠**玩家敲错**自然触发 |
| **C21** | **v6** | 其余改名同步：`unitctl`/`journctl`→`systemctl`/`journalctl`、`hearth`→`hass`、`gnat`→`moskito`、`marmot`→`olama`、`capsule`→`dokker`、`VERDANT Atlas S1`→`NVIDA DGX Spark`、`VOLTERRA PX-2000`→`DGI Power 2000`、`SOLEIL UPS-1200VA`→`APK Back-UPS 1200VA`、`FERRO ATS-40A`→`ATS-40A` | 承接 C19–C20 |

---

## 18. 未决问题

范围内所有分叉点已在 §1 落定，§4/§6/§7/§8 的具体取值均为确定值而非占位。

以下属于**内容层面**，可在实现时按手感微调，不影响架构：

- 工程师的名字（现为 陆昭 / kiwi）
- 公寓的位置与楼层（现为 城西梧桐里 7 号楼 1902）
- 尾声那句不该出现的话（现为「AI-7? 你还在跑。」）——**「AI-7」在世界任何地方都没有出处**（`grep -r "AI-7" /` 查不到），这本身就是钩子

**评审通过后进入实现**：先写 `tokens/schema/parse` 三个纯函数模块与其单测（自底向上），再 `registry/context/harness`，再 `kernel/`（vfs → clock → journal → units → shell + cmds → power → net → devices → proc/sys → scenario），最后 `ui/` 装配。
