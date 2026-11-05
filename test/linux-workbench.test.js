import test from "node:test";
import assert from "node:assert/strict";
import { createKernel } from "../src/kernel/scenario.js";
import { Harness } from "../src/sim/harness.js";
import { wire } from "../src/sim/wire.js";
import { planSteps, currentPlanView } from "../src/ui/workbench.js";
test("help, type, command and compgen expose available shell commands", async () => {
  const k = createKernel(),
    s = k.shell;
  assert.match((await s.run("help")).stdout, /Shell builtins/);
  assert.match((await s.run("help cd")).stdout, /cd \[directory\]/);
  assert.equal((await s.run("type cd")).stdout, "cd is a shell builtin");
  assert.equal((await s.run("command -v help")).stdout, "help");
  assert.equal((await s.run("command -v missing")).code, 1);
  assert.match((await s.run("compgen -c mos")).stdout, /moskito_sub/);
  assert.equal((await s.run("command echo hello")).stdout, "hello");
});
test("long ls displays modes, hidden entries, links, size and date; path executables work", async () => {
  const k = createKernel();
  k.vfs.write("/tmp/.hidden", "x");
  const r = await k.shell.run("ls -la /tmp");
  assert.match(r.stdout, /drwxr-xr-x.*\./);
  assert.match(r.stdout, /-rw-r--r--.*\.hidden/);
  assert.doesNotMatch((await k.shell.run("ls /tmp")).stdout, /hidden/);
  assert.match(
    (await k.shell.run("ls -l /bin/ls")).stdout,
    /lrw.* -> \/usr\/local\/bin\/ls/,
  );
  assert.equal((await k.shell.run("/bin/echo hi")).stdout, "hi");
  assert.equal((await k.shell.run("/usr/bin/pwd")).stdout, "/home/kiwi");
});
test("tilde, cd -, newline sequences, history and test expressions have shell semantics", async () => {
  const k = createKernel(),
    s = k.shell;
  assert.equal((await s.run("cd /tmp; cd -")).stdout, "/home/kiwi");
  assert.equal((await s.run("cd ~; pwd")).stdout, "/home/kiwi");
  assert.equal((await s.run("echo one\necho two")).stdout, "one\ntwo");
  assert.equal((await s.run("test -d /tmp && echo yes")).stdout, "yes");
  assert.equal((await s.run("[ 5 -gt 2 ]")).code, 0);
  assert.equal((await s.run("[ -f /missing ]")).code, 1);
  assert.equal((await s.run("[ 1 -eq 1")).code, 2);
  assert.match((await s.run("history 2")).stdout, /history 2/);
});
test("current plan is read-only and direct plan tool selects it without shell or clock effects", async () => {
  const k = createKernel(),
    content = "# repair\n- [ ] 检查电源\n- [x] 查看日志";
  k.handlers.write({ path: "/home/kiwi/a.plan", content });
  k.vfs.write("/tmp/other.plan", "other");
  const before = JSON.stringify(k.snapshot());
  const view = currentPlanView(k);
  assert.equal(view.path, "/home/kiwi/a.plan");
  assert.equal(view.steps.length, 2);
  assert.equal(view.steps[1].done, true);
  assert.equal(JSON.stringify(k.snapshot()), before);
  assert.equal(currentPlanView(createKernel()), null);
  const planResult = k.handlers.plan({
    action: "use",
    path: "/tmp/other.plan",
  });
  assert.equal(planResult.seconds, 0);
  assert.equal(JSON.parse(planResult.content).path, "/tmp/other.plan");
  assert.equal(currentPlanView(k).content, "other");
  const restored = createKernel(k.snapshot());
  assert.equal(restored.currentPlan, "/tmp/other.plan");
  assert.throws(
    () => k.handlers.plan({ action: "use", path: "/missing.plan" }),
    /file not found/,
  );
  assert.throws(() => k.handlers.plan({ action: "invalid" }), /expected/);
  assert.throws(
    () => k.handlers.plan({ action: "status", path: "/tmp/other.plan" }),
    /only accepted/,
  );
  assert.equal(k.currentPlan, "/tmp/other.plan");
  assert.equal(
    JSON.parse(k.handlers.plan({ action: "status" }).content).content,
    "other",
  );
  k.handlers.plan({ action: "clear" });
  assert.equal(currentPlanView(k), null);
  assert.equal(k.vfs.read("/tmp/other.plan"), "other");
  assert.equal(k.shell.commands.has("plan"), false);
});
test("clear requests a display effect while keeping kernel state and output intact", async () => {
  const k = createKernel();
  const result = await k.handlers.bash({ command: "clear; echo remaining" });
  assert.deepEqual(result.effects, ["clear-screen"]);
  assert.match(result.content, /remaining/);
});

test("plan is an agent tool with paired results and enum validation in the wire", async () => {
  const k = createKernel(),
    h = new Harness({
      system: "test",
      handlers: k.handlers,
      advance: k.advance,
    });
  k.vfs.write("/tmp/check.plan", "- [ ] inspect");
  const before = k.clock.seconds;
  await h.run('plan {"action":"use","path":"/tmp/check.plan"}');
  assert.equal(k.currentPlan, "/tmp/check.plan");
  assert.equal(k.clock.seconds, before);
  const request = wire(h.context);
  assert.ok(request.tools.some((t) => t.name === "plan"));
  const use = request.messages[0].content[0],
    result = request.messages[1].content[0];
  assert.equal(use.name, "plan");
  assert.equal(result.tool_use_id, use.id);
  assert.ok(!result.is_error);
  await h.run('plan {"action":"delete"}');
  assert.equal(h.context.messages.at(-1).content[0].is_error, true);
  assert.equal(k.currentPlan, "/tmp/check.plan");
  assert.equal((await k.shell.run("command -v plan")).code, 1);
});
