import test from "node:test";
import assert from "node:assert/strict";
import { CommandHistory, bindInput } from "../src/ui/input.js";

test("history keeps order, skips adjacent duplicates and restores unfinished draft", () => {
  const history = new CommandHistory();
  history.push("read {}");
  history.push("bash {}");
  history.push("bash {}");
  assert.equal(history.move(-1, "unfinished"), "bash {}");
  assert.equal(history.move(-1, "bash {}"), "read {}");
  assert.equal(history.move(-1, "read {}"), "read {}");
  assert.equal(history.move(1, "read {}"), "bash {}");
  assert.equal(history.move(1, "bash {}"), "unfinished");
});
test("completion resolves unique tools and commands without changing JSON arguments", () => {
  const history = new CommandHistory();
  assert.equal(history.complete("ba"), "bash ");
  assert.equal(history.complete("/con"), "/context");
  assert.equal(history.complete("/"), " /".trim());
  assert.equal(
    history.complete('read {"path":"/tmp"}'),
    'read {"path":"/tmp"}',
  );
});
test("terminal submits Enter, retains Shift+Enter, ignores IME and clears with Ctrl+L", () => {
  const listeners = new Map();
  let submits = 0,
    clears = 0;
  const input = {
    value: "",
    style: {},
    scrollHeight: 20,
    selectionStart: 0,
    selectionEnd: 0,
    addEventListener: (type, fn) => listeners.set(type, fn),
  };
  bindInput(input, { submit: () => submits++, clear: () => clears++ });
  const key = (props) => {
    let prevented = false;
    listeners.get("keydown")({
      key: "Enter",
      preventDefault: () => (prevented = true),
      ...props,
    });
    return prevented;
  };
  assert.equal(key({}), true);
  assert.equal(submits, 1);
  assert.equal(key({ shiftKey: true }), false);
  assert.equal(submits, 1);
  assert.equal(key({ isComposing: true }), false);
  assert.equal(submits, 1);
  assert.equal(key({ key: "l", ctrlKey: true }), true);
  assert.equal(clears, 1);
});
