import test from "node:test";
import assert from "node:assert/strict";
import { toolTemplate } from "../src/ui/tool-panel.js";
import { tools } from "../src/sim/registry.js";
import { parse } from "../src/sim/parse.js";
import { validate } from "../src/sim/schema.js";
import { Context } from "../src/sim/context.js";
import { addMaintenanceRequest } from "../src/sim/maintenance.js";
import { createKernel } from "../src/kernel/scenario.js";

test("each tool produces a valid complete parameter template and caret inside first value", () => {
  for (const tool of tools) {
    const template = toolTemplate(tool),
      call = parse(template.text).calls[0];
    assert.equal(call.name, tool.name);
    assert.deepEqual(
      Object.keys(call.input),
      tool.name === "memory_write"
        ? ["content"]
        : tool.name === "computer_use"
          ? ["action"]
          : tool.name === "home_assistant"
            ? ["method", "path"]
            : Object.keys(tool.input_schema.properties),
    );
    validate(tool.input_schema, call.input);
    if (template.text.includes(':""')) {
      assert.equal(template.text[template.caret], '"');
      assert.equal(template.text[template.caret - 1], '"');
    } else assert.equal(template.caret, template.text.length);
  }
  assert.match(toolTemplate(tools[0]).text, /"offset":0,"limit":200/);
});
test("maintenance request is an actual user message, appended once without executing tools", () => {
  const k = createKernel(),
    before = JSON.stringify(k.snapshot()),
    c = new Context("system", tools);
  assert.equal(addMaintenanceRequest(c, k.maintenanceRequest()), true);
  assert.equal(addMaintenanceRequest(c, k.maintenanceRequest()), false);
  assert.equal(c.messages.length, 1);
  assert.equal(c.messages[0].role, "user");
  assert.equal(c.messages[0].content[0].type, "text");
  assert.equal(JSON.stringify(k.snapshot()), before);
  const saved = JSON.parse(JSON.stringify(c.entries));
  const restored = new Context("system", tools);
  restored.entries = saved;
  assert.equal(addMaintenanceRequest(restored, k.maintenanceRequest()), false);
});
test("task attachment is discoverable and contains evidence without a solution sequence", () => {
  const k = createKernel(),
    request = k.maintenanceRequest(),
    path = request.match(/告警附件：([^\n]+)/)[1],
    content = k.vfs.read(path);
  assert.match(content, /RT-01 heartbeat=timeout/);
  assert.match(content, /eth0 carrier=1/);
  assert.match(content, /\/etc\/lastlight\/inventory.csv/);
  assert.match(content, /dgi\/power2000\/telemetry/);
  assert.doesNotMatch(
    content,
    /wakeonlan|moskito_pub|systemctl restart|ac.*hz.*50/,
  );
  k.won = true;
  assert.equal(k.maintenanceRequest(), null);
});
test("old saves gain missing alert attachment without overwriting existing files", () => {
  const k = createKernel(),
    path = "/var/log/home-asistent/power-watch.log";
  k.vfs.remove(path);
  const restored = createKernel(k.snapshot());
  assert.match(restored.vfs.read(path), /automation.host_power_watch/);
  restored.vfs.write(path, "my own log");
  assert.equal(createKernel(restored.snapshot()).vfs.read(path), "my own log");
});
