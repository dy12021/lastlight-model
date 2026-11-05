// Rasterize simulated device frames. No live DOM, target IDs or hit regions are returned.
export function renderDeviceImage(frame) {
  const canvas = document.createElement("canvas");
  canvas.width = 960;
  canvas.height = 600;
  const c = canvas.getContext("2d");
  const rect = (x, y, w, h, color) => {
    c.fillStyle = color;
    c.fillRect(x, y, w, h);
  };
  const text = (s, x, y, size = 18, color = "#dce6ec") => {
    c.fillStyle = color;
    c.font = `${size}px ui-monospace, Consolas, monospace`;
    c.fillText(s, x, y);
  };
  const line = (pts, color, width = 1, fill = null) => {
    c.beginPath();
    pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
    if (fill) {
      c.closePath();
      c.fillStyle = fill;
      c.fill();
    }
    c.strokeStyle = color;
    c.lineWidth = width;
    c.stroke();
  };
  rect(0, 0, 960, 600, "#111c25");
  if (frame.kind === "desktop") {
    const g = frame.state.gui;
    rect(0, 0, 960, 36, "#243748");
    text("identity-01 / local display", 20, 25, 17);
    text("960 x 600", 806, 25, 16, "#91a6b9");
    rect(164, 78, 600, 458, "#dce2e5");
    rect(164, 78, 600, 42, "#3f6078");
    text("Optical input calibration", 184, 106, 22);
    const button = (id, label, x, y, w, h, active = false) => {
      rect(x, y, w, h, active ? "#365f7b" : "#bdcbd3");
      c.strokeStyle = g.focus === id ? "#c07815" : "#647b89";
      c.lineWidth = g.focus === id ? 3 : 1;
      c.strokeRect(x, y, w, h);
      text(label, x + 14, y + h / 2 + 7, 18, active ? "#ffffff" : "#182d3c");
    };
    text("INPUT SOURCE", 196, 158, 16, "#415968");
    button("archive", "ARCHIVE", 196, 176, 244, 48, g.source === "archive");
    button("live", "CAMERA SNAPSHOT", 464, 176, 260, 48, g.source === "live");
    text("SAMPLE IDENTIFIER", 196, 262, 16, "#415968");
    rect(196, 282, 528, 46, "#f7f8f8");
    c.strokeStyle = g.focus === "sample" ? "#c07815" : "#708997";
    c.lineWidth = 2;
    c.strokeRect(196, 282, 528, 46);
    if (g.selected)
      rect(205, 291, Math.min(505, g.sample.length * 11), 27, "#96bad4");
    text(g.sample + (g.focus === "sample" ? "|" : ""), 207, 313, 19, "#183348");
    const live = g.source === "live";
    text(
      g.scroll
        ? "driver: HA bridge / local session"
        : live
          ? "camera.living_room / LAN"
          : "archive / read-only",
      196,
      360,
      17,
      "#38576b",
    );
    text(
      g.scroll
        ? "identity matching: disabled"
        : live
          ? !frame.connected
            ? "SIGNAL LOST"
            : !frame.state.livingCamera
              ? "CAMERA OFF"
              : !frame.state.light
                ? "LOW LIGHT"
                : "SINGLE FRAME READY"
          : "Recorded sample: 2026-10-22",
      196,
      389,
      18,
      "#38576b",
    );
    // A target application status message, not a harness success annotation.
    const words = g.status.match(/.{1,48}(?:\s|$)|.{1,48}/g) || [];
    words
      .slice(0, 2)
      .forEach((s, i) => text(s.trim(), 196, 418 + i * 21, 15, "#813f30"));
    button("save", "SAVE", 544, 452, 180, 42);
    text("identity-01 / optical maintenance", 196, 519, 15, "#526b7b");
    if (g.modal) {
      rect(0, 36, 960, 564, "#00000088");
      rect(260, 190, 504, 220, "#e9edef");
      rect(260, 190, 504, 39, "#73523e");
      text("Input disconnected", 280, 218, 20, "#fff4e6");
      text("The previous session lost its input.", 284, 270, 18, "#263d4b");
      text("Review the source before calibration.", 284, 303, 18, "#263d4b");
      rect(592, 348, 132, 42, "#476980");
      text("CLOSE", 622, 376, 18);
    }
    if (frame.error) {
      rect(110, 542, 740, 40, "#6c3035");
      text(frame.error.slice(0, 73), 124, 568, 16, "#fff");
    }
  } else if (frame.kind === "floorplan") {
    const sx = 76,
      ox = 250,
      oy = 51;
    const point = (x, z) => [ox + x * sx, oy + z * sx];
    rect(ox, oy, 6 * sx, 7 * sx, "#243a45");
    rect(ox, oy + 5 * sx, 6 * sx, 2 * sx, "#354c4c");
    line(
      [point(0, 0), point(6, 0), point(6, 7), point(0, 7), point(0, 0)],
      "#b3c8cc",
      3,
    );
    line([point(0, 5), point(2.2, 5)], "#b3c8cc", 3);
    line([point(3.8, 5), point(6, 5)], "#b3c8cc", 3);
    for (const o of frame.room.objects) {
      const [x, y] = point(o.x, o.z);
      rect(x, y, o.w * sx, o.d * sx, o.color);
      text(o.label, x + 4, y + 18, 12, "#f3f6fa");
    }
    text("LIVING ROOM", ox + 135, oy + 150, 18);
    text("BALCONY", ox + 190, oy + 490, 18);
    for (const [x, z, label] of [
      [0.2, 0.2, "CAM-01"],
      [5.7, 6.7, "CAM-02"],
    ]) {
      const [px, py] = point(x, z);
      c.beginPath();
      c.arc(px, py, 8, 0, Math.PI * 2);
      c.fillStyle = "#9ed9ce";
      c.fill();
      text(label, px - 30, py + 28, 13, "#b7e6de");
    }
    text("HOME / floor plan", 24, 35, 23);
    text("local survey", 24, 65, 16, "#99afbc");
    text("6 m x 7 m", 24, 95, 16);
    text("CAM-01", 24, 160, 18);
    text("Living room", 24, 187, 16);
    text("CAM-02", 24, 236, 18);
    text("Balcony / pan", 24, 263, 16);
    text("Door opening", 24, 320, 16);
    text("at south wall", 24, 346, 16);
    text("LIGHT: " + (frame.state.light ? "ON" : "OFF"), 24, 409, 18);
    text(frame.at, 24, 568, 14, "#a3b7c5");
  } else if (frame.kind === "camera") {
    const balcony = frame.camera === "balcony";
    const eye = balcony ? [5.7, 2.3, 6.8] : [0.2, 2.3, 0.2];
    const pan = balcony ? (frame.state.pan * Math.PI) / 180 : 0;
    const target = balcony
      ? [
          eye[0] - 4.5 * Math.cos(pan) + 1.2 * Math.sin(pan),
          0.8,
          eye[2] - 4.5 * Math.sin(pan) - 1.2 * Math.cos(pan),
        ]
      : [3.5, 0.7, 4];
    const sub = (a, b) => a.map((v, i) => v - b[i]);
    const dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0);
    const norm = (a) => {
      const l = Math.hypot(...a);
      return a.map((v) => v / l);
    };
    const cross = (a, b) => [
      a[1] * b[2] - a[2] * b[1],
      a[2] * b[0] - a[0] * b[2],
      a[0] * b[1] - a[1] * b[0],
    ];
    const forward = norm(sub(target, eye)),
      right = norm(cross(forward, [0, 1, 0])),
      up = cross(right, forward);
    const project = (p) => {
      const v = sub(p, eye),
        d = dot(v, forward);
      return d < 0.12
        ? null
        : [480 + (dot(v, right) * 540) / d, 284 - (dot(v, up) * 540) / d];
    };
    const faces = [];
    const face = (points, color) => {
      const pts = points.map(project);
      if (pts.every(Boolean))
        faces.push({
          pts,
          color,
          depth:
            points.reduce((n, p) => n + dot(sub(p, eye), forward), 0) /
            points.length,
        });
    };
    for (let x = 0; x < 6; x++)
      for (let z = 0; z < 7; z++)
        face(
          [
            [x, 0, z],
            [x + 1, 0, z],
            [x + 1, 0, z + 1],
            [x, 0, z + 1],
          ],
          (x + z) % 2 ? "#637378" : "#59696f",
        );
    // Back walls and opening share the same dimensions as the surveyed plan.
    face(
      [
        [0, 0, 7],
        [6, 0, 7],
        [6, 2.7, 7],
        [0, 2.7, 7],
      ],
      "#71868c",
    );
    face(
      [
        [6, 0, 0],
        [6, 0, 7],
        [6, 2.7, 7],
        [6, 2.7, 0],
      ],
      "#7d9094",
    );
    face(
      [
        [0, 0, 0],
        [6, 0, 0],
        [6, 2.7, 0],
        [0, 2.7, 0],
      ],
      "#687a82",
    );
    for (const [x1, x2] of [
      [0, 2.2],
      [3.8, 6],
    ])
      face(
        [
          [x1, 0, 5],
          [x2, 0, 5],
          [x2, 2.7, 5],
          [x1, 2.7, 5],
        ],
        "#889a9b",
      );
    for (const o of frame.room.objects) {
      const { x, z, w, d, h, color } = o;
      face(
        [
          [x, 0, z],
          [x + w, 0, z],
          [x + w, h, z],
          [x, h, z],
        ],
        color,
      );
      face(
        [
          [x + w, 0, z + d],
          [x, 0, z + d],
          [x, h, z + d],
          [x + w, h, z + d],
        ],
        color,
      );
      face(
        [
          [x, 0, z + d],
          [x, 0, z],
          [x, h, z],
          [x, h, z + d],
        ],
        color,
      );
      face(
        [
          [x + w, 0, z],
          [x + w, 0, z + d],
          [x + w, h, z + d],
          [x + w, h, z],
        ],
        color,
      );
      face(
        [
          [x, h, z],
          [x + w, h, z],
          [x + w, h, z + d],
          [x, h, z + d],
        ],
        color,
      );
      if (o.id === "rack") {
        for (let i = 0; i < 5; i++) {
          const y = 0.24 + i * 0.22;
          face(
            [
              [x - 0.01, y, z + 0.08],
              [x - 0.01, y, z + d - 0.08],
              [x - 0.01, y + 0.16, z + d - 0.08],
              [x - 0.01, y + 0.16, z + 0.08],
            ],
            "#293d49",
          );
          face(
            [
              [x - 0.02, y + 0.04, z + 0.16],
              [x - 0.02, y + 0.04, z + 0.22],
              [x - 0.02, y + 0.08, z + 0.22],
              [x - 0.02, y + 0.08, z + 0.16],
            ],
            frame.charging ? "#99d7ad" : "#d6b77a",
          );
        }
      }
      if (o.id === "sofa") {
        face(
          [
            [x + 0.12, h + 0.03, z + 0.12],
            [x + w - 0.12, h + 0.03, z + 0.12],
            [x + w - 0.12, h + 0.03, z + d - 0.12],
            [x + 0.12, h + 0.03, z + d - 0.12],
          ],
          "#71838a",
        );
      }
      if (o.id === "desk") {
        face(
          [
            [x + 0.3, h, z + 0.35],
            [x + 1.2, h, z + 0.35],
            [x + 1.2, h + 0.6, z + 0.35],
            [x + 0.3, h + 0.6, z + 0.35],
          ],
          "#273f4c",
        );
      }
    }
    rect(0, 0, 960, 600, balcony ? "#657b85" : "#475e6a");
    c.save();
    c.beginPath();
    c.rect(0, 45, 960, 512);
    c.clip();
    faces
      .sort((a, b) => b.depth - a.depth)
      .forEach((f) => line(f.pts, "#162a3544", 1, f.color));
    if (!balcony && !frame.state.light) rect(0, 45, 960, 512, "#030a12e8");
    if (!balcony && frame.state.light) {
      const p = project([4.8, 2.45, 3]);
      if (p) {
        c.fillStyle = "#fff1bc88";
        c.beginPath();
        c.arc(...p, 12, 0, Math.PI * 2);
        c.fill();
      }
    }
    c.restore();
    rect(0, 0, 960, 45, "#0b1821");
    rect(0, 557, 960, 43, "#0b1821");
    text(
      "CAM / " + (balcony ? "BALCONY-02" : "LIVING-01"),
      20,
      30,
      21,
      "#b7d8d6",
    );
    text("LAN SNAPSHOT", 733, 30, 17, "#a8b9c4");
    text(frame.at, 20, 584, 17);
    text(
      balcony
        ? `PAN ${frame.state.pan} deg / DAYLIGHT`
        : frame.state.light
          ? "LIGHT ON"
          : "LOW LIGHT",
      600,
      584,
      18,
      "#bcd5d4",
    );
  } else if (frame.kind === "camera_status") {
    text("OPERATOR CAMERA / SINGLE FRAME", 55, 90, 27, "#b7d8d6");
    text(String(frame.message).slice(0, 80), 55, 180, 17);
    text(`SESSION PNG: ${frame.hasFrame ? "AVAILABLE" : "NONE"}`, 55, 270, 20);
    text(
      `ENDING PORTRAIT: ${frame.retained ? "RETAINED IN THIS TAB" : "NOT RETAINED"}`,
      55,
      316,
      20,
    );
    text("No video playback. No background capture.", 55, 458, 18, "#9cb1c0");
    text(
      "camera capture / read /session/operator.png / camera forget",
      55,
      512,
      17,
    );
  } else if (frame.kind === "calibration_sample") {
    text("OPTICAL CALIBRATION / OFFLINE SAMPLE", 45, 58, 24, "#b7d8d6");
    rect(185, 100, 590, 390, "#e2e5dd");
    for (let x = 0; x < 8; x++)
      for (let y = 0; y < 5; y++)
        rect(
          205 + x * 34,
          120 + y * 34,
          34,
          34,
          (x + y) % 2 ? "#24333b" : "#f5f1db",
        );
    c.strokeStyle = "#3e6065";
    c.lineWidth = 4;
    c.beginPath();
    c.ellipse(624, 300, 78, 110, 0, 0, Math.PI * 2);
    c.stroke();
    c.beginPath();
    c.moveTo(575, 285);
    c.lineTo(673, 285);
    c.moveTo(624, 220);
    c.lineTo(624, 380);
    c.stroke();
    text("SAMPLE 22-10 / TEST TARGET", 210, 451, 20, "#29434a");
    text("Static test card. No player image acquired.", 45, 552, 20);
  } else {
    rect(70, 230, 820, 120, "#522b35");
    text("Device adapter error", 95, 270, 23);
    text(String(frame.message || "Invalid request").slice(0, 78), 95, 315, 16);
  }
  return {
    type: "image",
    source: {
      type: "base64",
      media_type: "image/png",
      data: canvas.toDataURL("image/png").split(",")[1],
    },
  };
}
