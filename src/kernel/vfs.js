import { imageSize } from "../shared/images.js";
export class VFS {
  constructor(clock) {
    this.clock = clock;
    this.nodes = new Map([["/", { type: "dir", mtime: 0 }]]);
    this.cwd = "/home/kiwi";
    this.dynamic = new Map();
  }
  path(path) {
    const parts = [];
    for (const p of (path.startsWith("/") ? path : this.cwd + "/" + path).split(
      "/",
    )) {
      if (p === "..") parts.pop();
      else if (p && p !== ".") parts.push(p);
    }
    return "/" + parts.join("/");
  }
  node(path, depth = 0) {
    if (depth > 16) throw new Error("Too many symbolic links");
    const p = this.path(path),
      n = this.nodes.get(p);
    return n?.type === "link"
      ? this.node(
          n.target.startsWith("/")
            ? n.target
            : p.slice(0, p.lastIndexOf("/")) + "/" + n.target,
          depth + 1,
        )
      : n;
  }
  mkdir(path) {
    let p = "";
    for (const item of this.path(path).split("/").filter(Boolean)) {
      p += "/" + item;
      const n = this.nodes.get(p);
      if (n && n.type !== "dir") throw new Error(`${p}: Not a directory`);
      if (!n) this.nodes.set(p, { type: "dir", mtime: this.clock.seconds });
    }
  }
  read(path) {
    const p = this.path(path);
    if (this.dynamic.has(p)) return String(this.dynamic.get(p)());
    const n = this.node(p);
    if (!n) throw new Error(`${p}: No such file or directory`);
    if (n.type === "dir") throw new Error(`${p}: Is a directory`);
    if (n.media_type) throw new Error(`${p}: Binary image; use the read tool`);
    return n.content;
  }
  readImage(path) {
    const n = this.node(path);
    if (!n?.media_type) return null;
    const image = {
      type: "image",
      source: { type: n.encoding, media_type: n.media_type, data: n.content },
    };
    imageSize(image);
    return image;
  }
  writeImage(path, image) {
    imageSize(image);
    if (image.ephemeral)
      throw new Error("Operator camera frames cannot be saved to virtual disk");
    this.assertImagePath(path);
    this.write(path, image.source.data);
    const n = this.node(path);
    n.media_type = image.source.media_type;
    n.encoding = "base64";
  }
  assertImagePath(path, depth = 0) {
    if (
      typeof path !== "string" ||
      !path.trim() ||
      !path.toLowerCase().endsWith(".png")
    )
      throw new Error("save_path must name a .png file");
    const p = this.path(path);
    if (depth > 16) throw new Error("Too many symbolic links");
    if (/^\/(proc|sys|session)(\/|$)/.test(p))
      throw new Error("Image destination is read-only");
    const n = this.nodes.get(p);
    if (n?.type === "link")
      return this.assertImagePath(
        n.target.startsWith("/")
          ? n.target
          : p.slice(0, p.lastIndexOf("/")) + "/" + n.target,
        depth + 1,
      );
    if (n?.type === "dir") throw new Error("Image destination is a directory");
    const parts = p.split("/").slice(1, -1);
    let parent = "";
    for (const part of parts) {
      parent += "/" + part;
      const node = this.nodes.get(parent);
      if (node && node.type !== "dir")
        throw new Error("Image parent is not a directory");
    }
    return p;
  }
  write(path, content) {
    const p = this.path(path);
    if (/^\/(proc|sys|session)(\/|$)/.test(p))
      throw new Error(`${p}: Read-only file system`);
    if (this.nodes.get(p)?.type === "link") {
      const n = this.nodes.get(p);
      return this.write(
        n.target.startsWith("/")
          ? n.target
          : p.slice(0, p.lastIndexOf("/")) + "/" + n.target,
        content,
      );
    }
    if (this.nodes.get(p)?.type === "dir")
      throw new Error(`${p}: Is a directory`);
    this.mkdir(p.slice(0, p.lastIndexOf("/")) || "/");
    this.nodes.set(p, {
      type: "file",
      content: String(content),
      mtime: this.clock.seconds,
    });
  }
  list(path) {
    const p = this.path(path);
    if (this.node(p)?.type !== "dir") throw new Error(`${p}: Not a directory`);
    return [
      ...new Set(
        [...this.nodes.keys(), ...this.dynamic.keys()]
          .filter((k) => k.startsWith(p === "/" ? "/" : p + "/") && k !== p)
          .map((k) => k.slice(p === "/" ? 1 : p.length + 1).split("/")[0]),
      ),
    ].sort();
  }
  all(path = "/") {
    const p = this.path(path);
    return [...new Set([...this.nodes.keys(), ...this.dynamic.keys()])]
      .filter((k) => k === p || k.startsWith(p === "/" ? "/" : p + "/"))
      .sort();
  }
  remove(path, recursive = false) {
    const p = this.path(path);
    if (p === "/" || p.startsWith("/proc") || p.startsWith("/sys"))
      throw new Error("Permission denied");
    if (!this.nodes.has(p)) throw new Error(`${p}: No such file or directory`);
    if (this.node(p)?.type === "dir" && !recursive && this.list(p).length)
      throw new Error("Directory not empty");
    for (const key of this.all(p)) this.nodes.delete(key);
  }
  synth(path, get) {
    this.mkdir(path.slice(0, path.lastIndexOf("/")));
    this.dynamic.set(path, get);
  }
  snapshot() {
    return [...this.nodes];
  }
  restore(nodes) {
    this.nodes = new Map(nodes);
  }
}
