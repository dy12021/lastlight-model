import test from "node:test";
import assert from "node:assert/strict";
import { createKernel } from "../src/kernel/scenario.js";
import { Harness } from "../src/sim/harness.js";

test("search recursively respects scope, filenames and case, returning exact line locations", () => {
  const k = createKernel();
  k.vfs.write("/tmp/scope/a.conf", "first\nSource=ups\nsource=ac");
  k.vfs.write("/tmp/scope/nested/b.conf", "source=backup");
  k.vfs.write("/tmp/scope/readme.md", "source documentation");
  k.vfs.write("/tmp/scope-other/leak.conf", "source=outside");
  k.vfs.nodes.set("/tmp/scope/alias.conf", {
    type: "link",
    target: "/tmp/scope-other/leak.conf",
  });
  const before = JSON.stringify(k.snapshot());
  const search = (input) => JSON.parse(k.handlers.search(input).content);
  const r = search({ path: "/tmp/scope", query: "source", glob: "*.conf" });
  assert.equal(r.matches.length, 3);
  assert.deepEqual(
    r.matches.map((m) => m.line),
    [2, 3, 1],
  );
  assert.equal(r.skipped_links, 1);
  assert.equal(r.files_scanned, 2);
  assert.equal(r.truncated, false);
  assert.ok(r.matches.every((m) => m.path.startsWith("/tmp/scope/")));
  assert.equal(
    search({
      path: "/tmp/scope",
      query: "Source",
      glob: "**/*.conf",
      case_sensitive: true,
    }).matches.length,
    1,
  );
  assert.equal(
    search({ path: "/tmp/scope/a.conf", query: "first" }).matches.length,
    1,
  );
  assert.equal(
    search({ path: "/tmp/scope", query: "absent" }).matches.length,
    0,
  );
  assert.throws(
    () => search({ path: "/tmp/missing", query: "source" }),
    /not found/,
  );
  assert.throws(
    () => search({ path: "/tmp/scope/alias.conf", query: "source" }),
    /symbolic link/,
  );
  assert.equal(JSON.stringify(k.snapshot()), before);
});

test("search caps returned rows and scanned content while retaining matches on long lines", () => {
  const k = createKernel(),
    search = (input) => JSON.parse(k.handlers.search(input).content);
  k.vfs.write(
    "/tmp/limits/long",
    "x".repeat(1500) + "tail_marker\nsecond tail_marker\nthird tail_marker",
  );
  let r = search({ path: "/tmp/limits", query: "tail_marker", max_results: 1 });
  assert.equal(r.matches.length, 1);
  assert.match(r.matches[0].text, /tail_marker/);
  assert.ok(r.matches[0].text.length < 300);
  assert.equal(r.truncated, true);
  k.vfs.write("/tmp/huge", "x".repeat(2000010) + "unscanned");
  r = search({ path: "/tmp/huge", query: "unscanned" });
  assert.equal(r.matches.length, 0);
  assert.equal(r.characters_scanned, 2000000);
  assert.equal(r.truncated, true);
  for (let i = 0; i < 501; i++) k.vfs.write("/tmp/many/" + i, "needle");
  r = search({ path: "/tmp/many", query: "absent" });
  assert.equal(r.files_scanned, 500);
  assert.equal(r.truncated, true);
});

test("agent search is discoverable, paired and charged; invalid arguments return tool errors", async () => {
  const k = createKernel(),
    h = new Harness({
      system: "test",
      handlers: k.handlers,
      advance: k.advance,
    });
  const before = k.clock.seconds;
  await h.run('search {"path":"/etc","query":"source","glob":"*.conf"}');
  const use = h.context.messages[0].content[0],
    result = h.context.messages[1].content[0];
  assert.equal(use.name, "search");
  assert.equal(result.tool_use_id, use.id);
  assert.ok(!result.is_error);
  assert.ok(
    JSON.parse(result.content).matches.some(
      (m) => m.path === "/etc/ats/ats.conf",
    ),
  );
  assert.equal(k.clock.seconds, before + 5);
  for (const input of [
    { path: "/etc", query: "" },
    { path: "/etc", query: "source", max_results: 101 },
    { path: "/etc", query: "source", case_sensitive: "yes" },
  ]) {
    await h.run(JSON.stringify({ name: "search", input }));
    assert.equal(h.context.messages.at(-1).content[0].is_error, true);
  }
});
