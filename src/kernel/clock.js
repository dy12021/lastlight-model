export class Clock {
  constructor() {
    this.seconds = 0;
    this.epoch = Date.parse("2026-11-03T02:14:00Z");
  }
  advance(seconds) {
    this.seconds += seconds;
  }
  get iso() {
    return new Date(this.epoch + this.seconds * 1000).toISOString();
  }
}
