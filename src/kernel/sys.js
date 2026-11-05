export function mountSys(k) {
  k.vfs.synth("/sys/class/power_supply/ups/capacity", () =>
    k.power.battery.toFixed(1),
  );
  k.vfs.synth("/sys/class/power_supply/ups/status", () =>
    k.power.charging ? "Charging" : "Discharging",
  );
  k.vfs.synth("/sys/class/net/eth0/operstate", () => "up");
  k.vfs.synth("/sys/devices/ats/source", () => k.power.source);
}
