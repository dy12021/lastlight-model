export function renderStatus(k, h) {
  const set = (id, text) => (document.getElementById(id).textContent = text);
  const cwd =
    k.vfs.cwd === "/home/kiwi"
      ? "~"
      : k.vfs.cwd.startsWith("/home/kiwi/")
        ? "~" + k.vfs.cwd.slice(10)
        : k.vfs.cwd;
  set("prompt", `kwen@lastlight:${cwd}>`);
  set(
    "power-status",
    `UPS ${k.power.battery.toFixed(1)}% ${k.power.charging ? "charging" : "discharging"} | AC ${k.power.charging ? "ON" : "OFF"}`,
  );
  set("network-status", `LAN ${k.net.awake ? "online" : "offline"}`);
  set("context-status", `ctx ~${h.context.used.toLocaleString()} / 32,000`);
  set("turn-status", `turn ${h.turn}`);
  document.getElementById("power-status").className = k.power.charging
    ? "charging"
    : k.power.battery <= 20
      ? "warning"
      : "";
}
