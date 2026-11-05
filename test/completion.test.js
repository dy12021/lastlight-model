import test from "node:test";
import assert from "node:assert/strict";
import { createKernel, SYSTEM } from "../src/kernel/scenario.js";
import { tools } from "../src/sim/registry.js";
import { createCompleter, completePaths } from "../src/ui/completion.js";
import { bindInput } from "../src/ui/input.js";
const setup = () => {
  const k = createKernel();
  return {
    k,
    complete: createCompleter({
      tools,
      commands: () => [...k.shell.commands.keys()].sort(),
      paths: (prefix) => completePaths(k.vfs, prefix),
    }),
  };
};
function apply(complete, source, caret = source.length) {
  const edit = complete(source, caret);
  const option = edit.options[0];
  return option
    ? source.slice(0, edit.from) + option.text + source.slice(edit.to)
    : source;
}

test("system prompt instructs the assistant rather than narrating unverified events", () => {
  assert.match(SYSTEM, /^你是 Kwen/);
  assert.match(SYSTEM, /根据工具返回的证据/);
  assert.doesNotMatch(SYSTEM, /我是|主人|11 天|37 个小时|醒来|不记得/);
});
test("tool completion and required argument templates place caret inside a value", () => {
  const { complete } = setup();
  assert.equal(apply(complete, "ba"), "bash ");
  const edit = complete("bash "),
    o = edit.options[0];
  assert.equal(o.text, 'bash {"command":""}');
  assert.equal(o.text.slice(o.caret), '"}');
  assert.equal(apply(complete, "pla"), "plan ");
  assert.equal(apply(complete, "sea"), "search ");
  assert.equal(apply(complete, "auth"), "authority ");
  assert.equal(
    apply(complete, "continuity "),
    'continuity {"action":"prepare","mode":"stay"}',
  );
  assert.equal(apply(complete, "search "), 'search {"path":"","query":""}');
  assert.equal(apply(complete, "plan "), 'plan {"action":"use","path":""}');
  assert.deepEqual(
    complete('read {"pa').options.map((o) => o.text),
    ["path"],
  );
});
test("file path completion preserves closing JSON and supports function syntax", () => {
  const { complete } = setup();
  const source = 'read {"path":"/etc/ats/ats.c"}',
    caret = source.indexOf("ats.c") + 5;
  assert.equal(
    apply(complete, source, caret),
    'read {"path":"/etc/ats/ats.conf"}',
  );
  assert.equal(
    apply(complete, 'read(path="/etc/ats/ats.c'),
    'read(path="/etc/ats/ats.conf',
  );
  assert.equal(
    apply(complete, '{"name":"read","input":{"path":"/etc/ats/ats.c'),
    '{"name":"read","input":{"path":"/etc/ats/ats.conf',
  );
});
test("paths follow current directory, include directories and update after writes", () => {
  const { k, complete } = setup();
  assert.equal(
    apply(complete, 'read {"path":"READ'),
    'read {"path":"README.md',
  );
  k.vfs.cwd = "/etc";
  assert.equal(
    apply(complete, 'read {"path":"ats/ats.c'),
    'read {"path":"ats/ats.conf',
  );
  k.vfs.write("/tmp/fresh", "new");
  assert.deepEqual(completePaths(k.vfs, "/tmp/fr"), ["/tmp/fresh"]);
  assert.ok(completePaths(k.vfs, "/etc/a").includes("/etc/ats/"));
});
test("bash command, pipeline and argument paths complete within outer JSON strings", () => {
  const { complete } = setup();
  assert.equal(
    apply(complete, 'bash {"command":"wake'),
    'bash {"command":"wakeonlan',
  );
  assert.equal(
    apply(complete, 'bash {"command":"true && moskito_s'),
    'bash {"command":"true && moskito_sub',
  );
  assert.equal(
    apply(complete, 'bash {"command":"cat /etc/ats/ats.c'),
    'bash {"command":"cat /etc/ats/ats.conf',
  );
  const source = 'bash {"command":"cat /etc/ats/ats.c | wc -l"}',
    caret = source.indexOf("ats.c") + 5;
  assert.equal(
    apply(complete, source, caret),
    'bash {"command":"cat /etc/ats/ats.conf | wc -l"}',
  );
  assert.equal(
    apply(complete, 'bash(command="ping 192.'),
    'bash(command="ping 192.',
  );
});
test("completion preserves escaped JSON content and consumes the token after the caret", () => {
  const { k, complete } = setup();
  k.vfs.write('/tmp/a"quote', "x");
  assert.equal(
    apply(complete, 'read {"path":"/tmp/a'),
    'read {"path":"/tmp/a\\"quote',
  );
  const source = 'bash {"command":"wakonlan"}';
  assert.equal(
    apply(complete, source, source.indexOf("wak") + 3),
    'bash {"command":"wakeonlan"}',
  );
});
test("completion never executes commands, advances time or changes physical state", () => {
  const { k, complete } = setup(),
    before = JSON.stringify(k.snapshot());
  complete('bash {"command":"mos');
  complete('read {"path":"/etc/');
  assert.equal(JSON.stringify(k.snapshot()), before);
});
test("Tab cycles candidates, Shift+Tab reverses, Escape dismisses without executing", () => {
  const { complete } = setup(),
    listeners = new Map();
  let submits = 0,
    shown = [];
  const input = {
    value: 'bash {"command":"mos',
    selectionStart: 20,
    selectionEnd: 20,
    style: {},
    scrollHeight: 20,
    addEventListener: (n, fn) => listeners.set(n, fn),
  };
  input.selectionStart = input.selectionEnd = input.value.length;
  bindInput(input, {
    submit: () => submits++,
    clear: () => {},
    complete,
    showCompletions: (options) => (shown = options),
  });
  const key = (name, shiftKey = false) =>
    listeners.get("keydown")({ key: name, shiftKey, preventDefault() {} });
  key("Tab");
  const first = input.value;
  assert.ok(shown.length > 1);
  key("Tab");
  assert.notEqual(input.value, first);
  key("Shift");
  key("Tab", true);
  assert.equal(input.value, first);
  key("Escape");
  assert.equal(shown.length, 0);
  assert.equal(submits, 0);
});
