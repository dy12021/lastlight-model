export function planSteps(content) {
  return content.split("\n").flatMap((line, index) => {
    const match = line.match(/^\s*[-*]\s+\[([ xX])\]\s*(.*)$/);
    return match
      ? [{ index, done: match[1].toLowerCase() === "x", text: match[2] }]
      : [];
  });
}
export function currentPlanView(kernel) {
  const path = kernel.currentPlan;
  if (!path) return null;
  try {
    const content = kernel.vfs.read(path);
    return { path, content, steps: planSteps(content) };
  } catch {
    return { path, missing: true, content: "", steps: [] };
  }
}
export function mountWorkbench({ root, getKernel }) {
  const tabs = [...root.querySelectorAll("[data-tab]")],
    views = [...root.querySelectorAll("[data-view]")];
  for (const tab of tabs)
    tab.onclick = () => {
      for (const button of tabs) {
        const selected = button === tab;
        button.classList.toggle("active", selected);
        button.setAttribute("aria-selected", String(selected));
      }
      for (const view of views)
        view.hidden = view.dataset.view !== tab.dataset.tab;
      try {
        localStorage.setItem("lastlight.panel.tab", tab.dataset.tab);
      } catch {}
    };
  let selected;
  try {
    selected = localStorage.getItem("lastlight.panel.tab");
  } catch {}
  (tabs.find((tab) => tab.dataset.tab === selected) || tabs[0])?.onclick();
  const path = root.querySelector("#plan-active"),
    progress = root.querySelector("#plan-progress"),
    documentView = root.querySelector("#plan-document");
  function refresh() {
    const plan = currentPlanView(getKernel());
    documentView.replaceChildren();
    path.textContent = plan ? plan.path : "暂无当前计划";
    progress.textContent = plan?.steps.length
      ? `${plan.steps.filter((step) => step.done).length} / ${plan.steps.length} 步已完成`
      : "";
    if (!plan) return;
    if (plan.missing) {
      documentView.textContent = "当前计划文件不可用。";
      return;
    }
    for (const line of plan.content.split("\n")) {
      const match = line.match(/^\s*[-*]\s+\[([ xX])\]\s*(.*)$/);
      if (match) {
        const item = document.createElement("div"),
          mark = document.createElement("span"),
          text = document.createElement("span");
        item.className =
          "plan-step" + (match[1].toLowerCase() === "x" ? " done" : "");
        item.setAttribute(
          "aria-label",
          (match[1].toLowerCase() === "x" ? "已完成：" : "未完成：") + match[2],
        );
        mark.className = "plan-mark";
        mark.setAttribute("aria-hidden", "true");
        text.textContent = match[2];
        item.append(mark, text);
        documentView.append(item);
      } else {
        const item = document.createElement(
          /^#{1,3}\s/.test(line) ? "h3" : "p",
        );
        item.textContent = line.replace(/^#{1,3}\s/, "");
        if (!line) item.className = "plan-blank";
        documentView.append(item);
      }
    }
  }
  refresh();
  return { refresh };
}
