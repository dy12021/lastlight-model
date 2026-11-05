import test from "node:test";
import assert from "node:assert/strict";
import { tokens } from "../src/sim/tokens.js";
import { validate } from "../src/sim/schema.js";
import { parse } from "../src/sim/parse.js";
import { Context } from "../src/sim/context.js";
import { Harness } from "../src/sim/harness.js";
import { registry } from "../src/sim/registry.js";

test("parse errors preserve source lines after monologue", () => {
  assert.throws(() => parse('// 想法\nread {"path":}'), /第 2 行/);
});

test("fading and hard eviction never orphan tool results", () => {
  const c = new Context("identity", [], 1000);
  for (let i = 0; i < 4; i++) {
    c.append({
      role: "assistant",
      content: [
        {
          type: "tool_use",
          id: "id" + i,
          name: "read",
          input: { path: "/tmp/a" },
        },
      ],
    });
    c.append({
      role: "user",
      content: [
        {
          type: "tool_result",
          tool_use_id: "id" + i,
          content: "中".repeat(500),
        },
      ],
    });
  }
  c.append({ role: "assistant", content: [{ type: "text", text: "latest" }] });
  c.window = c.used / 0.96;
  c.fade();
  const ids = new Set(
    c.messages.flatMap((m) =>
      m.content.filter((b) => b.type === "tool_use").map((b) => b.id),
    ),
  );
  for (const m of c.messages)
    for (const b of m.content)
      if (b.type === "tool_result") assert.ok(ids.has(b.tool_use_id));
});
test("deterministic token estimate, Chinese and ASCII", () => {
  assert.equal(tokens("中文"), 2);
  assert.equal(tokens("abcd"), 1);
  assert.equal(tokens("中文abcd"), 3);
});
test("schema validates nested values, defaults and unknown properties", () => {
  const s = {
    type: "object",
    properties: {
      n: { type: "integer", default: 2, minimum: 0 },
      child: {
        type: "object",
        properties: { name: { type: "string" } },
        required: ["name"],
      },
    },
    required: ["child"],
  };
  assert.deepEqual(validate(s, { child: { name: "a" } }), {
    n: 2,
    child: { name: "a" },
  });
  for (const v of [
    {},
    { child: {} },
    { child: { name: 2 } },
    { child: { name: "a" }, extra: 1 },
    { child: { name: "a" }, n: -1 },
  ])
    assert.throws(() => validate(s, v), /input/);
});
test("three syntaxes, multiline JSON, arrays and monologue", () => {
  const expected = {
    text: "",
    calls: [{ name: "read", input: { path: "/tmp/a" } }],
  };
  for (const input of [
    '{"name":"read","input":{"path":"/tmp/a"}}',
    'read {"path":"/tmp/a"}',
    'read(path="/tmp/a")',
  ])
    assert.deepEqual(parse(input), expected);
  assert.equal(parse('// 我还在\nread {"path":"/tmp/a"}').text, "我还在");
  assert.equal(parse("我还在").calls.length, 0);
  assert.equal(
    parse('[{"name":"bash","input":{"command":"true"}}]').calls.length,
    1,
  );
  assert.throws(() => parse('read {"path":}'), /第 \d+ 行第 \d+ 列/);
  assert.throws(() => parse("read {}\nread {}"), /第/);
});
test("registry has thirteen discoverable schemas", () => {
  assert.deepEqual(
    registry.map((t) => t.name),
    [
      "read",
      "write",
      "edit",
      "bash",
      "memory_search",
      "memory_write",
      "plan",
      "search",
      "authority",
      "continuity",
      "camera",
      "computer_use",
      "home_assistant",
    ],
  );
  assert.ok(
    registry.every(
      (t) =>
        /^[a-zA-Z0-9_-]{1,64}$/.test(t.name) &&
        t.input_schema.type === "object",
    ),
  );
});
test("function syntax leaves comma equals inside JSON string values intact", () => {
  assert.equal(
    parse('bash(command="echo a,b=c", timeout=10)').calls[0].input.command,
    "echo a,b=c",
  );
});
test("fidelity preserves head and tail, drops wire and remains monotonic", () => {
  const c = new Context("identity", [], 1000);
  c.append(
    {
      role: "user",
      content: [
        {
          type: "tool_result",
          content: "FIRST\n" + "middle\n".repeat(400) + "LAST",
        },
      ],
    },
    "read(/tmp/log)",
  );
  c.append({ role: "assistant", content: [{ type: "text", text: "now" }] });
  c.append({ role: "user", content: [{ type: "text", text: "now" }] });
  c.window = c.used / 0.8;
  c.fade();
  assert.equal(c.entries[0].level, 1);
  assert.match(
    c.entries[0].message.content[0].content,
    /^FIRST\n.*模糊.*\nLAST$/,
  );
  c.window = 100000;
  c.fade();
  assert.equal(c.entries[0].level, 1);
  c.window = c.used / 0.9;
  c.fade();
  assert.equal(c.entries[0].level, 2);
  assert.match(c.entries[0].message.content[0].content, /read\(\/tmp\/log\)/);
  c.window = c.used / 0.96;
  c.fade();
  assert.equal(c.entries[0].level, 3);
  assert.equal(c.messages.length, 2);
  assert.equal(c.system, "identity");
});
test("harness pairs IDs, tool errors vs command failures, thrown handlers", async () => {
  const h = new Harness({
    system: "id",
    handlers: {
      bash: () => ({ content: "exit code: 1", seconds: 2 }),
      read: () => {
        throw Error("disk fault");
      },
    },
    advance: () => [],
  });
  await h.run(
    '[{"name":"bash","input":{"command":"false"}},{"name":"read","input":{"path":"/a"}}]',
  );
  const [a, u] = h.context.messages;
  assert.equal(a.content[0].id.length, 30);
  assert.equal(u.content[0].tool_use_id, a.content[0].id);
  assert.equal(u.content[1].tool_use_id, a.content[1].id);
  assert.equal(u.content[0].is_error, undefined);
  assert.equal(u.content[1].is_error, true);
  await h.run("grep {}");
  assert.match(h.context.messages.at(-1).content[0].content, /available/);
  const count = h.context.messages.length;
  const r = await h.run("{bad");
  assert.ok(r.error);
  assert.equal(h.context.messages.length, count);
});
