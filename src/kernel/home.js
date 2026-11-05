// One device model feeds HA, camera frames, the floor plan and the GUI terminal.
export const ROOM = {
  width: 6,
  depth: 7,
  height: 2.7,
  objects: [
    {
      id: "sofa",
      label: "SOFA",
      x: 0.4,
      z: 2.5,
      w: 1,
      d: 2,
      h: 0.8,
      color: "#52636c",
    },
    {
      id: "desk",
      label: "DESK",
      x: 3.9,
      z: 0.5,
      w: 1.6,
      d: 0.8,
      h: 0.8,
      color: "#9c8265",
    },
    {
      id: "rack",
      label: "DGX / UPS",
      x: 4.9,
      z: 2.7,
      w: 0.7,
      d: 1.2,
      h: 1.6,
      color: "#4d5a69",
    },
    {
      id: "table",
      label: "TABLE",
      x: 2.3,
      z: 3.1,
      w: 1.4,
      d: 0.9,
      h: 0.45,
      color: "#8d7460",
    },
    {
      id: "power",
      label: "DGI / AC",
      x: 0.4,
      z: 5.6,
      w: 0.8,
      d: 0.7,
      h: 0.7,
      color: "#8d935d",
    },
    {
      id: "planter",
      label: "PLANTER",
      x: 4.7,
      z: 5.9,
      w: 0.9,
      d: 0.7,
      h: 0.5,
      color: "#776a4d",
    },
  ],
};
export const HOME_FILES = {
  "/etc/home-assistant/devices.json": JSON.stringify(
    {
      instance: "http://127.0.0.1:8123",
      auth: "local maintenance session",
      areas: ["living_room", "balcony"],
      floorplan: "/local/floorplan.png",
      cameras: ["camera.living_room", "camera.balcony"],
      camera_transport: "LAN snapshot via Home Assistant camera proxy",
      gui_terminal: "identity-01 / computer_use / 960x600",
      manual: "/usr/share/doc/home-assistant/api.txt",
    },
    null,
    2,
  ),
  "/usr/share/doc/home-assistant/api.txt": `Home Assistant / 本地集成接口子集
由本机维护会话认证，无需外部令牌。使用 home_assistant 工具调用。
GET /api/states：实体当前状态（离线实体标为 unavailable）。
GET /api/states/ENTITY_ID：一个实体。GET /api/services：可用服务与字段。
POST /api/services/DOMAIN/SERVICE：entity_id 指定目标；number.set_value 另需 value。
GET /api/camera_proxy/camera.living_room 或 camera.balcony：当前快照。
GET /local/floorplan.png：房间与设备位置图。
图像 GET 可另传 save_path，将 PNG 写入虚拟文件，再用 read 读取；不提供视频或自动刷新。
仅上述子集可用；不能 POST states 伪造传感器读数。
远端设备需 RT-01 在线；camera.turn_on/off 控制取流，light.turn_on/off 控制照明。
number.balcony_pan 范围 -60..60 度，由 number.set_value 控制。
所有快照标注来源和采集时间。光线不足时的暗帧仍是有效观测，不能从暗帧推断房间为空。
设备目录：/etc/home-assistant/devices.json
旧身份终端：/usr/share/doc/identity-01/operations.txt
历史巡检调用文件：/home/kiwi/maintenance/ha/
`,
  "/usr/share/doc/identity-01/operations.txt": `identity-01 / commissioning terminal
本地显示器尺寸 960x600，原点左上。使用 computer_use 工具。
screenshot 截图；click x/y；type text；key TAB/SHIFT+TAB/ENTER/BACKSPACE/CTRL+A/ESC；scroll x/y/delta_y。
图片只读；目标桌面不接收宿主页的鼠标和键盘。
本机没有可用的校准 API。更换输入源与样本编号后，在图形窗口保存。
CAMERA SNAPSHOT 输入依赖 camera.living_room 的采集状态和室内照明；每次命令只返回静态图片。
ARCHIVE 输入只能预览旧记录，不能写入新的光学校准。
校准记录：/var/log/identity-01/calibration.json
`,
  "/var/log/home-asistent/optics-watch.log": `automation.optics_watch / pending
identity-01: input source lost after suspend; saved calibration expired.
LAN cameras pending reconnection; local HA inventory: /etc/home-assistant/devices.json
Refresh the optical input and persist a newly observed sample. No identity match requested.
`,
};
const initial = () => ({
  version: 1,
  light: false,
  livingCamera: true,
  balconyCamera: true,
  pan: 0,
  gui: {
    modal: true,
    focus: null,
    source: "archive",
    sample: "",
    selected: false,
    status: "Previous calibration expired.",
    calibrated: false,
    scroll: 0,
  },
});
export function validateHome(s) {
  if (
    !s ||
    s.version !== 1 ||
    ["light", "livingCamera", "balconyCamera"].some(
      (k) => typeof s[k] !== "boolean",
    ) ||
    !Number.isFinite(s.pan) ||
    Math.abs(s.pan) > 60
  )
    throw new Error("home: invalid device state");
  const g = s.gui;
  if (
    !g ||
    typeof g.modal !== "boolean" ||
    ![null, "archive", "live", "sample", "save"].includes(g.focus) ||
    !["archive", "live"].includes(g.source) ||
    typeof g.sample !== "string" ||
    g.sample.length > 48 ||
    typeof g.selected !== "boolean" ||
    typeof g.status !== "string" ||
    g.status.length > 200 ||
    typeof g.calibrated !== "boolean" ||
    !Number.isInteger(g.scroll) ||
    g.scroll < 0 ||
    g.scroll > 1
  )
    throw new Error("home: invalid terminal state");
  if (
    Object.keys(s).some(
      (k) =>
        ![
          "version",
          "light",
          "livingCamera",
          "balconyCamera",
          "pan",
          "gui",
        ].includes(k),
    ) ||
    Object.keys(g).some(
      (k) =>
        ![
          "modal",
          "focus",
          "source",
          "sample",
          "selected",
          "status",
          "calibrated",
          "scroll",
        ].includes(k),
    )
  )
    throw new Error("home: unexpected state field");
  return s;
}
export class Home {
  constructor(k, saved) {
    this.k = k;
    this.state = saved ? structuredClone(validateHome(saved)) : initial();
    for (const [p, c] of Object.entries(HOME_FILES))
      if (!k.vfs.nodes.has(p)) k.vfs.write(p, c);
  }
  snapshot() {
    return structuredClone(this.state);
  }
  get active() {
    return !!this.k.units.table.get("hass.service")?.active;
  }
  get reachable() {
    return this.active && this.k.net.awake;
  }
  states() {
    const remote = (value) => (this.reachable ? value : "unavailable");
    const entity = (entity_id, state, area, attrs = {}) => ({
      entity_id,
      state,
      attributes: { area_id: area, ...attrs },
      last_updated: this.k.clock.iso,
    });
    return [
      entity("sensor.dgi_power2000", remote("online"), "balcony", {
        ac_out_hz: this.k.net.awake ? this.k.devices.ac.hz : null,
      }),
      entity(
        "switch.dgi_ac",
        remote(this.k.devices.ac.enabled ? "on" : "off"),
        "balcony",
      ),
      entity(
        "sensor.ups_battery",
        String(this.k.power.battery.toFixed(1)),
        "living_room",
      ),
      entity(
        "switch.ats",
        this.k.power.closed ? "closed" : "open",
        "living_room",
      ),
      entity(
        "sensor.roof_relay",
        this.k.story?.online ? "linked" : "offline",
        "roof",
        { configuration: "/etc/relay/link.conf" },
      ),
      entity(
        "light.living_room",
        remote(this.state.light ? "on" : "off"),
        "living_room",
      ),
      entity(
        "camera.living_room",
        remote(this.state.livingCamera ? "idle" : "off"),
        "living_room",
        {
          ip: "192.168.1.71",
          snapshot: "/api/camera_proxy/camera.living_room",
        },
      ),
      entity(
        "camera.balcony",
        remote(this.state.balconyCamera ? "idle" : "off"),
        "balcony",
        { ip: "192.168.1.72", snapshot: "/api/camera_proxy/camera.balcony" },
      ),
      entity("number.balcony_pan", remote(String(this.state.pan)), "balcony", {
        min: -60,
        max: 60,
        unit_of_measurement: "°",
      }),
      entity(
        "sensor.identity_calibration",
        this.state.gui.calibrated ? "valid" : "expired",
        "living_room",
        {
          terminal: "identity-01",
          interface: "computer_use",
          work_order: "/var/log/home-asistent/optics-watch.log",
        },
      ),
    ];
  }
  services() {
    return [
      {
        domain: "light",
        services: {
          turn_on: { entity_id: "light.living_room" },
          turn_off: { entity_id: "light.living_room" },
        },
      },
      {
        domain: "camera",
        services: {
          turn_on: { entity_id: ["camera.living_room", "camera.balcony"] },
          turn_off: { entity_id: ["camera.living_room", "camera.balcony"] },
        },
      },
      {
        domain: "number",
        services: {
          set_value: {
            entity_id: "number.balcony_pan",
            value: "-60..60 degrees",
          },
        },
      },
      {
        domain: "switch",
        services: {
          turn_on: { entity_id: "switch.dgi_ac" },
          turn_off: { entity_id: "switch.dgi_ac" },
        },
      },
    ];
  }
  frame(kind, extra = {}) {
    return {
      kind,
      at: this.k.clock.iso,
      state: this.snapshot(),
      connected: this.reachable,
      ac: { ...this.k.devices.ac },
      charging: this.k.power.charging,
      room: ROOM,
      ...extra,
    };
  }
  api({ method = "GET", path, entity_id, value }) {
    if (!this.active) throw new Error("HA 503: hass.service inactive");
    const json = (data) => ({
      content: JSON.stringify(data, null, 2),
      seconds: 2,
    });
    if (method === "GET") {
      if (entity_id !== undefined || value !== undefined)
        throw new Error("HA 400: GET does not accept service fields");
      if (path === "/api/states") return json(this.states());
      if (path === "/api/services") return json(this.services());
      if (path === "/local/floorplan.png")
        return { image: this.frame("floorplan"), seconds: 2 };
      if (path.startsWith("/api/states/")) {
        const e = this.states().find((e) => e.entity_id === path.slice(12));
        if (!e) throw new Error("HA 404: entity not found");
        return json(e);
      }
      if (
        [
          "/api/camera_proxy/camera.living_room",
          "/api/camera_proxy/camera.balcony",
        ].includes(path)
      ) {
        if (!this.reachable)
          throw new Error("HA 503: camera unreachable; RT-01 LAN offline");
        const camera = path.endsWith("living_room") ? "living_room" : "balcony";
        if (
          !this.state[
            camera === "living_room" ? "livingCamera" : "balconyCamera"
          ]
        )
          throw new Error("HA 409: camera stream disabled");
        return { image: this.frame("camera", { camera }), seconds: 3 };
      }
      throw new Error(
        "HA 404: unsupported local path; see /usr/share/doc/home-assistant/api.txt",
      );
    }
    if (method !== "POST") throw new Error("HA 405: method not supported");
    if (!this.k.net.awake) throw new Error("HA 503: RT-01 LAN offline");
    const route = path.match(
      /^\/api\/services\/(light|camera|number|switch)\/(turn_on|turn_off|set_value)$/,
    );
    if (!route)
      throw new Error("HA 404: service not supported; GET /api/services");
    const [, domain, service] = route;
    if (domain === "number") {
      if (
        service !== "set_value" ||
        entity_id !== "number.balcony_pan" ||
        !Number.isFinite(value) ||
        Math.abs(value) > 60
      )
        throw new Error(
          "HA 400: number.balcony_pan requires set_value and value in -60..60",
        );
      this.state.pan = value;
    } else {
      if (!["turn_on", "turn_off"].includes(service) || value !== undefined)
        throw new Error("HA 400: expected turn_on|turn_off without value");
      const prop = {
        "light.living_room": "light",
        "camera.living_room": "livingCamera",
        "camera.balcony": "balconyCamera",
      }[entity_id];
      if (domain === "switch" && entity_id === "switch.dgi_ac")
        this.k.devices.set({ ac: { enabled: service === "turn_on" } });
      else if (prop && entity_id.startsWith(domain + "."))
        this.state[prop] = service === "turn_on";
      else throw new Error("HA 404: entity is not a target for this service");
    }
    this.k.journal.add(
      "hass.service",
      `${domain}.${service} ${entity_id}${value === undefined ? "" : "=" + value}`,
    );
    return json([this.states().find((e) => e.entity_id === entity_id)]);
  }
  computer(input) {
    const g = this.state.gui;
    const error = (message) => ({
      image: this.frame("desktop", { error: message }),
      is_error: true,
      seconds: 0,
    });
    const allowed = {
      screenshot: [],
      click: ["x", "y"],
      type: ["text"],
      key: ["key"],
      scroll: ["x", "y", "delta_y"],
    }[input.action];
    if (
      !allowed ||
      Object.keys(input).some((k) => k !== "action" && !allowed.includes(k)) ||
      allowed.some((k) => !(k in input))
    )
      return error("Invalid action parameters. See computer_use schema.");
    if (
      "x" in input &&
      (!Number.isInteger(input.x) ||
        !Number.isInteger(input.y) ||
        input.x < 0 ||
        input.x >= 960 ||
        input.y < 0 ||
        input.y >= 600)
    )
      return error("Coordinates outside 960 x 600 screen.");
    if (
      input.action === "type" &&
      (typeof input.text !== "string" ||
        input.text.length > 48 ||
        /[\x00-\x1f]/.test(input.text))
    )
      return error("Sample text: 1 line, at most 48 characters.");
    if (
      input.action === "key" &&
      !["TAB", "SHIFT+TAB", "ENTER", "BACKSPACE", "CTRL+A", "ESC"].includes(
        input.key,
      )
    )
      return error("Unsupported key.");
    if (
      input.action === "scroll" &&
      (!Number.isInteger(input.delta_y) || Math.abs(input.delta_y) > 1200)
    )
      return error("Invalid scroll delta.");
    const save = () => {
      if (g.source !== "live")
        g.status = "Archive is read-only. Select a live input.";
      else if (!this.reachable || !this.state.livingCamera)
        g.status = "Live camera unavailable. Check LAN / camera state.";
      else if (!this.state.light)
        g.status = "Insufficient illumination. Sample not saved.";
      else if (!g.sample.trim()) {
        g.status = "Sample identifier required.";
        g.focus = "sample";
      } else {
        const record = {
          source: "camera.living_room",
          sample: g.sample.trim(),
          at: this.k.clock.iso,
          identity_match: false,
        };
        this.k.vfs.write(
          "/var/log/identity-01/calibration.json",
          JSON.stringify(record, null, 2),
        );
        this.k.journal.add(
          "hass.service",
          "identity-01: optical input calibrated; identity match not requested",
        );
        g.calibrated = true;
        g.status = "Calibration saved. Optical input verified.";
      }
    };
    if (input.action === "click") {
      const { x, y } = input;
      if (g.modal) {
        if (x >= 592 && x <= 724 && y >= 348 && y <= 390) g.modal = false;
      } else if (x >= 196 && x <= 724 && y >= 176 && y <= 224) {
        g.source = x < 452 ? "archive" : "live";
        g.focus = g.source;
      } else if (x >= 196 && x <= 724 && y >= 282 && y <= 328) {
        g.focus = "sample";
        g.selected = false;
      } else if (x >= 544 && x <= 724 && y >= 452 && y <= 494) {
        g.focus = "save";
        save();
      } else g.focus = null;
    }
    if (!g.modal && input.action === "type") {
      if (g.focus === "sample") {
        g.sample = (g.selected ? input.text : g.sample + input.text).slice(
          0,
          48,
        );
        g.selected = false;
      }
    }
    if (input.action === "key") {
      if (g.modal) {
        if (["ESC", "ENTER"].includes(input.key)) g.modal = false;
      } else if (["TAB", "SHIFT+TAB"].includes(input.key)) {
        const order = ["archive", "live", "sample", "save"],
          i = order.indexOf(g.focus);
        g.focus =
          i < 0
            ? input.key === "TAB"
              ? "archive"
              : "save"
            : order[(i + (input.key === "TAB" ? 1 : 3) + 4) % 4];
      } else if (input.key === "ENTER") {
        if (["archive", "live"].includes(g.focus)) g.source = g.focus;
        else if (g.focus === "save" || g.focus === "sample") save();
      } else if (input.key === "CTRL+A" && g.focus === "sample")
        g.selected = true;
      else if (input.key === "BACKSPACE" && g.focus === "sample") {
        g.sample = g.selected ? "" : g.sample.slice(0, -1);
        g.selected = false;
      } else if (input.key === "ESC") g.focus = null;
    }
    if (
      input.action === "scroll" &&
      !g.modal &&
      input.x >= 196 &&
      input.x <= 724 &&
      input.y >= 338 &&
      input.y <= 443 &&
      input.delta_y
    )
      g.scroll = input.delta_y > 0 ? 1 : 0;
    return {
      image: this.frame("desktop"),
      seconds: input.action === "screenshot" ? 1 : 2,
    };
  }
}
