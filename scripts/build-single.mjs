import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../", import.meta.url));
const id = (p) => path.relative(root, p).replaceAll("\\", "/");
const modules = [],
  seen = new Set(),
  visiting = new Set();
const importPattern = /^import\s*\{([\s\S]*?)\}\s*from\s*["']([^"']+)["'];?/gm;
async function visit(file) {
  file = path.resolve(file);
  if (seen.has(file)) return;
  if (visiting.has(file)) throw new Error("Cyclic module: " + id(file));
  if (!file.startsWith(path.join(root, "src") + path.sep))
    throw new Error("Nonlocal module: " + file);
  visiting.add(file);
  let source = await readFile(file, "utf8");
  if (id(file) === "src/ui/art.js") {
    const art = {};
    for (const [key, name] of [
      ["portrait", "kwen-portrait.png"],
      ["room", "room.png"],
      ["earth", "earth.png"],
    ])
      art[key] =
        "data:image/png;base64," +
        (await readFile(path.join(root, "assets/ending", name))).toString(
          "base64",
        );
    source = "export const ART=" + JSON.stringify(art) + ";";
  }
  const imports = [...source.matchAll(importPattern)];
  for (const match of imports)
    await visit(path.resolve(path.dirname(file), match[2]));
  source = source.replace(
    importPattern,
    (_, names, target) =>
      "const {" +
      names.replace(/\bas\s+/g, ":") +
      "}=__m[" +
      JSON.stringify(id(path.resolve(path.dirname(file), target))) +
      "];",
  );
  const exports = [
    ...source.matchAll(
      /^export\s+(?:async\s+)?(?:const|let|function|class)\s+(\w+)/gm,
    ),
  ].map((m) => m[1]);
  source = source.replace(/^export\s+/gm, "");
  if (/^import\s/m.test(source) || /\bimport\s*\(/.test(source))
    throw new Error("Unsupported import in " + id(file));
  modules.push(
    "__m[" +
      JSON.stringify(id(file)) +
      "]=(()=>{\n" +
      source +
      "\nreturn {" +
      exports.join(",") +
      "};\n})();",
  );
  visiting.delete(file);
  seen.add(file);
}
await visit(path.join(root, "src/main.js"));
let html = await readFile(path.join(root, "index.html"), "utf8");
for (const match of [
  ...html.matchAll(/<link\s+rel="stylesheet"\s+href="([^"]+)"\s*\/>/g),
]) {
  const css = await readFile(
    path.join(root, match[1].replace(/^\//, "")),
    "utf8",
  );
  html = html.replace(
    match[0],
    () => "<style>" + css.replace(/<\/style/gi, "<\\/style") + "</style>",
  );
}
const bundle =
  '(()=>{\n"use strict";\nconst __m=Object.create(null);\n' +
  modules.join("\n") +
  "\n})();";
html = html.replace(
  /<script type="module" src="\/src\/main.js"><\/script>/,
  () => "<script>" + bundle.replace(/<\/script/gi, "<\\/script") + "</script>",
);
html = html.replace(
  "<head>",
  `<head>\n<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; media-src 'self' blob:; connect-src 'none'; base-uri 'none'; object-src 'none'">`,
);
await mkdir(path.join(root, "dist"), { recursive: true });
const extras = (await readdir(path.join(root, "dist"))).filter(
  (name) => name !== "index.html",
);
if (extras.length)
  throw new Error(
    "dist must contain only index.html; unexpected: " + extras.join(", "),
  );
await writeFile(path.join(root, "dist/index.html"), html);
console.log(
  JSON.stringify({
    output: path.join(root, "dist/index.html"),
    modules: modules.length,
    bytes: Buffer.byteLength(html),
    externalAssets: 0,
  }),
);
