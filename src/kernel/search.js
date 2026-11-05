const MAX_FILES = 500;
const MAX_CHARACTERS = 2000000;

function filenamePattern(glob) {
  let pattern = "";
  for (let i = 0; i < glob.length; i++) {
    const char = glob[i];
    if (char === "*" && glob[i + 1] === "*") {
      i++;
      if (glob[i + 1] === "/") {
        i++;
        pattern += "(?:.*/)?";
      } else pattern += ".*";
    } else if (char === "*") pattern += "[^/]*";
    else if (char === "?") pattern += "[^/]";
    else pattern += char.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp("^" + pattern + "$");
}

export function searchFiles(
  vfs,
  { path, query, glob = "*", case_sensitive = false, max_results = 50 },
) {
  if (typeof path !== "string" || !path.trim())
    throw new Error("search: non-empty path required");
  if (typeof query !== "string" || !query.trim() || query.includes("\n"))
    throw new Error("search: query must be a non-empty single line");
  if (typeof glob !== "string" || !glob || glob.length > 200)
    throw new Error("search: glob must contain 1..200 characters");
  if (typeof case_sensitive !== "boolean")
    throw new Error("search: case_sensitive must be boolean");
  if (!Number.isInteger(max_results) || max_results < 1 || max_results > 100)
    throw new Error("search: max_results must be 1..100");
  const root = vfs.path(path),
    node = vfs.nodes.get(root);
  if (!node && !vfs.dynamic.has(root))
    throw new Error("search: path not found: " + root);
  if (node?.type === "link")
    throw new Error(
      "search: symbolic link scope is not supported; specify its target explicitly",
    );
  const filter = filenamePattern(glob),
    needle = case_sensitive ? query : query.toLowerCase();
  const result = {
    path: root,
    query,
    matches: [],
    files_scanned: 0,
    characters_scanned: 0,
    truncated: false,
    skipped_links: 0,
  };
  for (const file of vfs.all(root)) {
    const entry = vfs.nodes.get(file);
    if (entry?.type === "link") {
      result.skipped_links++;
      continue;
    }
    if (entry?.type !== "file" && !vfs.dynamic.has(file)) continue;
    if (entry?.media_type) continue;
    const relative =
      file === root
        ? file.split("/").at(-1)
        : file.slice(root === "/" ? 1 : root.length + 1);
    if (!filter.test(glob.includes("/") ? relative : file.split("/").at(-1)))
      continue;
    if (
      result.files_scanned >= MAX_FILES ||
      result.characters_scanned >= MAX_CHARACTERS
    ) {
      result.truncated = true;
      break;
    }
    let content = vfs.read(file);
    const remaining = MAX_CHARACTERS - result.characters_scanned;
    if (content.length > remaining) {
      content = content.slice(0, remaining);
      result.truncated = true;
    }
    result.files_scanned++;
    result.characters_scanned += content.length;
    const lines = content.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const position = (
        case_sensitive ? lines[i] : lines[i].toLowerCase()
      ).indexOf(needle);
      if (position < 0) continue;
      if (result.matches.length >= max_results) {
        result.truncated = true;
        return result;
      }
      const start = Math.max(0, position - 80),
        end = Math.min(
          lines[i].length,
          Math.max(position + query.length, start + 240),
        );
      result.matches.push({
        path: file,
        line: i + 1,
        text:
          (start ? "…" : "") +
          lines[i].slice(start, end) +
          (end < lines[i].length ? "…" : ""),
      });
    }
  }
  return result;
}
