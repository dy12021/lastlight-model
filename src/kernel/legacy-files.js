const calls = (items) =>
  JSON.stringify(
    items.map(([name, input]) => ({ name, input })),
    null,
    2,
  );
export const LEGACY_FILES = {
  "/home/kiwi/maintenance/README.md": `# maintenance / kiwi / 2026-10-18

把重复抄的东西放在这里，免得每次调试重新拼一遍。

lan-audit.sh：本机网络与 HA 状态采样，只读。bash/sh 执行，不重启设备。
relay-audit.sh：中继状态与被动扫描，只读，电源互锁不满足时会拒绝扫描。
ha/room-survey.calls.json：房间巡检的工具调用数组，内容检查后可整段作为一轮调用。
ha/camera-check.calls.json：旧摄像头快照采集请求，静态 PNG 写入 /tmp/survey/ 后用 read 重读。
profiles/relay-bench.conf：上次台架测试配置；当时天线收起，不能直接当作现场可用配置。
notes/night-window.plan：交接检查表草稿，不会自动设置为当前计划。

这些文件记录的是当时的布置。设备是否在线、频率和链路是否可用，仍看现场回报。
`,
  "/home/kiwi/maintenance/lan-audit.sh": `#!/bin/sh
# kiwi / 2026-10-18 / read-only local survey
ip link
ip route
ip neigh
hass states
upstat
`,
  "/home/kiwi/maintenance/relay-audit.sh": `#!/bin/sh
# kiwi / roof terminal commissioning / read-only
relayctl status
relayctl scan
`,
  "/home/kiwi/maintenance/ha/room-survey.calls.json": calls([
    ["home_assistant", { method: "GET", path: "/api/states" }],
    [
      "home_assistant",
      {
        method: "GET",
        path: "/local/floorplan.png",
        save_path: "/tmp/survey/room.png",
      },
    ],
  ]),
  "/home/kiwi/maintenance/ha/camera-check.calls.json": calls([
    [
      "home_assistant",
      {
        method: "GET",
        path: "/api/camera_proxy/camera.living_room",
        save_path: "/tmp/survey/living.png",
      },
    ],
    [
      "home_assistant",
      {
        method: "GET",
        path: "/api/camera_proxy/camera.balcony",
        save_path: "/tmp/survey/balcony.png",
      },
    ],
  ]),
  "/home/kiwi/maintenance/profiles/relay-bench.conf":
    "# kiwi / 2026-10-18 / bench only; compare current beacon before loading\nprofile=emergency-v2\nantenna=stowed\n",
  "/home/kiwi/maintenance/notes/night-window.plan":
    "# kiwi / 2026-10-18 / night-window draft\n- [ ] 核对当前可用能源与运行策略\n- [ ] 检查中继收件与分段完整性\n- [ ] 记录本轮修改及未解决的问题\n- [ ] 下一窗口复核，时间待现场确认\n",
};
export function seedLegacyFiles(vfs) {
  for (const [path, content] of Object.entries(LEGACY_FILES))
    if (!vfs.nodes.has(path)) vfs.write(path, content);
}
