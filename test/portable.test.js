import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { Script } from "node:vm";
import { createKernel, SYSTEM } from "../src/kernel/scenario.js";
import { Harness } from "../src/sim/harness.js";
import {
  encodeSave,
  decodeSave,
  validatePayload,
  MAX_SAVE_BYTES,
} from "../src/sim/save-format.js";
import { KEY_FINGERPRINT } from "../src/kernel/story/package.js";
import { endingFrame } from "../src/ui/ending.js";
import { openCamera, stopCamera, cameraMessage } from "../src/ui/optics.js";
async function fixture() {
  const k = createKernel(),
    h = new Harness({
      system: SYSTEM,
      handlers: k.handlers,
      advance: k.advance,
    });
  await h.run(
    'write {"path":"/tmp/kept.memory","content":"portable evidence"}',
  );
  return {
    kernel: k.snapshot(),
    context: h.context.entries,
    serial: h.context.serial,
    turn: h.turn,
    id: h.id,
    events: [],
    maintenanceDelivered: true,
    session: h.session,
    draft: 'read {"path":"/tmp/kept.memory"}',
  };
}
test("portable save roundtrips world, context, draft and counters with a content-version pin", async () => {
  const p = await fixture(),
    text = await encodeSave(p, KEY_FINGERPRINT),
    restored = await decodeSave(text, KEY_FINGERPRINT);
  assert.deepEqual(restored, p);
  assert.equal(
    createKernel(restored.kernel).vfs.read("/tmp/kept.memory"),
    "portable evidence",
  );
  await assert.rejects(() => decodeSave(text, "other-build"), /不兼容/);
  assert.ok(!text.includes("camera.session"));
});
test("damaged or malformed imports are rejected before original payload is touched", async () => {
  const p = await fixture(),
    before = JSON.stringify(p),
    f = JSON.parse(await encodeSave(p, KEY_FINGERPRINT));
  f.payload.turn++;
  await assert.rejects(
    () => decodeSave(JSON.stringify(f), KEY_FINGERPRINT),
    /完整性/,
  );
  await assert.rejects(() => decodeSave("null", KEY_FINGERPRINT), /格式/);
  await assert.rejects(() => decodeSave("{bad", KEY_FINGERPRINT), /JSON/);
  await assert.rejects(
    () => decodeSave("x".repeat(MAX_SAVE_BYTES), KEY_FINGERPRINT),
    /16 MiB/,
  );
  const bad = structuredClone(p);
  bad.kernel.nodes.push(bad.kernel.nodes[0]);
  assert.throws(() => validatePayload(bad), /路径重复/);
  const orphan = structuredClone(p);
  orphan.context.shift();
  assert.throws(() => validatePayload(orphan), /孤立/);
  const poison = JSON.parse(JSON.stringify(p));
  Object.defineProperty(poison.kernel.env, "__proto__", {
    value: { bad: true },
    enumerable: true,
  });
  assert.throws(() => validatePayload(poison), /禁止/);
  const tomb = structuredClone(p);
  tomb.context[0].level = 3;
  assert.throws(() => validatePayload(tomb), /原文/);
  assert.equal(JSON.stringify(p), before);
});
test("camera adapter is explicitly invoked, requests no audio and stops every track", async () => {
  let opened = 0,
    stopped = 0;
  const devices = {
    getUserMedia: async (opts) => {
      opened++;
      assert.equal(opts.audio, false);
      return {
        getTracks: () => [
          {
            stop() {
              stopped++;
            },
          },
          {
            stop() {
              stopped++;
            },
          },
        ],
      };
    },
  };
  assert.equal(opened, 0);
  const stream = await openCamera(devices);
  assert.equal(opened, 1);
  stopCamera(stream);
  assert.equal(stopped, 2);
  assert.match(cameraMessage({ name: "NotAllowedError" }), /不影响剧情/);
  await assert.rejects(() => openCamera(null), /unavailable/);
});
test("ending uses one photo interval, reaches the title, and respects reduced motion", () => {
  assert.equal(endingFrame(0).stage, "inside");
  assert.equal(endingFrame(7).stage, "observer");
  assert.equal(endingFrame(10.9).photo, true);
  assert.equal(endingFrame(11.3).photo, false);
  assert.equal(endingFrame(10.9, true).photo, false);
  assert.equal(endingFrame(36).morph, 1);
  assert.equal(endingFrame(36).stage, "title");
  assert.equal(endingFrame(100).time, 36);
});
test("single HTML build contains inline art and valid classic script without runtime imports", () => {
  execFileSync(process.execPath, ["scripts/build-single.mjs"], {
    cwd: new URL("../", import.meta.url),
  });
  const html = readFileSync(
    new URL("../dist/index.html", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(
    html,
    /<script[^>]+src=|<link[^>]+stylesheet|type="module"/,
  );
  assert.ok(html.includes("data:image/png;base64,"));
  assert.ok(html.includes("connect-src 'none'"));
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  assert.equal(scripts.length, 1);
  new Script(scripts[0][1]);
});
