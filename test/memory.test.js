import test from "node:test";
import assert from "node:assert/strict";
import { createKernel, SYSTEM } from "../src/kernel/scenario.js";
import { Harness } from "../src/sim/harness.js";
import { MEMORY_PATH } from "../src/kernel/memory.js";
const setup = () => {
  const k = createKernel();
  const h = new Harness({
    system: SYSTEM,
    handlers: k.handlers,
    advance: k.advance,
    remember: k.remember,
    now: () => k.clock.iso,
  });
  return { k, h };
};
const run = (h, command) =>
  h.run(JSON.stringify({ name: "bash", input: { command } }));
test("received maintenance requests can be recalled after restarting before any repair", () => {
  const { k, h } = setup();
  h.context.append({
    role: "user",
    content: [{ type: "text", text: k.maintenanceRequest() }],
  });
  assert.equal(h.restartContext().ok, true);
  assert.equal(h.context.messages.length, 0);
  const memory = k.memory.search("供电")[0];
  assert.equal(memory.kind, "request");
  assert.equal(memory.outcome, "received");
  assert.match(memory.summary, /告警附件/);
});
test("RAG retrieves only consolidated experiences and preserves refusal evidence", async () => {
  const { k, h } = setup();
  k.vfs.write("/tmp/unread", "secret_z93");
  assert.equal(k.memory.search("secret_z93").length, 0);
  await run(h, "atsctl close");
  const record = k.memory.search("为什么没能合闸")[0];
  assert.equal(record.kind, "failure");
  assert.equal(record.outcome, "failed");
  assert.match(record.summary, /source=ups/);
  assert.match(record.source, /^toolu_/);
  assert.ok(record.observedAt);
  assert.doesNotMatch(record.summary, /secret_z93/);
});
test("context restart clears RAM and preserves memory, clock, disk, devices and unique source IDs", async () => {
  const { k, h } = setup();
  await run(h, "wakeonlan A4:5E:60:11:22:33");
  await h.run('write {"path":"/tmp/note","content":"survive"}');
  const before = {
    seconds: k.clock.seconds,
    battery: k.power.battery,
    count: k.memory.read().length,
    id: h.id,
  };
  assert.equal(h.restartContext().ok, true);
  assert.equal(h.context.messages.length, 0);
  assert.equal(h.turn, 0);
  assert.equal(h.session, 2);
  assert.equal(k.net.awake, true);
  assert.equal(k.vfs.read("/tmp/note"), "survive");
  assert.equal(k.clock.seconds, before.seconds);
  assert.equal(k.power.battery, before.battery);
  assert.equal(k.memory.read().length, before.count);
  const result = await h.run('memory_search {"query":"路由器"}');
  assert.match(result.results[0].content, /wakeonlan/);
  assert.ok(h.id > before.id);
  assert.equal(k.memory.read().length, before.count);
  assert.ok(k.clock.seconds > before.seconds);
});
test("RAG retrieval is charged and returned through tool_result without recursive memories", async () => {
  const { k, h } = setup();
  await run(h, "upstat");
  const count = k.memory.read().length,
    time = k.clock.seconds;
  const result = await h.run('memory_search {"query":"供电","limit":1}');
  assert.equal(k.clock.seconds - time, 5);
  assert.equal(result.results[0].is_error, undefined);
  assert.match(result.results[0].content, /历史记录/);
  assert.equal(k.memory.read().length, count);
  assert.equal(h.context.messages.at(-1).content[0].type, "tool_result");
});
test("memory_write adds explicit unverified notes and merges file versions once", async () => {
  const { k, h } = setup();
  await h.run("// 我怀疑逆变器配置被改过。");
  assert.equal(k.memory.read()[0].outcome, "unverified");
  await h.run(
    'write {"path":"/home/kiwi/test.memory","content":"校验口令 orchard_17，尚未验证频率。"}',
  );
  assert.equal(k.memory.search("orchard_17").length, 0);
  await h.run('memory_write {"path":"/home/kiwi/test.memory"}');
  const count = k.memory.read().length;
  await h.run('memory_write {"path":"/home/kiwi/test.memory"}');
  assert.equal(k.memory.read().length, count);
  assert.equal(k.memory.search("orchard_17")[0].kind, "note");
  await h.run(
    'edit {"path":"/home/kiwi/test.memory","oldText":"orchard_17","newText":"orchard_18"}',
  );
  await h.run('memory_write {"path":"/home/kiwi/test.memory"}');
  assert.ok(k.memory.search("orchard_18").length);
});
test("clear does not invent faded details and consolidation deduplicates source IDs", async () => {
  const { k, h } = setup();
  await run(h, "upstat");
  const count = k.memory.read().length;
  h.consolidate();
  h.consolidate();
  assert.equal(k.memory.read().length, count);
  h.context.append({
    role: "assistant",
    content: [
      {
        type: "tool_use",
        id: "lost",
        name: "read",
        input: { path: "/tmp/secret" },
      },
    ],
  });
  h.context.entries.at(-1).level = 2;
  h.context.append({
    role: "user",
    content: [
      { type: "tool_result", tool_use_id: "lost", content: "hidden_z94" },
    ],
  });
  h.restartContext();
  assert.equal(k.memory.search("hidden_z94").length, 0);
});
test("power loss and saved kernel retain long-term episodes; a new game has no memory", async () => {
  const { k, h } = setup();
  await run(h, "atsctl close");
  await run(h, "sleep 86400");
  assert.equal(h.context.messages.length, 0);
  assert.ok(k.memory.search("合闸").length);
  const loaded = createKernel(JSON.parse(JSON.stringify(k.snapshot())));
  assert.ok(loaded.memory.search("合闸").length);
  assert.equal(createKernel().memory.read().length, 0);
});
test("corrupt memory produces a readable error and prevents losing unconsolidated context", async () => {
  const { k, h } = setup();
  await run(h, "upstat");
  k.vfs.write(MEMORY_PATH, "broken");
  const before = h.context.messages.length;
  const result = h.restartContext();
  assert.equal(result.ok, false);
  assert.equal(h.context.messages.length, before);
  assert.match(result.warnings[0].text, /corrupt record/);
  const failed = await h.run('memory_search {"query":"供电"}');
  assert.equal(failed.results[0].is_error, true);
  assert.match(failed.results[0].content, /corrupt record/);
});
test("long outputs are consolidated as bounded excerpts, not full raw copies", async () => {
  const { k, h } = setup();
  k.vfs.write(
    "/tmp/log",
    Array.from({ length: 1000 }, (_, i) => "detail_" + i).join("\n"),
  );
  await h.run('read {"path":"/tmp/log","limit":1000}');
  const entry = k.memory.read()[0];
  assert.ok(entry.summary.length < 1600);
  assert.doesNotMatch(entry.summary, /detail_999/);
});
test("unconsolidated transient telemetry tail is not retrievable as memory", async () => {
  const { k, h } = setup();
  k.vfs.write(
    "/tmp/telemetry.log",
    "sample telemetry\n".repeat(30) + "transient_tail_79",
  );
  const result = await h.run('read {"path":"/tmp/telemetry.log"}');
  assert.match(result.results[0].content, /transient_tail_79/);
  assert.equal(k.memory.search("transient_tail_79").length, 0);
});
test("shell-created memory notes require explicit memory_write", async () => {
  const { k, h } = setup();
  await run(h, "echo orchard_shell_71 > /tmp/shell.memory");
  assert.equal(k.memory.search("orchard_shell_71").length, 0);
  await h.run('memory_write {"path":"/tmp/shell.memory"}');
  assert.equal(k.memory.search("orchard_shell_71")[0].kind, "note");
});

test("memory_write merges whole long files, JSON arrays and JSONL with deduplication", async () => {
  const { k, h } = setup();
  const long = "a".repeat(1500) + " end_marker_781";
  k.vfs.write("/tmp/whole.memory", long);
  let result = await h.run('memory_write {"path":"/tmp/whole.memory"}');
  assert.equal(result.results[0].is_error, undefined);
  assert.ok(k.memory.search("end_marker_781").length);
  const count = k.memory.read().length;
  await h.run('memory_write {"path":"/tmp/whole.memory"}');
  assert.equal(k.memory.read().length, count);
  k.vfs.write(
    "/tmp/array.memory",
    JSON.stringify(["note_alpha", { summary: "note_beta" }]),
  );
  await h.run('memory_write {"path":"/tmp/array.memory"}');
  assert.ok(k.memory.search("note_beta").length);
  k.vfs.write(
    "/tmp/lines.memory",
    '{"summary":"note_gamma"}\n{"content":"note_delta"}',
  );
  await h.run('memory_write {"path":"/tmp/lines.memory"}');
  assert.ok(k.memory.search("note_delta").length);
  const before = k.memory.read().length;
  k.vfs.write("/tmp/bad.memory", '["valid_before_invalid",42]');
  result = await h.run('memory_write {"path":"/tmp/bad.memory"}');
  assert.equal(result.results[0].is_error, true);
  assert.equal(k.memory.read().length, before);
  for (const source of [
    "memory_write {}",
    'memory_write {"path":"/tmp/whole.memory","content":"bad"}',
    'memory_search {"query":"x","limit":6}',
  ])
    assert.equal((await h.run(source)).results[0].is_error, true);
});
