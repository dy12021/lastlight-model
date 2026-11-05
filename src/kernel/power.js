export class Power {
  constructor(devices, journal) {
    this.devices = devices;
    this.journal = journal;
    this.battery = 55;
    this.source = "ups";
    this.closed = false;
    this.acceptHz = 50;
    this.acceptVolts = 220;
    this.boots = 0;
    this.warned = false;
  }
  get charging() {
    return (
      this.closed &&
      this.source === "ac" &&
      this.devices.ac.enabled &&
      this.devices.ac.hz === this.acceptHz &&
      this.devices.ac.volts === this.acceptVolts
    );
  }
  load(config) {
    const get = (k) =>
      config.match(new RegExp(`(?:^|\\s)${k}=([^\\s#]+)`))?.[1];
    const source = get("source"),
      hz = Number(get("accept_hz")),
      volts = Number(get("accept_volts"));
    if (!["ups", "ac"].includes(source) || hz !== 50 || volts !== 220)
      throw new Error(
        "ats.conf: expected source=ups|ac accept_hz=50 accept_volts=220",
      );
    this.source = source;
    this.acceptHz = hz;
    this.acceptVolts = volts;
    this.journal.add("ats.service", `Configuration loaded: source=${source}`);
  }
  close() {
    let reason;
    if (this.source !== "ac")
      reason = "source=ups; edit ats.conf and restart ats.service";
    else if (!this.devices.ac.enabled)
      reason = "no AC source; portable power AC output disabled";
    else if (this.devices.ac.hz !== this.acceptHz)
      reason = `frequency mismatch: ${this.devices.ac.hz}Hz != ${this.acceptHz}Hz`;
    else if (this.devices.ac.volts !== this.acceptVolts)
      reason = "voltage mismatch";
    if (reason) {
      this.journal.add("ats.service", "PROTECTION: " + reason, 3);
      throw new Error("ATS refused: " + reason);
    }
    this.closed = true;
    this.journal.add(
      "ats.service",
      "AC contactor closed. 220V/50Hz. UPS charging.",
    );
    return "ATS closed. AC input restored: 220V / 50Hz. UPS charging.";
  }
  advance(seconds) {
    const events = [];
    this.battery = Math.max(
      0,
      Math.min(100, this.battery + seconds * (this.charging ? 0.006 : -0.012)),
    );
    if (this.battery <= 20 && !this.warned) {
      events.push({
        type: "warning",
        text: "我剩下的电量不足 20%。我需要交流电。",
      });
      this.warned = true;
    }
    if (this.battery === 0) {
      this.boots++;
      this.battery = 55;
      this.warned = false;
      this.journal.add(
        "kernel",
        "Unclean shutdown: power lost. Volatile memory unavailable.",
        2,
      );
      events.push({
        type: "reboot",
        text: "Power lost.\nPOST: NVIDA DGX Spark\n/dev/nvme0n1p2: recovering journal\nkiwi.service: started\nContext: empty.",
      });
    }
    return events;
  }
  status() {
    return `APK Back-UPS 1200VA\nbattery: ${this.battery.toFixed(1)}%\nstate: ${this.charging ? "charging" : "discharging"}\ninput: ${this.charging ? "220V / 50Hz" : "none"}\nATS source=${this.source} contactor=${this.closed ? "closed" : "open"}`;
  }
}
