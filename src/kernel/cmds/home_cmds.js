import { ok, fail } from "../shell.js";
export function install(k, s) {
  const reg = (n, h, f) => s.register(n, h, f);
  const broker = () => {
    if (!k.units.table.get("moskito.service").active)
      throw new Error("MQTT broker unavailable; start moskito.service");
  };
  reg("upstat", "upstat — NUT UPS status", () => ok(k.power.status()));
  reg("atsctl", "atsctl status|close|open|reset — local AC contactor", (a) => {
    if (a[0] === "status") return ok(k.power.status());
    if (!k.units.table.get("ats.service").active)
      return fail("ats.service inactive", 4);
    if (a[0] === "close")
      return ok(
        k.power.close() +
          (k.story
            ? "\nroof relay: power interlock released; relay.service / /etc/relay/link.conf"
            : ""),
      );
    if (["open", "reset"].includes(a[0])) {
      k.power.closed = false;
      k.journal.add("ats.service", "Contactor opened");
      return ok("ATS contactor open");
    }
    return fail("atsctl: expected status|close|open|reset", 2);
  });
  reg(
    "moskito_sub",
    "moskito_sub -t TOPIC [-C 1] — retained snapshot; topics: dgi/power2000/telemetry, ats/telemetry",
    (a) => {
      broker();
      const topic = a[a.indexOf("-t") + 1];
      if (topic === "ats/telemetry")
        return ok(
          JSON.stringify({
            source: k.power.source,
            closed: k.power.closed,
            charging: k.power.charging,
          }),
          5,
        );
      if (topic !== "dgi/power2000/telemetry")
        return fail("MQTT: unknown topic (no retained message)", 3, 5);
      let text = JSON.stringify(k.devices.telemetry(), null, 2);
      return ok(text, 5);
    },
  );
  reg(
    "moskito_pub",
    `moskito_pub -t dgi/power2000/set -m '{"ac":{"hz":50}}' — set hz, volts, enabled`,
    (a) => {
      broker();
      const topic = a[a.indexOf("-t") + 1],
        message = a[a.indexOf("-m") + 1];
      if (topic !== "dgi/power2000/set")
        return fail("MQTT: unknown writable topic", 3, 5);
      return ok(k.devices.set(JSON.parse(message)), 5);
    },
  );
  reg(
    "hass",
    "hass entities list | entity show ID | states | history ID — Home Asistent",
    (a) => {
      if (!k.units.table.get("hass.service").active)
        return fail("Home Asistent inactive", 4);
      if (a[0] === "history")
        return ok(k.journal.query({ unit: "hass.service" }), 10);
      if (a[0] === "entities" || a[0] === "states")
        return ok(
          k.home
            .states()
            .map((e) => `${e.entity_id} ${e.state}`)
            .join("\n") + "\nAPI inventory: /etc/home-assistant/devices.json",
          10,
        );
      if (a[0] === "entity" && a[1] === "show") {
        if (!k.net.awake)
          return fail("entity unavailable: Wi-Fi client offline", 4, 10);
        if (a[2] === "sensor.dgi_power2000")
          return ok(JSON.stringify(k.devices.telemetry(), null, 2), 10);
        const entity = k.home.states().find((e) => e.entity_id === a[2]);
        return entity
          ? ok(JSON.stringify(entity, null, 2), 3)
          : fail("entity not found", 3);
      }
      return fail(
        "hass: expected entities list|states|entity show ID|history ID",
        2,
      );
    },
  );
}
