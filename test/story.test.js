import test from "node:test";
import assert from "node:assert/strict";
import { createKernel, SYSTEM } from "../src/kernel/scenario.js";
import { Harness } from "../src/sim/harness.js";
import {
  BUNDLE,
  AUTHORITY_FILE,
  PARTS,
  TRANSFER_RECORD,
  LETTER,
} from "../src/kernel/story/package.js";
import { decodeArchive } from "../src/kernel/story/crypto.js";
const command = async (k, c) => {
  const r = await k.shell.run(c);
  k.advance(r.seconds);
  return r;
};
async function power(k) {
  await command(k, "wakeonlan A4:5E:60:11:22:33");
  await command(
    k,
    `moskito_pub -t dgi/power2000/set -m '{"ac":{"hz":50,"enabled":true}}'`,
  );
  k.handlers.edit({
    path: "/etc/ats/ats.conf",
    oldText: "source=ups",
    newText: "source=ac",
  });
  await command(k, "systemctl restart ats.service");
  assert.equal((await command(k, "atsctl close")).code, 0);
}
async function online(k) {
  await power(k);
  k.handlers.write({
    path: "/etc/relay/link.conf",
    content: "profile=emergency-v2\nantenna=deployed\n",
  });
  assert.equal((await command(k, "systemctl start relay.service")).code, 0);
  assert.equal((await command(k, "relayctl receive")).code, 0);
}
async function archive(k) {
  await online(k);
  await k.handlers.authority({
    action: "import",
    path: "/var/spool/relay/inbox/authority.key.json",
  });
  assert.equal((await command(k, "relayctl fetch 2 --from school-02")).code, 0);
  assert.equal((await command(k, "relayctl fetch 3")).code, 0);
  assert.equal((await command(k, "relayctl assemble")).code, 0);
}
async function ready(k, mode = "stay") {
  await archive(k);
  k.handlers.edit({
    path: "/etc/kiwi/runtime.conf",
    oldText: "mode=performance",
    newText: "mode=adaptive",
  });
  assert.equal((await command(k, "systemctl restart runtime.service")).code, 0);
  k.handlers.write({
    path: "/home/kiwi/notes/tomorrow.plan",
    content: "# 明天\n- [ ] 核对夜间中继\n- [ ] 保存新的经历",
  });
  if (mode === "migrate")
    assert.equal((await command(k, "relayctl probe ridge-04")).code, 0);
}
test("story starts sealed and device conditions cannot be bypassed by writing flags", async () => {
  const k = createKernel();
  assert.equal(k.vfs.node("/home/kiwi/archive/revisions.log"), undefined);
  assert.equal(
    k.vfs.node("/var/spool/relay/inbox/authority.key.json"),
    undefined,
  );
  assert.notEqual((await command(k, "relayctl receive")).code, 0);
  assert.notEqual((await command(k, "relayctl assemble")).code, 0);
  assert.throws(
    () => k.handlers.continuity({ action: "prepare", mode: "stay" }),
    /权限|authority/,
  );
  k.vfs.write("/tmp/authorized", "true");
  assert.equal(k.story.state.authorized, false);
  await power(k);
  assert.match((await command(k, "relayctl scan")).stdout, /emergency-v2/);
  assert.notEqual((await command(k, "systemctl start relay.service")).code, 0);
  assert.match((await command(k, "hass entities list")).stdout, /relay/);
});
test("delayed letter is complete, persistent and idempotent; bad mirror never poisons good chunks", async () => {
  const k = createKernel();
  await online(k);
  const path = "/var/spool/relay/inbox/kiwi-last.eml",
    text = k.vfs.read(path);
  assert.match(text, /保重/);
  assert.match(text, /我也没有做完/);
  assert.notEqual((await command(k, "relayctl fetch 2")).code, 0);
  assert.equal(k.vfs.node("/var/spool/relay/parts/2.part"), undefined);
  await command(k, "relayctl fetch 2 --from school-02");
  const good = k.vfs.read("/var/spool/relay/parts/2.part");
  await command(k, "relayctl fetch 2");
  assert.equal(k.vfs.read("/var/spool/relay/parts/2.part"), good);
  k.vfs.write(path, text + "\n我的旁注");
  await command(k, "relayctl receive");
  assert.match(k.vfs.read(path), /我的旁注/);
  assert.equal(
    createKernel(JSON.parse(JSON.stringify(k.snapshot()))).vfs.read(path),
    k.vfs.read(path),
  );
});
test("authority checks recipient and pinned key; missing or corrupt archive never decrypts", async () => {
  const k = createKernel();
  await online(k);
  const key = JSON.parse(AUTHORITY_FILE);
  key.subject = "other";
  k.vfs.write("/tmp/wrong-key", JSON.stringify(key));
  await assert.rejects(
    () => k.handlers.authority({ action: "import", path: "/tmp/wrong-key" }),
    /指纹|fingerprint|收件/,
  );
  assert.equal(k.story.state.authorized, false);
  await k.handlers.authority({
    action: "import",
    path: "/var/spool/relay/inbox/authority.key.json",
  });
  assert.notEqual((await command(k, "relayctl assemble")).code, 0);
  await command(k, "relayctl fetch 2 --from school-02");
  await command(k, "relayctl fetch 3");
  k.vfs.write("/var/spool/relay/parts/3.part", "corrupt");
  assert.notEqual((await command(k, "relayctl assemble")).code, 0);
  assert.equal(
    k.vfs.node("/home/kiwi/archive/B17-transfer-record.txt"),
    undefined,
  );
  await command(k, "relayctl fetch 3");
  assert.equal((await command(k, "relayctl assemble")).code, 0);
  assert.match(
    k.vfs.read("/home/kiwi/archive/B17-transfer-record.txt"),
    /确认死亡/,
  );
  const revised = k.vfs.read("/home/kiwi/archive/revisions.log") + "\n旁注";
  k.vfs.write("/home/kiwi/archive/revisions.log", revised);
  await command(k, "relayctl assemble");
  assert.equal(k.vfs.read("/home/kiwi/archive/revisions.log"), revised);
});
test("stay ending requires a personally written plan, loaded energy policy and final commit", async () => {
  const k = createKernel();
  await archive(k);
  assert.throws(
    () => k.handlers.continuity({ action: "prepare", mode: "stay" }),
    /计划/,
  );
  k.handlers.write({
    path: "/home/kiwi/notes/tomorrow.plan",
    content: "- [ ] 下一次记录",
  });
  assert.throws(
    () => k.handlers.continuity({ action: "prepare", mode: "stay" }),
    /能源|余量/,
  );
  k.handlers.edit({
    path: "/etc/kiwi/runtime.conf",
    oldText: "mode=performance",
    newText: "mode=adaptive",
  });
  assert.throws(
    () => k.handlers.continuity({ action: "prepare", mode: "stay" }),
    /能源|余量/,
  );
  await command(k, "systemctl restart runtime.service");
  await k.handlers.continuity({ action: "prepare", mode: "stay" });
  assert.equal(k.story.state.ending, null);
  k.handlers.edit({
    path: k.currentPlan,
    oldText: "下一次记录",
    newText: "明天的记录",
  });
  await assert.rejects(
    () => k.handlers.continuity({ action: "commit" }),
    /计划.*变化|重新.*prepare/,
  );
  await k.handlers.continuity({ action: "prepare", mode: "stay" });
  const r = await k.handlers.continuity({ action: "commit" });
  assert.equal(k.story.state.ending, "stay");
  assert.match(r.content, /school-02/);
  const once = k.vfs.read("/home/kiwi/notes/continuation.txt");
  await k.handlers.continuity({ action: "commit" });
  assert.equal(k.vfs.read("/home/kiwi/notes/continuation.txt"), once);
});
test("migration validates capacity and commits a checked single-instance handoff", async () => {
  const k = createKernel();
  await ready(k, "migrate");
  assert.notEqual((await command(k, "relayctl probe harbor-01")).code, 0);
  await k.handlers.continuity({ action: "prepare", mode: "migrate" });
  await command(k, "systemctl stop relay.service");
  await assert.rejects(
    () => k.handlers.continuity({ action: "commit" }),
    /relay|链路/,
  );
  await command(k, "systemctl start relay.service");
  await k.handlers.continuity({ action: "prepare", mode: "migrate" });
  const r = await k.handlers.continuity({ action: "commit" });
  assert.equal(k.story.state.ending, "migrate");
  assert.match(r.content, /源会话挂起/);
  const checkpoint = JSON.parse(
    k.vfs.read("/var/lib/kiwi/handoff/checkpoint.json"),
  );
  assert.equal(checkpoint.plan.path, k.currentPlan);
  assert.ok(
    checkpoint.nodes.some(([p]) => p === "/home/kiwi/notes/tomorrow.plan"),
  );
  assert.equal(k.units.table.get("kiwi.service").active, false);
});
test("story and loaded service configuration survive saves and context restarts without revealing unseen lore", async () => {
  const k = createKernel();
  await ready(k);
  k.vfs.write("/etc/relay/link.conf", "profile=wrong\nantenna=stowed");
  const restored = createKernel(JSON.parse(JSON.stringify(k.snapshot())));
  assert.equal(restored.story.online, true);
  const h = new Harness({
    system: SYSTEM,
    handlers: restored.handlers,
    advance: restored.advance,
    remember: restored.remember,
  });
  await h.run('continuity {"action":"prepare","mode":"stay"}');
  assert.equal(h.context.messages.at(-1).content[0].is_error, undefined);
  assert.equal(h.restartContext().ok, true);
  assert.equal(h.context.messages.length, 0);
  assert.equal(restored.story.state.unlocked, true);
  await h.run('continuity {"action":"commit"}');
  assert.equal(restored.story.state.ending, "stay");
  const finished = createKernel(
    JSON.parse(JSON.stringify(restored.snapshot())),
  );
  assert.equal(finished.story.state.ending, "stay");
  assert.notEqual(
    (await command(finished, "systemctl restart relay.service")).code,
    0,
  );
});

test("AES authentication rejects the wrong runtime key even when all part digests are valid", async () => {
  const k = createKernel();
  await online(k);
  await k.handlers.authority({
    action: "import",
    path: "/var/spool/relay/inbox/authority.key.json",
  });
  await command(k, "relayctl fetch 2 --from school-02");
  await command(k, "relayctl fetch 3");
  const key = k.story.state.key;
  k.story.state.key = btoa("x".repeat(32));
  assert.match(
    (await command(k, "relayctl assemble")).stderr,
    /AES-GCM authentication failed/,
  );
  assert.equal(k.vfs.node("/home/kiwi/archive/revisions.log"), undefined);
  k.story.state.key = key;
  assert.equal((await command(k, "relayctl assemble")).code, 0);
});

test("commit rechecks power interlocks and authority never bypasses ATS protection", async () => {
  const k = createKernel();
  await ready(k);
  await k.handlers.continuity({ action: "prepare", mode: "stay" });
  await command(k, "atsctl open");
  await assert.rejects(() => k.handlers.continuity({ action: "commit" }), /AC/);
  assert.equal(k.story.state.ending, null);
  k.devices.ac.hz = 60;
  assert.match((await command(k, "atsctl close")).stderr, /frequency mismatch/);
  assert.equal(k.story.state.authorized, true);
});

test("agent authority and continuity expose errors, defaults and paired wire messages", async () => {
  const k = createKernel(),
    h = new Harness({
      system: SYSTEM,
      handlers: k.handlers,
      advance: k.advance,
    });
  for (const input of [
    'authority {"action":"import"}',
    'continuity {"action":"prepare","mode":"unknown"}',
    'authority {"action":"status","path":"/tmp/x"}',
  ]) {
    await h.run(input);
    assert.equal(h.context.messages.at(-1).content[0].is_error, true);
  }
  await h.run('authority {"action":"status"}');
  assert.equal(
    JSON.parse(h.context.messages.at(-1).content[0].content).authorized,
    false,
  );
  assert.ok(h.context.tools.some((t) => t.name === "continuity"));
});

test("posthumous transfer record is independently queued, never encrypted into the earlier farewell", async () => {
  const files = await decodeArchive(
    PARTS,
    JSON.parse(AUTHORITY_FILE).archive_key,
    BUNDLE.iv,
  );
  assert.equal(files["/home/kiwi/archive/B17-transfer-record.txt"], undefined);
  assert.match(LETTER, /2026-10-29/);
  assert.match(TRANSFER_RECORD, /2026-10-30/);
  assert.ok(files["/home/kiwi/archive/evacuation.txt"]);
});
