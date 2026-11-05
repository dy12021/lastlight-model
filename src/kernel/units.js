export class Units {
  constructor(journal) {
    this.journal = journal;
    this.table = new Map();
    this.locks = new Map();
    this.nextPid = 100;
  }
  add(name, { active = true, lock = null, start = () => {} } = {}) {
    this.table.set(name, {
      name,
      active,
      pid: active ? ++this.nextPid : null,
      lock,
      start,
      enabled: true,
    });
    if (active && lock) this.locks.set(lock, name);
  }
  action(action, name) {
    const u = this.table.get(name);
    if (!u) return { code: 3, text: `Unit ${name} not found` };
    if (action === "status" || action === "is-active")
      return {
        code: u.active ? 0 : 4,
        text:
          action === "is-active"
            ? u.active
              ? "active"
              : "inactive"
            : `${name}\n  Active: ${u.active ? "active (running)" : "inactive (dead)"}\n  Main PID: ${u.pid ?? "—"}`,
      };
    if (action === "enable") {
      u.enabled = true;
      return { code: 0, text: `Enabled ${name}` };
    }
    if (!["start", "stop", "restart"].includes(action))
      return { code: 2, text: "systemctl: unknown action" };
    if (action === "stop" || action === "restart") {
      u.active = false;
      u.pid = null;
      if (u.lock) this.locks.delete(u.lock);
      this.journal.add(name, "Stopped");
    }
    if (action === "start" || action === "restart") {
      if (u.active) return { code: 0, text: `${name} already active` };
      try {
        u.start();
        if (u.lock && this.locks.has(u.lock))
          throw new Error("flock: Resource temporarily unavailable");
        u.active = true;
        u.pid = ++this.nextPid;
        if (u.lock) this.locks.set(u.lock, name);
        this.journal.add(name, "Started");
      } catch (e) {
        this.journal.add(name, e.message, 3);
        return { code: 1, text: e.message };
      }
    }
    return {
      code: 0,
      text: `${name}: ${u.active ? "active; configuration loaded" : "inactive"}`,
    };
  }
}
