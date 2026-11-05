import { ART } from "./art.js";
export const ENDING_DURATION = 36;
const clamp = (v) => Math.max(0, Math.min(1, v));
export function endingFrame(seconds, reduced = false) {
  const t = Math.max(0, Math.min(ENDING_DURATION, seconds));
  return {
    time: t,
    stage:
      t < 4
        ? "inside"
        : t < 12
          ? "observer"
          : t < 21
            ? "room"
            : t < 28
              ? "earth"
              : "title",
    flip: reduced ? (t < 2 ? 0 : 180) : 180 * clamp(t / 4),
    portrait: clamp((t - 2) / 2),
    photo: !reduced && t >= 10.8 && t < 11.25,
    room: clamp((t - 12) / 3) * (1 - clamp((t - 23) / 3)),
    screenScale: reduced ? 1 : 1 - 0.84 * clamp((t - 12) / 6),
    earth: clamp((t - 22) / 5),
    earthScale: reduced ? 1 : 1 + 9 * (1 - clamp((t - 22) / 7)),
    title: clamp((t - 28) / 2),
    morph: clamp((t - 31) / 3),
  };
}
export function mountEnding({ getPortrait, getTranscript, isAvailable }) {
  const $ = (id) => document.getElementById(id),
    dialog = $("ending-dialog");
  let elapsed = 0,
    paused = false,
    last = 0,
    raf = null;
  $("ending-reduced").checked = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;
  const reduced = () => $("ending-reduced").checked;
  function render() {
    const f = endingFrame(elapsed, reduced()),
      photo = !!getPortrait() && f.photo;
    $("ending-screen").style.transform =
      `perspective(1100px) rotateY(${f.flip}deg) scale(${f.screenScale})`;
    $("ending-screen").style.opacity =
      elapsed < 4 ? 1 : elapsed < 12 ? 0.32 : 1 - clamp((elapsed - 12) / 6);
    $("ending-avatar").style.opacity =
      f.portrait * (1 - clamp((elapsed - 12) / 3)) * (photo ? 0 : 1);
    $("ending-human").style.opacity = photo ? 1 : 0;
    $("ending-room").style.opacity = f.room;
    $("ending-room").style.transform =
      `scale(${reduced() ? 1 : 1.5 - 0.045 * Math.max(0, elapsed - 12)}) translateY(${Math.max(0, elapsed - 17) * 2}px)`;
    $("ending-machine").style.opacity =
      clamp((elapsed - 13) / 3) * (1 - clamp((elapsed - 20) / 3));
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
    }
  }
  function tick(now) {
    if (!dialog.open) return;
    if (!paused && last)
      elapsed = Math.min(ENDING_DURATION, elapsed + (now - last) / 1000);
    last = now;
    render();
    raf = requestAnimationFrame(tick);
  }
  function play() {
    if (!isAvailable()) return;
    elapsed = 0;
    paused = false;
    last = 0;
    $("ending-transcript").textContent = getTranscript().slice(-1400);
    $("ending-avatar").src = ART.portrait;
    $("ending-room-image").src = ART.room;
    $("ending-earth-image").src = ART.earth;
    const photo = getPortrait();
    $("ending-human").hidden = !photo;
    if (photo) $("ending-human").src = photo;
    else $("ending-human").removeAttribute("src");
    $("ending-pause").textContent = "暂停";
    dialog.showModal();
    render();
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(tick);
  }
  $("ending-replay").onclick = play;
  $("ending-reduced").onchange = render;
  $("ending-close").onclick = () => dialog.close();
  $("ending-pause").onclick = () => {
    paused = !paused;
    last = 0;
    $("ending-pause").textContent = paused ? "继续" : "暂停";
  };
  $("ending-skip").onclick = () => {
    elapsed = ENDING_DURATION;
    render();
  };
  dialog.addEventListener("close", () => {
    cancelAnimationFrame(raf);
    $("input").focus();
  });
  return {
    play,
    refresh() {
      $("ending-replay").hidden = !isAvailable();
    },
  };
}
