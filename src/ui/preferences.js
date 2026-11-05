export function mountPreferences() {
  const root = document.documentElement;
  let size = 16,
    theme = "dark";
  try {
    const saved = JSON.parse(localStorage.getItem("lastlight.display"));
    if (saved) {
      size = Math.max(14, Math.min(22, Number(saved.size) || 16));
      theme = saved.theme === "light" ? "light" : "dark";
    }
  } catch {}
  const apply = () => {
    root.dataset.theme = theme;
    root.style.setProperty("--terminal-font-size", size + "px");
    document.getElementById("theme-toggle").textContent =
      theme === "dark" ? "浅色" : "深色";
    try {
      localStorage.setItem(
        "lastlight.display",
        JSON.stringify({ size, theme }),
      );
    } catch {}
  };
  document.getElementById("font-smaller").onclick = () => {
    size = Math.max(14, size - 1);
    apply();
  };
  document.getElementById("font-larger").onclick = () => {
    size = Math.min(22, size + 1);
    apply();
  };
  document.getElementById("theme-toggle").onclick = () => {
    theme = theme === "dark" ? "light" : "dark";
    apply();
  };
  apply();
}
