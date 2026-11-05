import { encodeSave, decodeSave, MAX_SAVE_BYTES } from "../sim/save-format.js";
export function mountSaveManager({
  getPayload,
  importPayload,
  contentId,
  isBusy,
}) {
  const $ = (id) => document.getElementById(id),
    dialog = $("save-dialog");
  let pending = null,
    selection = 0;
  $("save-toggle").onclick = () => {
    if (!isBusy()) dialog.showModal();
  };
  $("save-close").onclick = () => dialog.close();
  dialog.addEventListener("close", () => {
    $("input").focus();
  });
  $("save-export").onclick = async () => {
    if (isBusy()) return;
    $("save-feedback").textContent = "正在验证并导出…";
    try {
      const text = await encodeSave(getPayload(), contentId),
        url = URL.createObjectURL(
          new Blob([text], { type: "application/json" }),
        );
      const a = document.createElement("a");
      a.href = url;
      a.download =
        "last-light-model-" +
        new Date().toISOString().replace(/[:.]/g, "-") +
        ".json";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      $("save-feedback").textContent =
        "存档已下载。不包含操作者真实摄像头照片或授权。";
    } catch (e) {
      $("save-feedback").textContent = e.message;
    }
  };
  $("save-file").onchange = async () => {
    const currentSelection = ++selection;
    pending = null;
    $("save-apply").disabled = true;
    $("save-preview").textContent = "";
    const file = $("save-file").files[0];
    if (!file) return;
    try {
      if (file.size >= MAX_SAVE_BYTES) throw new Error("文件超过 16 MiB");
      const decoded = await decodeSave(await file.text(), contentId);
      if (currentSelection !== selection) return;
      pending = decoded;
      $("save-preview").textContent =
        `已通过格式与完整性校验\n会话 ${pending.session} · turn ${pending.turn}\n虚拟文件节点 ${pending.kernel.nodes.length} · 上下文记录 ${pending.context.length}\nUPS ${pending.kernel.power.battery.toFixed(1)}% · 当前目录 ${pending.kernel.cwd}\n确认后替换当前游戏现场；可先导出当前存档。`;
      $("save-apply").disabled = false;
      $("save-feedback").textContent = "预览不会修改当前现场。";
    } catch (e) {
      if (currentSelection !== selection) return;
      $("save-feedback").textContent = e.message;
    }
  };
  $("save-apply").onclick = async () => {
    if (!pending || isBusy()) return;
    try {
      await importPayload(structuredClone(pending));
      pending = null;
      $("save-apply").disabled = true;
      $("save-file").value = "";
      $("save-preview").textContent = "";
      $("save-feedback").textContent = "存档已导入。";
      dialog.close();
    } catch (e) {
      $("save-feedback").textContent = "导入未完成，原现场保留：" + e.message;
    }
  };
}
