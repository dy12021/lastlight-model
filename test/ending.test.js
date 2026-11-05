import test from "node:test";
import assert from "node:assert/strict";
import {
  endingFrame,
  endingProjection,
  mountEnding,
} from "../src/ui/ending.js";
import { mountOptics } from "../src/ui/optics.js";
import { persistedContext } from "../src/shared/images.js";
const png =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jvcoAAAAASUVORK5CYII=";
const photo = "data:image/png;base64," + png;
function dom(run) {
  const originals = Object.fromEntries(
    ["document", "window", "sessionStorage", "navigator"].map((k) => [
      k,
      Object.getOwnPropertyDescriptor(globalThis, k),
    ]),
  );
  const nodes = new Map(),
    session = new Map();
  function node(id) {
    if (!nodes.has(id)) {
      const listeners = {};
      nodes.set(id, {
        id,
        style: {},
        dataset: {},
        hidden: false,
        checked: false,
        open: false,
        clientWidth: 1280,
        clientHeight: 720,
        textContent: "",
        classList: { add() {}, remove() {} },
        addEventListener(type, cb) {
          listeners[type] = cb;
        },
        querySelectorAll() {
          return [];
        },
        decode: async () => {},
        removeAttribute(k) {
          delete this[k];
        },
        focus() {},
        showModal() {
          this.open = true;
        },
        close() {
          this.open = false;
          listeners.close?.();
        },
      });
    }
    return nodes.get(id);
  }
  globalThis.document = {
    getElementById: node,
    createElement: () => ({
      getContext: () => ({ drawImage() {} }),
      toDataURL: () => photo,
    }),
  };
  globalThis.window = {
    matchMedia: () => ({ matches: false }),
    innerWidth: 1280,
    innerHeight: 720,
    addEventListener() {},
  };
  globalThis.sessionStorage = {
    getItem: (k) => session.get(k),
    setItem: (k, v) => session.set(k, v),
    removeItem: (k) => session.delete(k),
  };
  return Promise.resolve()
    .then(() => run({ node, session }))
    .finally(() => {
      for (const [k, d] of Object.entries(originals))
        if (d) Object.defineProperty(globalThis, k, d);
        else delete globalThis[k];
    });
}
function player(node, getPortrait) {
  let pending = null,
    serial = 0;
  const ending = mountEnding({
    getPortrait,
    getTranscript: () => "sample terminal",
    isAvailable: () => true,
    requestFrame: (cb) => {
      pending = cb;
      return ++serial;
    },
    cancelFrame: () => {
      pending = null;
    },
  });
  return {
    ending,
    go(t) {
      const cb = pending;
      assert.ok(cb, "expected an animation callback");
      pending = null;
      cb(t * 1000);
    },
    node,
  };
}
test("two five-second expression intervals, stable mirrored UI and continuous room projection", () => {
  assert.equal(endingFrame(1.99).portrait, 0);
  for (const t of [2, 3, 6.999])
    assert.equal(endingFrame(t).expression, "neutral");
  for (const t of [7, 9, 11.999])
    assert.equal(endingFrame(t).expression, "surprised");
  assert.equal(endingFrame(12).portrait, 0);
  assert.equal(endingFrame(3).flip, 180);
  assert.equal(endingFrame(9, true).flip, 180);
  for (const [w, h] of [
    [1280, 720],
    [390, 844],
  ]) {
    const start = endingProjection(w, h, 0),
      end = endingProjection(w, h, 1);
    assert.ok(start.rect.w >= w - 0.001 && start.rect.h >= h - 0.001);
    assert.ok(Math.abs(start.rect.x + start.rect.w / 2 - w / 2) < 0.01);
    assert.equal(end.zoom, 1);
    assert.ok(Math.abs(end.dx) < 0.001);
    assert.ok(Math.abs(end.dy) < 0.001);
    assert.ok(end.rect.w < w && end.rect.h < h);
  }
});
test("player photo exclusively replaces the scene, is suppressed in reduced motion, and is erased on close and replay", () =>
  dom(async ({ node }) => {
    let portrait = photo;
    const p = player(node, () => portrait);
    await p.ending.play();
    p.go(0);
    p.go(10.9);
    assert.equal(node("ending-human").hidden, false);
    assert.equal(node("ending-avatar").hidden, true);
    assert.equal(node("ending-surprise").hidden, true);
    node("ending-reduced").checked = true;
    node("ending-reduced").onchange();
    assert.equal(node("ending-human").hidden, true);
    assert.equal(node("ending-surprise").hidden, false);
    node("ending-reduced").checked = false;
    node("ending-reduced").onchange();
    p.go(11.25);
    assert.equal(node("ending-human").hidden, true);
    assert.equal(node("ending-surprise").hidden, false);
    node("ending-dialog").close();
    assert.equal(node("ending-human").src, undefined);
    assert.equal(node("ending-transcript").textContent, "");
    portrait = null;
    await p.ending.play();
    p.go(0);
    p.go(10.9);
    assert.equal(node("ending-human").hidden, true);
    assert.equal(node("ending-human").src, undefined);
  }));
test("pause freezes camera and expression; forgetting a photo during playback removes its image immediately", () =>
  dom(async ({ node }) => {
    let portrait = photo;
    const p = player(node, () => portrait);
    await p.ending.play();
    p.go(0);
    p.go(3);
    const before = { ...node("ending-observer").style };
    node("ending-pause").onclick();
    p.go(9);
    assert.deepEqual(node("ending-observer").style, before);
    assert.equal(node("ending-avatar").hidden, false);
    node("ending-pause").onclick();
    p.go(10);
    p.go(17.9);
    assert.equal(node("ending-human").hidden, false);
    portrait = null;
    p.go(17.95);
    assert.equal(node("ending-human").hidden, true);
    assert.equal(node("ending-human").src, undefined);
  }));
test("invalid photo decoding falls back to a single AI face", () =>
  dom(async ({ node }) => {
    node("ending-human").decode = async () => {
      throw Error("broken image");
    };
    const p = player(node, () => photo);
    await p.ending.play();
    p.go(0);
    p.go(10.9);
    assert.equal(node("ending-human").hidden, true);
    assert.equal(node("ending-surprise").hidden, false);
  }));
test("revoked photo while decoding is never displayed", () =>
  dom(async ({ node }) => {
    let resolve,
      portrait = photo;
    node("ending-human").decode = () => new Promise((r) => (resolve = r));
    const p = player(node, () => portrait),
      playing = p.ending.play();
    for (let i = 0; i < 5 && !resolve; i++) await Promise.resolve();
    assert.ok(resolve);
    portrait = null;
    resolve();
    await playing;
    p.go(0);
    p.go(10.9);
    assert.equal(node("ending-human").hidden, true);
    assert.equal(node("ending-human").src, undefined);
  }));
test("mounted camera capture retains only by choice, returns ephemeral PNG, stops tracks, and forget clears all session copies", () =>
  dom(async ({ node, session }) => {
    let stopped = 0,
      closed = 0;
    const records = [];
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: {
        mediaDevices: {
          getUserMedia: async () => ({
            getVideoTracks: () => [{}],
            getTracks: () => [
              {
                stop() {
                  stopped++;
                },
              },
            ],
          }),
        },
      },
    });
    window.ImageCapture = class {
      async grabFrame() {
        return {
          width: 640,
          height: 480,
          close() {
            closed++;
          },
        };
      }
    };
    const optics = mountOptics({ onCalibrated: (r) => records.push(r) });
    let request = optics.tool({ action: "capture" });
    node("optics-retain").checked = false;
    await node("optics-enable").onclick();
    let result = await request;
    assert.equal(optics.getPortrait(), null);
    assert.equal(optics.read().content[0].ephemeral, true);
    assert.equal(result.content[0].source.data, png);
    assert.equal(session.size, 0);
    request = optics.tool({ action: "capture" });
    node("optics-retain").checked = true;
    await node("optics-enable").onclick();
    result = await request;
    assert.equal(optics.getPortrait(), photo);
    assert.equal(session.get("lastlight.camera.session.v2"), photo);
    assert.equal(stopped, 2);
    assert.equal(closed, 2);
    assert.equal(records.at(-1).portrait_retained, true);
    const entries = [
      {
        message: {
          content: [{ type: "tool_result", content: result.content }],
        },
      },
    ];
    assert.ok(!JSON.stringify(persistedContext(entries)).includes(png));
    node("ending-human").src = photo;
    optics.tool({ action: "forget" });
    assert.equal(optics.getPortrait(), null);
    assert.equal(session.size, 0);
    assert.equal(node("ending-human").src, undefined);
    assert.equal(optics.read().image.hasFrame, false);
  }));
