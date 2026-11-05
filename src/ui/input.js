import { toolNames, uiCommands } from "./completion.js";
export const completions = [...toolNames, ...uiCommands];
export class CommandHistory {
  constructor() {
    this.items = [];
    this.index = 0;
    this.draft = "";
  }
  push(value) {
    if (value && this.items.at(-1) !== value) this.items.push(value);
    if (this.items.length > 100) this.items.shift();
    this.index = this.items.length;
    this.draft = "";
  }
  move(delta, value) {
    if (this.index === this.items.length) this.draft = value;
    this.index = Math.max(0, Math.min(this.items.length, this.index + delta));
    return this.index === this.items.length
      ? this.draft
      : this.items[this.index];
  }
  complete(value) {
    const matches = completions.filter((c) => c.startsWith(value));
    return matches.length === 1
      ? matches[0] + (matches[0].startsWith("/") ? "" : " ")
      : value;
  }
}
export function bindInput(
  input,
  { submit, clear, complete, showCompletions = () => {} },
) {
  const history = new CommandHistory();
  let session = null;
  const dismiss = () => {
    session = null;
    showCompletions([], -1);
  };
  const resize = () => {
    input.style.height = "auto";
    input.style.height = input.scrollHeight + "px";
  };
  input.addEventListener("input", () => {
    dismiss();
    resize();
  });
  input.addEventListener("click", dismiss);
  input.addEventListener("keydown", (e) => {
    if (e.isComposing || e.keyCode === 229) return;
    if (e.key === "Escape") {
      dismiss();
      return;
    }
    if (e.key === "Tab" && complete) {
      e.preventDefault();
      if (input.readOnly || input.selectionStart !== input.selectionEnd) return;
      const caret = input.selectionStart;
      if (
        !session ||
        session.value !== input.value ||
        session.caret !== caret
      ) {
        const edit = complete(input.value, caret);
        if (!edit.options.length) {
          dismiss();
          return;
        }
        session = { source: input.value, edit, index: e.shiftKey ? 0 : -1 };
      }
      session.index =
        (session.index + (e.shiftKey ? -1 : 1) + session.edit.options.length) %
        session.edit.options.length;
      const option = session.edit.options[session.index],
        { from, to } = session.edit;
      input.value =
        session.source.slice(0, from) + option.text + session.source.slice(to);
      input.selectionStart = input.selectionEnd =
        from + (option.caret ?? option.text.length);
      session.value = input.value;
      session.caret = input.selectionStart;
      showCompletions(session.edit.options, session.index);
      resize();
      if (session.edit.options.length === 1) session = null;
      return;
    }
    if (!["Tab", "Shift", "Control", "Alt", "Meta"].includes(e.key)) dismiss();
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "l") {
      e.preventDefault();
      clear();
      return;
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
      return;
    }
    if (
      (e.key === "ArrowUp" || e.key === "ArrowDown") &&
      !input.value.includes("\n") &&
      !e.shiftKey &&
      !e.ctrlKey &&
      !e.metaKey
    ) {
      e.preventDefault();
      input.value = history.move(e.key === "ArrowUp" ? -1 : 1, input.value);
      input.selectionStart = input.selectionEnd = input.value.length;
      resize();
    }
    if (e.key === "Tab" && input.selectionStart === input.value.length) {
      e.preventDefault();
      input.value = history.complete(input.value);
      resize();
    }
  });
  return { remember: (value) => history.push(value), resize, dismiss };
}
