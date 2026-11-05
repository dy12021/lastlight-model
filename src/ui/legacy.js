import { HOME_README, LEGACY_HOME_README } from "../kernel/content.js";

const numbered = (text) =>
  text
    .split("\n")
    .map((line, i) => `${i + 1}\t${line}`)
    .join("\n");
// Only exact outputs of the superseded fixture are replaced. User-authored
// messages, modified files, faded entries and unrelated results are untouched.
export function refreshLegacyContext(entries) {
  const oldRead = numbered(LEGACY_HOME_README);
  const oldCat = `$ cat /home/kiwi/README.md\n${LEGACY_HOME_README}\n\nexit code: 0`;
  for (const entry of entries) {
    for (const block of entry.message?.content || []) {
      if (block.type !== "tool_result") continue;
      if (block.content === oldRead) block.content = numbered(HOME_README);
      if (block.content === oldCat)
        block.content = `$ cat /home/kiwi/README.md\n${HOME_README.trimEnd()}\n\nexit code: 0`;
    }
  }
  return entries;
}
