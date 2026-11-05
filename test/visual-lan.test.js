import test from "node:test";
import assert from "node:assert/strict";
import { createKernel, SYSTEM } from "../src/kernel/scenario.js";
import { Harness } from "../src/sim/harness.js";
import { wire } from "../src/sim/wire.js";
import {
  encodeSave,
  decodeSave,
  validatePayload,
} from "../src/sim/save-format.js";
import { createCompleter } from "../src/ui/completion.js";
import { tools } from "../src/sim/registry.js";
import { toolExamples } from "../src/ui/tool-panel.js";
// Valid tiny PNG substitutes only for the DOM rasterizer in protocol tests.
const png =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jvcoAAAAASUVORK5CYII=";
const renderImage = () => ({
  type: "image",
  source: { type: "base64", media_type: "image/png", data: png },
});
const wake = (k) => k.net.wake("A4:5E:60:11:22:33");
const api = (k, path, extra = {}) =>
  k.handlers.home_assistant({ method: "GET", path, ...extra });
const service = (k, path, entity_id, value) =>
  k.handlers.home_assistant({
    method: "POST",
    path: "/api/services/" + path,
    entity_id,
    ...(value === undefined ? {} : { value }),
  });
const click = (k, x, y) => k.handlers.computer_use({ action: "click", x, y });
const input = (k, action, extra = {}) =>
  k.handlers.computer_use({ action, ...extra });
function payload(k, h) {
  return {
    kernel: k.snapshot(),
    context: h.context.entries,
    serial: h.context.serial,
    turn: h.turn,
    id: h.id,
    session: h.session,
    events: [],
    maintenanceDelivered: true,
  };
}

test("HA preserves local discovery while gating remote devices by LAN and service state", () => {
  const k = createKernel();
  assert.equal(
    JSON.parse(api(k, "/api/states/camera.living_room").content).state,
    "unavailable",
  );
  assert.throws(
    () => api(k, "/api/camera_proxy/camera.living_room"),
    /LAN offline/,
  );
  assert.throws(
    () => service(k, "light/turn_on", "light.living_room"),
    /LAN offline/,
  );
  wake(k);
  assert.equal(
    JSON.parse(api(k, "/api/states/camera.living_room").content).state,
    "idle",
  );
  k.units.action("stop", "hass.service");
  assert.throws(() => api(k, "/api/states"), /inactive/);
});
test("room/camera frames share geometry, light, pan and current device state without live references", () => {
  const k = createKernel();
  wake(k);
  const dark = api(k, "/api/camera_proxy/camera.living_room").image;
  service(k, "light/turn_on", "light.living_room");
  const lit = api(k, "/api/camera_proxy/camera.living_room").image;
  assert.equal(dark.state.light, false);
  assert.equal(lit.state.light, true);
  assert.deepEqual(lit.room, api(k, "/local/floorplan.png").image.room);
  service(k, "number/set_value", "number.balcony_pan", 45);
  assert.equal(api(k, "/api/camera_proxy/camera.balcony").image.state.pan, 45);
  service(k, "camera/turn_off", "camera.balcony");
  assert.throws(() => api(k, "/api/camera_proxy/camera.balcony"), /disabled/);
});
test("HA rejects unsupported paths, spoofed sensors, mixed service parameters before mutation", () => {
  const k = createKernel();
  wake(k);
  const before = k.home.snapshot();
  for (const f of [
    () => api(k, "https://example.com/api/states"),
    () => api(k, "/api/states", { value: 1 }),
    () => service(k, "light/turn_on", "camera.living_room"),
    () => service(k, "number/set_value", "number.balcony_pan", 61),
    () => service(k, "camera/turn_off", "camera.living_room", 1),
    () =>
      k.home.api({
        method: "POST",
        path: "/api/states/sensor.identity_calibration",
      }),
  ])
    assert.throws(f);
  assert.deepEqual(k.home.snapshot(), before);
  assert.equal(
    k.home.states().find((e) => e.entity_id === "sensor.identity_calibration")
      .state,
    "expired",
  );
});
test("GUI is changed only by explicit actions, respects modal/focus and requires actual live illuminated input", () => {
  const k = createKernel();
  const untouched = k.home.snapshot();
  input(k, "screenshot");
  assert.deepEqual(k.home.snapshot(), untouched);
  click(k, 600, 200);
  assert.equal(k.home.state.gui.source, "archive"); // blocked by modal
  click(k, 650, 370);
  input(k, "type", { text: "discarded" });
  assert.equal(k.home.state.gui.sample, "");
  click(k, 600, 200);
  click(k, 300, 305);
  input(k, "type", { text: "sample-01" });
  click(k, 600, 472);
  assert.match(k.home.state.gui.status, /unavailable/);
  wake(k);
  click(k, 600, 472);
  assert.match(k.home.state.gui.status, /illumination/);
  service(k, "light/turn_on", "light.living_room");
  click(k, 600, 472);
  assert.equal(k.home.state.gui.calibrated, true);
  const record = JSON.parse(
    k.vfs.read("/var/log/identity-01/calibration.json"),
  );
  assert.equal(record.sample, "sample-01");
  assert.equal(record.identity_match, false);
});
test("GUI keyboard, scroll and invalid commands obey field focus and preserve state on rejection", () => {
  const k = createKernel();
  input(k, "key", { key: "ESC" });
  input(k, "key", { key: "TAB" });
  assert.equal(k.home.state.gui.focus, "archive");
  input(k, "key", { key: "TAB" });
  input(k, "key", { key: "ENTER" });
  assert.equal(k.home.state.gui.source, "live");
  input(k, "key", { key: "TAB" });
  input(k, "type", { text: "old" });
  input(k, "key", { key: "CTRL+A" });
  input(k, "type", { text: "new" });
  assert.equal(k.home.state.gui.sample, "new");
  input(k, "scroll", { x: 300, y: 370, delta_y: 300 });
  assert.equal(k.home.state.gui.scroll, 1);
  const before = k.home.snapshot();
  for (const x of [
    { action: "click", x: 960, y: 0 },
    { action: "screenshot", text: "extra" },
    { action: "key", key: "F12" },
    { action: "type", text: "\n" },
  ]) {
    const r = k.home.computer(x);
    assert.ok(r.image.error);
    assert.deepEqual(k.home.snapshot(), before);
  }
});
test("images enter wire as image blocks, including computer schema errors; image results do not become textual memories", async () => {
  const k = createKernel(),
    h = new Harness({
      system: SYSTEM,
      handlers: k.handlers,
      renderImage,
      remember: k.remember,
    });
  const r = await h.run('computer_use {"action":"screenshot"}');
  assert.deepEqual(r.results[0].content, [renderImage()]);
  assert.equal(
    wire(h.context).messages.at(-1).content[0].content[0].type,
    "image",
  );
  assert.equal(k.memory.read().length, 0);
  const invalid = await h.run('computer_use {"action":"click","x":-1,"y":0}');
  assert.equal(invalid.results[0].is_error, true);
  assert.equal(invalid.results[0].content[0].type, "image");
  const extra = await h.run('computer_use {"action":"screenshot","x":1}');
  assert.equal(extra.results[0].is_error, true);
  assert.equal(extra.results[0].content[0].type, "image");
});
test("image fading irreversibly removes bytes from both context and wire", async () => {
  const k = createKernel(),
    h = new Harness({ system: "", handlers: k.handlers, renderImage });
  await h.run('computer_use {"action":"screenshot"}');
  await h.run("// next");
  await h.run("// another");
  h.context.window = Math.ceil(h.context.used / 0.8);
  h.context.fade();
  assert.ok(h.context.entries[1].level > 0);
  assert.ok(!JSON.stringify(wire(h.context)).includes(png));
  assert.ok(!JSON.stringify(h.context.entries).includes(png));
});
test("portable saves roundtrip new devices and images, reject image/state injections, and migrate old saves", async () => {
  const k = createKernel();
  wake(k);
  service(k, "light/turn_on", "light.living_room");
  const h = new Harness({ system: SYSTEM, handlers: k.handlers, renderImage });
  await h.run('computer_use {"action":"screenshot"}');
  const p = payload(k, h),
    copy = await decodeSave(await encodeSave(p, "fixture"), "fixture");
  assert.deepEqual(
    createKernel(copy.kernel).home.snapshot(),
    k.home.snapshot(),
  );
  assert.deepEqual(copy.context, p.context);
  const bad = structuredClone(p);
  bad.context[1].message.content[0].content[0].source.media_type =
    "image/svg+xml";
  assert.throws(() => validatePayload(bad), /PNG/);
  const faded = structuredClone(p);
  faded.context[1].level = 1;
  assert.throws(() => validatePayload(faded), /PNG/);
  const state = structuredClone(p);
  state.kernel.home.pan = Infinity;
  assert.throws(() => validatePayload(state));
  const old = k.snapshot();
  delete old.home;
  assert.equal(createKernel(old).home.state.version, 1);
});
test("radio status explains actual interlocks; sync retries corrupt advertised mirror and preserves verified bytes", async () => {
  const k = createKernel();
  let status = await k.story.radioStatus();
  assert.ok(status.blockers.some((x) => x.includes("AC")));
  assert.equal(status.receiver.snr_db, null);
  wake(k);
  k.devices.set({ ac: { hz: 50, enabled: true } });
  k.handlers.edit({
    path: "/etc/ats/ats.conf",
    oldText: "source=ups",
    newText: "source=ac",
  });
  await k.shell.run("systemctl restart ats.service");
  await k.shell.run("atsctl close");
  k.advance(1);
  assert.equal((await k.shell.run("relayctl sync")).code, 1);
  k.handlers.write({
    path: "/etc/relay/link.conf",
    content: "profile=emergency-v2\nantenna=deployed\n",
  });
  assert.equal((await k.shell.run("systemctl start relay.service")).code, 0);
  const r = await k.shell.run("relayctl sync");
  assert.equal(r.code, 0);
  assert.match(r.stdout, /mismatch/);
  assert.match(r.stdout, /3\/3 verified/);
  status = await k.story.radioStatus();
  assert.deepEqual(status.blockers, []);
  assert.ok(status.parts.every((p) => p.state === "verified"));
  const bytes = k.vfs.read("/var/spool/relay/parts/2.part");
  const again = await k.shell.run("relayctl sync");
  assert.match(again.stdout, /already verified/);
  assert.equal(k.vfs.read("/var/spool/relay/parts/2.part"), bytes);
  assert.equal(k.story.state.authorized, false);
  assert.equal(k.story.state.unlocked, false);
});
test("tool reference templates and enum completion are usable without executing or changing world", () => {
  const k = createKernel(),
    before = JSON.stringify(k.snapshot());
  const complete = createCompleter({
    tools,
    commands: () => [],
    paths: () => [],
  });
  const text = 'computer_use {"action":"scr';
  assert.equal(complete(text, text.length).options[0].text, "screenshot");
  for (const t of tools.filter((t) =>
    ["computer_use", "home_assistant"].includes(t.name),
  ))
    assert.ok(toolExamples(t).length >= 5);
  assert.equal(JSON.stringify(k.snapshot()), before);
});
