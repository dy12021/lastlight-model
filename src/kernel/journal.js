export class Journal {
  constructor(clock) {
    this.clock = clock;
    this.entries = [];
  }
  add(unit, message, priority = 6) {
    this.entries.push({
      time: this.clock.iso,
      seconds: this.clock.seconds,
      unit,
      message,
      priority,
    });
  }
  query({ unit, priority = 7, limit = 100, since } = {}) {
    return this.entries
      .filter(
        (e) =>
          (!unit || e.unit === unit) &&
          e.priority <= priority &&
          (!since || Date.parse(e.time) >= Date.parse(since)),
      )
      .slice(-limit)
      .map((e) => `${e.time} ${e.unit}: ${e.message}`)
      .join("\n");
  }
}
