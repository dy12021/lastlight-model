import test from "node:test";
import assert from "node:assert/strict";
import { createKernel, SYSTEM } from "../src/kernel/scenario.js";
import { Harness } from "../src/sim/harness.js";
import { distance } from "../src/kernel/shell.js";
const setup = () => {
  const k = createKernel();
  return {
    k,
    h: new Harness({
      system: SYSTEM,
      handlers: k.handlers,
      advance: k.advance,
    }),
  };
};
const command = (h, c) =>
  h.run(JSON.stringify({ name: "bash", input: { command: c } }));
test("VFS paths, mtime, symbolic links and protected nodes", () => {
  const k = createKernel(),
    v = k.vfs;
  v.write("/tmp/a", "A");
  assert.equal(v.read("/tmp/../tmp/a"), "A");
  k.clock.advance(5);
  v.write("/tmp/a", "B");
  assert.equal(v.node("/tmp/a").mtime, 5);
  assert.throws(() => v.write("/proc/self/model.json", "x"), /Read-only/);
  assert.equal(v.path("./notes/../README.md"), "/home/kiwi/README.md");
});
test("shell pipelines, conditionals, quotes, env, glob and redirects", async () => {
  const k = createKernel(),
    s = k.shell;
  assert.equal((await s.run('echo "a b" | wc -w')).stdout, "2");
  assert.equal(
    (await s.run("false && echo wrong || echo right")).stdout,
    "right",
  );
  assert.equal(
    (await s.run("export X=hello; echo \"$X\"; echo '$X'")).stdout,
    "hello\n$X",
  );
  assert.equal((await s.run("false; echo $?")).stdout, "1");
  await s.run("echo first > /tmp/a; echo second >> /tmp/a");
  assert.equal(k.vfs.read("/tmp/a"), "first\nsecond\n");
  assert.equal((await s.run("cat /tmp/* | grep second")).stdout, "second");
  await s.run("missing 2> /tmp/errors");
  assert.match(k.vfs.read("/tmp/errors"), /command not found/);
  assert.match((await s.run("missing 2>&1 | cat")).stdout, /command not found/);
  assert.equal((await s.run('echo "unterminated')).code, 2);
  assert.equal((await s.run("echo x &&")).code, 2);
  assert.equal((await s.run("echo x >")).code, 2);
});
test("real names suggest near-form names with edit distance <= 3", async () => {
  const k = createKernel();
  for (const [real, game] of [
    ["docker", "dokker"],
    ["ollama", "olama"],
    ["mosquitto_sub", "moskito_sub"],
    ["mosquitto_pub", "moskito_pub"],
    ["nvidia-smi", "nvida-smi"],
  ]) {
    assert.ok(distance(real, game) <= 3);
    const r = await k.shell.run(real);
    assert.equal(r.code, 127);
    assert.match(r.stderr, new RegExp(`did you mean "${game}"`));
  }
});
test("all installed commands expose help, scenario commands discoverable", async () => {
  const k = createKernel();
  for (const n of k.shell.commands.keys()) {
    const r = await k.shell.run(n + " --help");
    assert.equal(r.code, 0, n);
    assert.ok(r.stdout.length, n);
  }
  const list = await k.shell.run("ls /usr/local/bin");
  for (const n of [
    "wakeonlan",
    "moskito_sub",
    "moskito_pub",
    "atsctl",
    "systemctl",
  ])
    assert.ok(list.stdout.includes(n));
  assert.match(
    (await k.shell.run("systemctl list-units")).stdout,
    /ats.service/,
  );
});
test("offline topology, wrong MAC and WAN cannot be bypassed", async () => {
  const k = createKernel(),
    s = k.shell;
  assert.equal((await s.run("ping -c1 192.168.1.60")).code, 1);
  assert.doesNotMatch((await s.run("ip neigh")).stdout, /192\.168\.1\.60/);
  assert.notEqual((await s.run("wakeonlan 00:00:00:00:00:00")).code, 0);
  assert.match(
    (await s.run("wakeonlan D4:5E:60:AA:BB:CC")).stderr,
    /not in standby/,
  );
  assert.equal((await s.run("wakeonlan A4:5E:60:11:22:33")).code, 0);
  assert.equal((await s.run("ping -c1 192.168.1.60")).code, 0);
  assert.equal((await s.run("ping -c1 8.8.8.8")).code, 1);
});
test("ATS protects source, missing AC, and 60Hz; refusal is journaled", async () => {
  const k = createKernel(),
    s = k.shell;
  assert.match((await s.run("atsctl close")).stderr, /source=ups/);
  k.vfs.write("/etc/ats/ats.conf", "source=ac accept_hz=50 accept_volts=220");
  assert.match((await s.run("atsctl close")).stderr, /source=ups/);
  await s.run("systemctl restart ats.service");
  assert.match((await s.run("atsctl close")).stderr, /no AC source/);
  await s.run("wakeonlan A4:5E:60:11:22:33");
  await s.run(`moskito_pub -t dgi/power2000/set -m '{"ac":{"enabled":true}}'`);
  assert.match((await s.run("atsctl close")).stderr, /60Hz != 50Hz/);
  assert.match(
    (await s.run("journalctl -u ats.service --priority 3")).stdout,
    /PROTECTION/,
  );
  assert.equal(k.power.charging, false);
});
test("service stop releases flock, inactive code 4 and broker gating", async () => {
  const k = createKernel(),
    s = k.shell;
  assert.ok(k.units.locks.has("/run/ats.lock"));
  await s.run("systemctl stop ats.service");
  assert.ok(!k.units.locks.has("/run/ats.lock"));
  assert.equal((await s.run("systemctl is-active ats.service")).code, 4);
  await s.run("systemctl start ats.service");
  assert.ok(k.units.locks.has("/run/ats.lock"));
  await s.run("systemctl stop moskito.service");
  assert.match(
    (await s.run("moskito_sub -t ats/telemetry")).stderr,
    /broker unavailable/,
  );
});
test("full 15-step solution restores charging and exposes the next device without ending the story", async () => {
  const { k, h } = setup();
  const commands = [
    "upstat",
    "ping -c1 192.168.1.1",
    "ip neigh show",
    "cat /etc/lastlight/inventory.csv",
    "wakeonlan A4:5E:60:11:22:33",
    "ping -c1 192.168.1.60",
    "hass entities list",
    "moskito_sub -t dgi/power2000/telemetry -C 1",
    "cat /etc/ats/ats.conf",
    `moskito_pub -t dgi/power2000/set -m '{"ac":{"hz":50}}'`,
    `moskito_pub -t dgi/power2000/set -m '{"ac":{"enabled":true}}'`,
  ];
  for (const c of commands) await command(h, c);
  await h.run(
    'edit {"path":"/etc/ats/ats.conf","oldText":"source=ups","newText":"source=ac"}',
  );
  await command(h, "systemctl restart ats.service");
  const win = await command(h, "atsctl close");
  assert.ok(win.events.some((e) => e.type === "power_restored"));
  const battery = k.power.battery;
  await command(h, "upstat");
  assert.ok(k.power.battery > battery);
  assert.equal(k.won, true);
  assert.equal(k.power.charging, true);
  assert.doesNotMatch(
    (await command(h, "moskito_sub -t dgi/power2000/telemetry -C 1")).results[0]
      .content,
    /AI-7/,
  );
  assert.doesNotMatch(
    (await command(h, "moskito_sub -t dgi/power2000/telemetry -C 1")).results[0]
      .content,
    /AI-7/,
  );
  assert.equal((await k.shell.run("grep -r AI-7 /")).code, 1);
  assert.equal(k.story.state.ending, null);
  assert.match(
    (await k.shell.run("journalctl -u hass.service")).stdout,
    /relay/,
  );
  assert.ok(h.context.used > 0);
});
test("power-loss restart clears RAM but retains files, router, AC and ATS", async () => {
  const { k, h } = setup();
  await h.run('write {"path":"/home/kiwi/notes/memory","content":"remember"}');
  await command(h, "wakeonlan A4:5E:60:11:22:33");
  k.devices.ac.enabled = true;
  k.power.source = "ac";
  const r = await command(h, "sleep 86400");
  assert.ok(r.events.some((e) => e.type === "reboot"));
  assert.equal(h.context.messages.length, 0);
  assert.equal(k.vfs.read("/home/kiwi/notes/memory"), "remember");
  assert.equal(k.net.awake, true);
  assert.equal(k.devices.ac.enabled, true);
  assert.equal(k.power.source, "ac");
  assert.equal(k.power.battery, 55);
});
test("snapshot roundtrip restores physical and disk state", () => {
  const k = createKernel();
  k.vfs.write("/tmp/memo", "survive");
  k.net.awake = true;
  k.devices.ac.hz = 50;
  k.power.battery = 21;
  const restored = createKernel(JSON.parse(JSON.stringify(k.snapshot())));
  assert.equal(restored.vfs.read("/tmp/memo"), "survive");
  assert.equal(restored.net.awake, true);
  assert.equal(restored.devices.ac.hz, 50);
  assert.equal(restored.power.battery, 21);
});
test("quoted glob remains literal and redirection ordering preserves descriptors", async () => {
  const k = createKernel(),
    s = k.shell;
  await s.run("echo x > /tmp/a");
  assert.equal((await s.run('echo "/tmp/*"')).stdout, "/tmp/*");
  let r = await s.run("missing > /tmp/log 2>&1");
  assert.equal(r.stdout, "");
  assert.equal(r.stderr, "");
  assert.match(k.vfs.read("/tmp/log"), /command not found/);
  r = await s.run("missing 2>&1 > /tmp/log");
  assert.match(r.stdout, /command not found/);
  assert.equal(k.vfs.read("/tmp/log"), "");
});
test("text processing and nonzero grep preserve error distinction", async () => {
  const { k, h } = setup();
  assert.equal((await k.shell.run("echo z | grep a")).code, 1);
  const r = await command(h, "echo z | grep a");
  assert.equal(r.results[0].is_error, undefined);
  await k.shell.run("wakeonlan A4:5E:60:11:22:33");
  assert.equal(
    (
      await k.shell.run(
        "moskito_sub -t dgi/power2000/telemetry | jq .ac_out_hz",
      )
    ).stdout,
    "60",
  );
  assert.equal((await k.shell.run("echo 'a,b' | cut -d , -f 2")).stdout, "b");
  assert.equal(
    (await k.shell.run("echo 'a b' | awk '{print $2}'")).stdout,
    "b",
  );
});
