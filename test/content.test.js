import test from "node:test";
import assert from "node:assert/strict";
import { createKernel, SYSTEM } from "../src/kernel/scenario.js";
import { HOME_README, LEGACY_HOME_README } from "../src/kernel/content.js";
import { tools } from "../src/sim/registry.js";
import { refreshLegacyContext } from "../src/ui/legacy.js";

test("model context and household notes contain no onboarding or solution script", () => {
  assert.doesNotMatch(SYSTEM, /模拟环境|设备清单|--help|从这里开始/);
  assert.doesNotMatch(JSON.stringify(tools), /模拟|玩家|通关/);
  assert.doesNotMatch(
    createKernel().vfs.read("/home/kiwi/README.md"),
    /moskito_sub|moskito_pub|ats.conf|systemctl|查找工具|设备清单/,
  );
});

test("legacy seeded README upgrades without resetting physical state or personal notes", () => {
  const k = createKernel();
  k.vfs.write("/home/kiwi/README.md", LEGACY_HOME_README);
  k.vfs.write("/home/kiwi/notes/mine", "保留");
  k.net.awake = true;
  k.power.battery = 31;
  const loaded = createKernel(k.snapshot());
  assert.equal(loaded.vfs.read("/home/kiwi/README.md"), HOME_README);
  assert.equal(loaded.vfs.read("/home/kiwi/notes/mine"), "保留");
  assert.equal(loaded.net.awake, true);
  assert.equal(loaded.power.battery, 31);
  k.vfs.write("/home/kiwi/README.md", "my own README");
  assert.equal(
    createKernel(k.snapshot()).vfs.read("/home/kiwi/README.md"),
    "my own README",
  );
});

test("legacy context migration changes only exact obsolete tool results", () => {
  const numbered = LEGACY_HOME_README.split("\n")
    .map((line, i) => `${i + 1}\t${line}`)
    .join("\n");
  const entries = [
    {
      id: 1,
      level: 0,
      message: {
        role: "user",
        content: [
          { type: "tool_result", tool_use_id: "a", content: numbered },
          { type: "tool_result", tool_use_id: "b", content: "my notes" },
          { type: "text", text: LEGACY_HOME_README },
        ],
      },
    },
    { id: 2, level: 3, message: null },
  ];
  refreshLegacyContext(entries);
  assert.match(entries[0].message.content[0].content, /# kiwi.cpp/);
  assert.equal(entries[0].message.content[0].tool_use_id, "a");
  assert.equal(entries[0].message.content[1].content, "my notes");
  assert.equal(entries[0].message.content[2].text, LEGACY_HOME_README);
  assert.equal(entries[1].message, null);
});
