export class Devices {
  constructor(net, journal) {
    this.net = net;
    this.journal = journal;
    this.ac = { hz: 60, volts: 220, enabled: false };
    this.hookSent = false;
  }
  telemetry() {
    if (!this.net.awake)
      throw new Error(
        "DGI-Power2000: unavailable (Wi-Fi client offline; no ARP response)",
      );
    return {
      device: "DGI Power 2000",
      capacity_wh: 2048,
      expansion_packs: 8,
      total_capacity_wh: 18000,
      soc: 71,
      mppt: { pv_volts: 38.4, pv_amps: 0.8, pv_watts: 30.72 },
      ac_out_hz: this.ac.hz,
      ac_out_volts: this.ac.volts,
      ac_enabled: this.ac.enabled,
      configurable_hz: [50, 60],
      rated_watts: 3000,
    };
  }
  set(payload) {
    this.telemetry();
    if (!payload || !payload.ac || Object.keys(payload).some((k) => k !== "ac"))
      throw new Error('Expected {"ac":{"hz":50,"enabled":true}}');
    const ac = payload.ac;
    for (const k of Object.keys(ac))
      if (!["hz", "volts", "enabled"].includes(k))
        throw new Error(`Unknown AC property: ${k}`);
    if ("hz" in ac && ![50, 60].includes(ac.hz))
      throw new Error("ac.hz must be 50 or 60");
    if ("volts" in ac && ac.volts !== 220)
      throw new Error("ac.volts must be 220");
    if ("enabled" in ac && typeof ac.enabled !== "boolean")
      throw new Error("ac.enabled must be boolean");
    Object.assign(this.ac, ac);
    this.journal.add(
      "moskito.service",
      "DGI-Power2000 acknowledged AC configuration",
    );
    return "ACK " + JSON.stringify(this.ac);
  }
}
