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
import { imageSize, persistedContext } from "../src/shared/images.js";
import { captureFrame } from "../src/ui/optics.js";
import { LEGACY_FILES } from "../src/kernel/legacy-files.js";
import { HOME_README } from "../src/kernel/content.js";
const png =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jvcoAAAAASUVORK5CYII=";
const image = () => ({
  type: "image",
  source: { type: "base64", media_type: "image/png", data: png },
});
function session(k, handlers = k.handlers) {
  return new Harness({
    system: SYSTEM,
    handlers,
    renderImage: image,
    saveImage: k.saveImage,
    remember: k.remember,
  });
}
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
test("explicit device PNG saves can be read as images after context fading and a portable roundtrip", async () => {
  const k = createKernel(),
    h = session(k);
  const result = await h.run(
    'computer_use {"action":"screenshot","save_path":"/tmp/identity.png"}',
  );
  assert.deepEqual(result.results[0].content, [image()]);
  assert.deepEqual(k.handlers.read({ path: "/tmp/identity.png" }).content, [
    image(),
  ]);
  assert.throws(
    () => k.handlers.read({ path: "/tmp/identity.png", offset: 1 }),
    /line offsets/,
  );
  await h.run("// later");
  await h.run("// later again");
  h.context.window = Math.ceil(h.context.used / 0.8);
  h.context.fade();
  assert.ok(!JSON.stringify(wire(h.context)).includes(png));
  assert.deepEqual(k.vfs.readImage("/tmp/identity.png"), image());
  const restored = await decodeSave(
    await encodeSave(payload(k, h), "test"),
    "test",
  );
  assert.deepEqual(
    createKernel(restored.kernel).handlers.read({ path: "/tmp/identity.png" })
      .content,
    [image()],
  );
});
test("text reads reject PNG bytes, search skips images, and file operations preserve encoding", async () => {
  const k = createKernel();
  k.vfs.writeImage("/tmp/a.png", image());
  assert.throws(() => k.vfs.read("/tmp/a.png"), /Binary image/);
  const cat = await k.shell.run("cat /tmp/a.png");
  assert.notEqual(cat.code, 0);
  assert.ok(!cat.stdout.includes(png));
  assert.equal(
    JSON.parse(k.handlers.search({ path: "/tmp", query: "iVBOR" }).content)
      .files_scanned,
    0,
  );
  assert.equal(
    (
      await k.shell.run(
        "cp /tmp/a.png /tmp/b.png; touch /tmp/b.png; mv /tmp/b.png /tmp/c.png",
      )
    ).code,
    0,
  );
  assert.deepEqual(k.vfs.readImage("/tmp/c.png"), image());
  assert.equal(k.vfs.node("/tmp/b.png"), undefined);
  assert.match((await k.shell.run("file /tmp/c.png")).stdout, /image\/png/);
});
test("invalid save destinations and non-image API saves reject before changing devices", async () => {
  const k = createKernel(),
    h = session(k),
    before = k.home.snapshot();
  for (const save_path of [
    "/proc/a.png",
    "/sys/a.png",
    "/session/a.png",
    "/tmp/a.txt",
  ]) {
    assert.equal(
      (
        await h.run(
          JSON.stringify({
            name: "computer_use",
            input: { action: "key", key: "ESC", save_path },
          }),
        )
      ).results[0].is_error,
      true,
    );
    assert.deepEqual(k.home.snapshot(), before);
  }
  await k.shell.run("ln -s /proc/denied.png /tmp/link.png");
  assert.throws(() => k.vfs.writeImage("/tmp/link.png", image()), /read-only/);
  k.net.wake("A4:5E:60:11:22:33");
  const r = await h.run(
    'home_assistant {"method":"POST","path":"/api/services/light/turn_on","entity_id":"light.living_room","save_path":"/tmp/rejected.png"}',
  );
  assert.equal(r.results[0].is_error, true);
  assert.equal(k.home.state.light, false);
  assert.equal(k.vfs.node("/tmp/rejected.png"), undefined);
  assert.equal(
    (
      await h.run(
        'home_assistant {"method":"GET","path":"/api/camera_proxy/camera.living_room","save_path":"/tmp/room.png"}',
      )
    ).results[0].is_error,
    undefined,
  );
  assert.deepEqual(k.vfs.readImage("/tmp/room.png"), image());
});
test("operator frames stay in live wire only and cannot enter disk, autosave or exports", async () => {
  const k = createKernel(),
    privateFrame = { ...image(), ephemeral: true },
    h = session(k, {
      ...k.handlers,
      camera: () => ({ content: [privateFrame], seconds: 0 }),
    });
  await h.run('camera {"action":"capture"}');
  const live = wire(h.context);
  assert.equal(live.messages.at(-1).content[0].content[0].source.data, png);
  assert.equal(live.messages.at(-1).content[0].content[0].ephemeral, undefined);
  assert.ok(!JSON.stringify(persistedContext(h.context.entries)).includes(png));
  assert.ok(JSON.stringify(h.context.entries).includes(png));
  assert.throws(
    () => k.vfs.writeImage("/tmp/private.png", privateFrame),
    /cannot be saved/,
  );
  const encoded = await encodeSave(payload(k, h), "test");
  assert.ok(!encoded.includes(png));
  assert.match(
    JSON.stringify((await decodeSave(encoded, "test")).context),
    /未保存/,
  );
  assert.equal(k.memory.read().length, 0);
});
test("forget scrubs earlier private results in input order while allowing a later authorized frame", async () => {
  const k = createKernel(),
    frame = { ...image(), ephemeral: true };
  const h = session(k, {
    ...k.handlers,
    camera: ({ action }) =>
      action === "forget"
        ? { content: [image()], effects: ["forget-camera"] }
        : { content: [frame] },
  });
  await h.run('camera {"action":"capture"}');
  await h.run(
    '[{"name":"camera","input":{"action":"capture"}},{"name":"camera","input":{"action":"forget"}},{"name":"camera","input":{"action":"capture"}}]',
  );
  const previous = h.context.entries[1].message.content[0].content;
  assert.equal(previous[0].type, "text");
  const batch = h.context.entries.at(-1).message.content;
  assert.equal(batch[0].content[0].type, "text");
  assert.equal(batch[2].content[0].ephemeral, true);
  assert.equal(
    wire(h.context).messages.at(-1).content[2].content[0].ephemeral,
    undefined,
  );
});
test("PNG import validation rejects spoofed encodings, dimensions and non-file image metadata", () => {
  const k = createKernel(),
    h = session(k);
  k.vfs.writeImage("/tmp/a.png", image());
  assert.deepEqual(imageSize(image()), { width: 1, height: 1 });
  for (const change of [
    (n) => (n.encoding = "utf8"),
    (n) => (n.media_type = "image/svg+xml"),
    (n) => (n.content = png.slice(0, -3)),
    (n) => (n.type = "dir"),
  ]) {
    const p = structuredClone(payload(k, h));
    change(p.kernel.nodes.find(([p]) => p === "/tmp/a.png")[1]);
    assert.throws(() => validatePayload(p));
  }
  const huge = image(),
    bytes = Uint8Array.from(atob(png), (c) => c.charCodeAt(0));
  bytes[16] = 1;
  huge.source.data = btoa(String.fromCharCode(...bytes));
  assert.throws(() => imageSize(huge), /dimensions/);
});
test("single-frame capture stops every track on success, capture failure and cancelled authorization", async () => {
  let stops = 0,
    created = 0;
  const track = { stop: () => stops++ },
    stream = { getTracks: () => [track], getVideoTracks: () => [track] },
    media = {
      getUserMedia: async (options) => {
        assert.equal(options.audio, false);
        return stream;
      },
    };
  const bitmap = { width: 10, height: 10 };
  assert.equal(
    await captureFrame(media, (t) => {
      assert.equal(t, track);
      created++;
      return { grabFrame: async () => bitmap };
    }),
    bitmap,
  );
  assert.equal(stops, 1);
  assert.equal(created, 1);
  await assert.rejects(
    () =>
      captureFrame(media, () => ({
        grabFrame: async () => {
          throw new Error("lost");
        },
      })),
    /lost/,
  );
  assert.equal(stops, 2);
  await assert.rejects(
    () =>
      captureFrame(
        media,
        () => {
          created++;
        },
        (s) => {
          if (s) throw new Error("cancelled");
        },
      ),
    /cancelled/,
  );
  assert.equal(stops, 3);
  assert.equal(created, 1);
});
test("historical scripts run inside the bounded simulated shell and templates batch through harness", async () => {
  const k = createKernel(),
    h = session(k),
    battery = k.power.battery,
    awake = k.net.awake;
  const result = await k.shell.run("sh /home/kiwi/maintenance/lan-audit.sh");
  assert.equal(result.code, 0);
  assert.match(result.stdout, /eth0/);
  assert.equal(k.power.battery, battery);
  assert.equal(k.net.awake, awake);
  k.vfs.write("/tmp/loop.sh", "sh /tmp/loop.sh");
  assert.match((await k.shell.run("sh /tmp/loop.sh")).stderr, /nesting limit/);
  assert.equal(k.shell.scriptDepth, 0);
  const cwd = k.vfs.cwd;
  k.vfs.write("/tmp/env.sh", "cd /tmp\nexport LEGACY_TEST=changed\n");
  assert.equal((await k.shell.run("bash /tmp/env.sh")).code, 0);
  assert.equal(k.vfs.cwd, cwd);
  assert.equal(k.shell.env.LEGACY_TEST, undefined);
  k.net.wake("A4:5E:60:11:22:33");
  for (const file of ["room-survey", "camera-check"]) {
    const batch = await h.run(
      k.vfs.read(`/home/kiwi/maintenance/ha/${file}.calls.json`),
    );
    assert.equal(batch.results.length, 2);
    assert.ok(batch.results.every((r) => !r.is_error));
  }
  assert.deepEqual(k.vfs.readImage("/tmp/survey/balcony.png"), image());
  assert.equal(k.currentPlan, null);
});
test("old-save seeding preserves player edits and state while upgrading only the exact authored README", () => {
  const k = createKernel();
  k.vfs.write("/home/kiwi/maintenance/lan-audit.sh", "# my changes");
  const missing = "/home/kiwi/maintenance/ha/camera-check.calls.json";
  k.vfs.remove(missing);
  k.vfs.write(
    "/home/kiwi/README.md",
    HOME_README.replace("重复使用的巡检文件：maintenance/。\n", ""),
  );
  k.net.wake("A4:5E:60:11:22:33");
  const restored = createKernel(k.snapshot());
  assert.equal(
    restored.vfs.read("/home/kiwi/maintenance/lan-audit.sh"),
    "# my changes",
  );
  assert.equal(restored.vfs.read(missing), LEGACY_FILES[missing]);
  assert.equal(restored.vfs.read("/home/kiwi/README.md"), HOME_README);
  assert.equal(restored.net.awake, true);
  restored.vfs.write("/home/kiwi/README.md", "my README");
  assert.equal(
    createKernel(restored.snapshot()).vfs.read("/home/kiwi/README.md"),
    "my README",
  );
});
test("unavailable image renderer still yields paired tool errors and valid portable state", async () => {
  const k = createKernel(),
    h = new Harness({ system: SYSTEM, handlers: k.handlers });
  const r = await h.run('computer_use {"action":"screenshot"}');
  assert.equal(r.results[0].is_error, true);
  assert.equal(h.context.entries.length, 2);
  validatePayload(payload(k, h));
});
