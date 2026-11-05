import { ART } from "./art.js";
export const ENDING_DURATION = 36;
const clamp = (v) => Math.max(0, Math.min(1, v));
const ease = (v) => {
  const x = clamp(v);
  return x * x * (3 - 2 * x);
};
export function endingFrame(seconds, reduced = false) {
  const t = Math.max(0, Math.min(ENDING_DURATION, seconds));
  const exit = ease((t - 12) / 8);
  return {
    time: t,
    stage:
      t < 2
        ? "inside"
        : t < 12
          ? "observer"
          : t < 21
            ? "room"
            : t < 28
              ? "earth"
              : "title",
    flip: 180,
    expression: t < 7 ? "neutral" : "surprised",
    portrait: t >= 2 && t < 12 ? 1 : 0,
    photo: !reduced && t >= 10.8 && t < 11.25,
    sceneScale: reduced ? 1 : 1.025 - 0.025 * ease((t - 2) / 10),
    pullback: reduced ? (t >= 14 ? 1 : 0) : exit,
    observerOpacity: 1 - ease((t - 13) / 3),
    screenOpacity:
      t < 12
        ? 1 - 0.73 * ease((t - 1.5) / 1.5)
        : 0.27 * (1 - ease((t - 12) / 3)),
    room: t >= 12 ? 1 : 0,
    earth: ease((t - 21) / 5),
    earthScale: reduced ? 1 : 1 + 3 * (1 - ease((t - 21) / 7)),
    title: ease((t - 28) / 2),
    morph: ease((t - 31) / 3),
  };
}
// Geometry of the monitor in room.png, projected through the same camera as the room.
export function endingProjection(width, height, pullback) {
  const fit = Math.max(width / 1672, height / 941),
    iw = 1672 * fit,
    ih = 941 * fit;
  const target = {
    x: (width - iw) / 2 + iw * 0.423,
    y: (height - ih) / 2 + ih * 0.329,
    w: iw * 0.164,
    h: ih * 0.164,
  };
  const initialZoom = Math.max(width / target.w, height / target.h);
  const zoom = initialZoom + (1 - initialZoom) * pullback;
  const dx =
    (width / 2 - (target.x + target.w / 2) * initialZoom) * (1 - pullback);
  const dy =
    (height / 2 - (target.y + target.h / 2) * initialZoom) * (1 - pullback);
  return {
    zoom,
    dx,
    dy,
    rect: {
      x: target.x * zoom + dx,
      y: target.y * zoom + dy,
      w: target.w * zoom,
      h: target.h * zoom,
    },
  };
}
export function mountEnding({
  getPortrait,
  getTranscript,
  isAvailable,
  requestFrame = (cb) => requestAnimationFrame(cb),
  cancelFrame = (id) => cancelAnimationFrame(id),
}) {
  const $ = (id) => document.getElementById(id),
    dialog = $("ending-dialog");
  let elapsed = 0,
    paused = false,
    last = null,
    raf = null,
    generation = 0,
    loadedPortrait = null;
  $("ending-reduced").checked = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;
  const reduced = () => $("ending-reduced").checked;
  function clearPhoto() {
    loadedPortrait = null;
    $("ending-human").hidden = true;
    $("ending-human").style.opacity = 0;
    $("ending-human").removeAttribute("src");
  }
  function render() {
    const f = endingFrame(elapsed, reduced()),
      width = dialog.clientWidth || window.innerWidth,
      height = dialog.clientHeight || window.innerHeight;
    if (loadedPortrait && getPortrait() !== loadedPortrait) clearPhoto();
    const photo = !!loadedPortrait && f.photo;
    const projection = endingProjection(width, height, f.pullback);
    const rect =
      elapsed < 12 ? { x: 0, y: 0, w: width, h: height } : projection.rect;
    const observer = $("ending-observer");
    observer.style.left = rect.x + "px";
    observer.style.top = rect.y + "px";
    observer.style.width = rect.w + "px";
    observer.style.height = rect.h + "px";
    observer.style.opacity = f.observerOpacity;
    dialog.dataset.stage = f.stage;
    for (const [id, selected] of [
      ["ending-avatar", f.expression === "neutral"],
      ["ending-surprise", f.expression === "surprised"],
    ]) {
      const img = $(id);
      img.hidden = photo || !f.portrait || !selected;
      img.style.transform = `scale(${f.sceneScale})`;
    }
    $("ending-human").hidden = !photo;
    $("ending-human").style.opacity = photo ? 1 : 0;
    $("ending-screen").style.transform = "scaleX(-1)";
    $("ending-screen").style.opacity = f.screenOpacity;
    $("ending-room").style.opacity = f.room;
    $("ending-room").style.transform =
      `translate(${projection.dx}px, ${projection.dy}px) scale(${projection.zoom})`;
    $("ending-machine").style.opacity =
      elapsed >= 20 && elapsed < 23 ? 1 - ease((elapsed - 21) / 2) : 0;
    $("ending-earth-scene").style.opacity = f.earth;
    $("ending-earth").style.transform = `scale(${f.earthScale})`;
    $("ending-title").style.opacity = f.title;
    for (const el of dialog.querySelectorAll(".title-old"))
      el.style.opacity = 1 - f.morph;
    for (const el of dialog.querySelectorAll(".title-new"))
      el.style.opacity = f.morph;
    if (elapsed >= ENDING_DURATION) {
      paused = true;
      $("ending-pause").textContent = "继续";
      dialog.classList.add("ending-finished");
    }
  }
  function tick(now) {
    if (!dialog.open) return;
    if (!paused && last !== null)
      elapsed = Math.min(
        ENDING_DURATION,
        elapsed + Math.max(0, now - last) / 1000,
      );
    last = now;
    render();
    raf = requestFrame(tick);
  }
  async function play() {
    if (!isAvailable()) return false;
    const ticket = ++generation;
    cancelFrame(raf);
    clearPhoto();
    $("ending-avatar").src = ART.portrait;
    $("ending-surprise").src = ART.surprised;
    $("ending-room-image").src = ART.room;
    $("ending-earth-image").src = ART.earth;
    try {
      await Promise.all(
        [
          "ending-avatar",
          "ending-surprise",
          "ending-room-image",
          "ending-earth-image",
        ].map((id) => $(id).decode()),
      );
      if (ticket !== generation) return false;
      const photo = getPortrait();
      if (photo) {
        $("ending-human").src = photo;
        try {
          await $("ending-human").decode();
          if (ticket === generation && photo === getPortrait())
            loadedPortrait = photo;
          else if (ticket === generation) clearPhoto();
        } catch {
          if (ticket === generation) clearPhoto();
        }
      }
    } catch {
      if (ticket === generation && $("notices"))
        $("notices").textContent = "片尾图像未能加载，请重试。";
      return false;
    }
    if (ticket !== generation) return false;
    elapsed = 0;
    paused = false;
    last = null;
    $("ending-transcript").textContent = getTranscript().slice(-1400);
    $("ending-pause").textContent = "暂停";
    dialog.classList.remove("ending-finished");
    if (!dialog.open) dialog.showModal();
    render();
    raf = requestFrame(tick);
    return true;
  }
  $("ending-replay").onclick = play;
  $("ending-reduced").onchange = render;
  $("ending-close").onclick = () => dialog.close();
  $("ending-pause").onclick = () => {
    paused = !paused;
    last = null;
    $("ending-pause").textContent = paused ? "继续" : "暂停";
  };
  $("ending-skip").onclick = () => {
    elapsed = ENDING_DURATION;
    render();
  };
  dialog.addEventListener("close", () => {
    generation++;
    cancelFrame(raf);
    clearPhoto();
    $("ending-transcript").textContent = "";
    $("input").focus();
  });
  return {
    play,
    refresh() {
      $("ending-replay").hidden = !isAvailable();
    },
  };
}
