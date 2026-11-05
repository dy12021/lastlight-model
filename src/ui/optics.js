const PHOTO_KEY = "lastlight.camera.session.v2";
const OLD_PHOTO_KEY = "lastlight.camera.session.v1";
export function cameraMessage(error) {
  if (error?.name === "NotAllowedError")
    return "未获得摄像头权限。可使用离线样本继续，不影响剧情。";
  if (error?.name === "NotFoundError")
    return "没有可用摄像头。可使用离线样本继续。";
  if (error?.name === "NotReadableError")
    return "摄像头正被占用或无法读取。可改用离线样本。";
  if (error?.name === "AbortError") return "单帧采集已取消。";
  return "此环境不支持单帧采集。请使用 HTTPS 或本机页面，或选择离线样本。";
}
export async function openCamera(mediaDevices) {
  if (!mediaDevices?.getUserMedia) throw new Error("unavailable");
  return mediaDevices.getUserMedia({
    video: {
      width: { ideal: 640 },
      height: { ideal: 480 },
      facingMode: "user",
    },
    audio: false,
  });
}
export function stopCamera(stream) {
  for (const track of stream?.getTracks?.() || []) track.stop();
}
export async function captureFrame(
  mediaDevices,
  createCapture,
  onStream = () => {},
) {
  let stream;
  try {
    stream = await openCamera(mediaDevices);
    onStream(stream);
    const track = stream.getVideoTracks()[0];
    if (!track) throw new Error("no video track");
    return await createCapture(track).grabFrame();
  } finally {
    stopCamera(stream);
    onStream(null);
  }
}
export function mountOptics({ onCalibrated }) {
  const $ = (id) => document.getElementById(id),
    dialog = $("optics-dialog");
  let portrait = null,
    lastFrame = null,
    activeStream = null,
    pending = null,
    serial = 0;
  try {
    const old =
      sessionStorage.getItem(PHOTO_KEY) ||
      sessionStorage.getItem(OLD_PHOTO_KEY);
    if (old?.length < 500000 && /^data:image\/(png|jpeg);base64,/.test(old)) {
      portrait = old;
      if (old.startsWith("data:image/png;base64,"))
        lastFrame = {
          type: "image",
          ephemeral: true,
          source: {
            type: "base64",
            media_type: "image/png",
            data: old.split(",")[1],
          },
        };
    }
  } catch {}
  const describe = (text) => {
    $("optics-feedback").textContent = text;
  };
  const card = (message) => ({
    image: {
      kind: "camera_status",
      message,
      hasFrame: !!lastFrame,
      retained: !!portrait,
    },
    seconds: 0,
  });
  function stop() {
    stopCamera(activeStream);
    activeStream = null;
  }
  function finish(result) {
    const current = pending;
    pending = null;
    serial++;
    stop();
    if (dialog.open) dialog.close();
    current?.resolve(result);
  }
  function storePortrait(photo) {
    portrait = $("optics-retain").checked ? photo : null;
    try {
      if (portrait) sessionStorage.setItem(PHOTO_KEY, portrait);
      else sessionStorage.removeItem(PHOTO_KEY);
      sessionStorage.removeItem(OLD_PHOTO_KEY);
    } catch {}
  }
  $("optics-enable").onclick = async () => {
    if (!pending) return;
    if (typeof window.ImageCapture !== "function") {
      describe(
        "浏览器未提供 ImageCapture。请使用离线样本；不会降级为视频预览。",
      );
      return;
    }
    const ticket = serial;
    $("optics-enable").disabled = true;
    describe("等待单帧授权。只采集一张图片，不播放或录制视频。");
    let bitmap;
    try {
      bitmap = await captureFrame(
        navigator.mediaDevices,
        (track) => new window.ImageCapture(track),
        (stream) => {
          if (ticket !== serial || !pending) {
            stopCamera(stream);
            if (stream) throw new DOMException("Cancelled", "AbortError");
          } else activeStream = stream;
        },
      );
      if (ticket !== serial || !pending) return;
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(
        1,
        Math.floor(
          bitmap.width * Math.min(1, 480 / bitmap.width, 480 / bitmap.height),
        ),
      );
      canvas.height = Math.round((canvas.width * bitmap.height) / bitmap.width);
      canvas
        .getContext("2d")
        .drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      let photo = canvas.toDataURL("image/png");
      while (photo.length >= 499000 && canvas.width > 120) {
        canvas.width = Math.floor(canvas.width * 0.75);
        canvas.height = Math.max(
          1,
          Math.round((canvas.width * bitmap.height) / bitmap.width),
        );
        canvas
          .getContext("2d")
          .drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        photo = canvas.toDataURL("image/png");
      }
      if (photo.length >= 499000) throw new Error("frame too large");
      lastFrame = {
        type: "image",
        ephemeral: true,
        source: {
          type: "base64",
          media_type: "image/png",
          data: photo.split(",")[1],
        },
      };
      storePortrait(photo);
      onCalibrated({
        source: "player-camera",
        mode: "single-frame; no identity verification",
        portrait_retained: !!portrait,
      });
      finish({ content: [lastFrame], seconds: 1 });
    } catch (error) {
      if (ticket === serial && pending) describe(cameraMessage(error));
    } finally {
      bitmap?.close?.();
      if (ticket === serial) $("optics-enable").disabled = false;
    }
  };
  $("optics-sample").onclick = () => {
    if (!pending) return;
    onCalibrated({
      source: "offline-sample",
      mode: "sample",
      portrait_retained: !!portrait,
    });
    finish({ image: { kind: "calibration_sample" }, seconds: 1 });
  };
  $("optics-close").onclick = () =>
    finish(card("Capture cancelled. No frame acquired."));
  dialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    finish(card("Capture cancelled. No frame acquired."));
  });
  dialog.addEventListener("close", () => {
    if (!pending) $("input").focus();
  });
  window.addEventListener("pagehide", () =>
    finish(card("Session interrupted. Device closed.")),
  );
  return {
    getPortrait: () => portrait,
    read: () =>
      lastFrame
        ? { content: [lastFrame], seconds: 1 }
        : card("No session PNG. Request a new single-frame capture."),
    tool: ({ action }) => {
      if (action === "status")
        return card("Single-frame interface. No live video channel.");
      if (action === "forget") {
        lastFrame = null;
        portrait = null;
        $("ending-human")?.removeAttribute("src");
        try {
          sessionStorage.removeItem(PHOTO_KEY);
          sessionStorage.removeItem(OLD_PHOTO_KEY);
        } catch {}
        return {
          ...card("Session image deleted."),
          effects: ["forget-camera"],
        };
      }
      if (!["capture", "request"].includes(action))
        throw new Error("camera: expected capture|request|status|forget");
      if (pending) throw new Error("camera: capture already pending");
      return new Promise((resolve) => {
        serial++;
        pending = { resolve };
        $("optics-retain").checked = !!portrait;
        $("optics-enable").disabled = false;
        describe(
          "本调用等待你的选择。不会显示视频；完成后只向终端返回一张静态图片。",
        );
        dialog.showModal();
      });
    },
  };
}
