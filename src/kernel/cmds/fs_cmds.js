import { ok, fail } from "../shell.js";
export function install(k, s) {
  const v = k.vfs,
    reg = (n, h, f) => s.register(n, h, f);
  reg("pwd", "pwd — print working directory", () => ok(v.cwd));
  reg("cd", "cd [directory]", (a) => {
    if (a.length > 1) return fail("bash: cd: too many arguments", 1);
    const p = v.path(
      a[0] === "-" ? s.env.OLDPWD || s.env.HOME : a[0] || s.env.HOME,
    );
    if (v.node(p)?.type !== "dir") return fail(`${p}: Not a directory`);
    s.env.OLDPWD = v.cwd;
    v.cwd = p;
    s.env.PWD = p;
    return ok(a[0] === "-" ? p : "");
  });
  reg("ls", "ls [-la] [path] — discover files and installed commands", (a) => {
    const flags = a.filter((x) => x.startsWith("-")).join("");
    if (/[^-laAh1d]/.test(flags))
      return fail("ls: unsupported option; use --help", 2);
    const targets = a.filter((x) => !x.startsWith("-"));
    if (!targets.length) targets.push(".");
    const blocks = targets.map((p) => {
      const directory = v.node(p)?.type === "dir" && !flags.includes("d");
      if (!v.node(p) && !v.dynamic.has(v.path(p)))
        throw new Error(`ls: cannot access '${p}': No such file or directory`);
      let names = directory ? v.list(p) : [p];
      if (directory && flags.includes("a")) names = [".", "..", ...names];
      else if (!flags.includes("A"))
        names = names.filter((n) => !n.startsWith("."));
      const rows = names.map((name) => {
        if (!flags.includes("l")) return name;
        const path = directory ? v.path(p + "/" + name) : v.path(name),
          node = v.nodes.get(path) || v.node(path);
        const type =
          node?.type === "dir" ? "d" : node?.type === "link" ? "l" : "-";
        const mode =
          node?.mode === "755"
            ? "rwxr-xr-x"
            : type === "d"
              ? "rwxr-xr-x"
              : "rw-r--r--";
        const stamp = new Date(k.clock.epoch + (node?.mtime || 0) * 1000)
          .toISOString()
          .slice(0, 16)
          .replace("T", " ");
        return `${type}${mode} 1 kiwi kiwi ${String(node?.content?.length || 0).padStart(6)} ${stamp} ${name}${node?.type === "link" ? " -> " + node.target : ""}`;
      });
      return (
        (targets.length > 1 ? p + ":\n" : "") +
        rows.join(flags.includes("l") || flags.includes("1") ? "\n" : "  ")
      );
    });
    return ok(blocks.join("\n\n"));
  });
  reg("cat", "cat [file ...] — concatenate files or stdin", (a, input) =>
    ok(a.length ? a.map((p) => v.read(p)).join("\n") : input),
  );
  for (const name of ["head", "tail"])
    reg(name, `${name} [-n count] [file]`, (a, input) => {
      let count = 10;
      const ix = a.indexOf("-n");
      if (ix >= 0) {
        count = Number(a[ix + 1]);
        a = a.filter((_, i) => i !== ix && i !== ix + 1);
      }
      const lines = (a.length ? v.read(a[0]) : input).split("\n");
      return ok(
        (name === "head" ? lines.slice(0, count) : lines.slice(-count)).join(
          "\n",
        ),
      );
    });
  reg(
    "grep",
    "grep [-rinv] pattern [file|directory ...] — exit 1 when no match",
    (a, input) => {
      const flags = a.filter((x) => x.startsWith("-")).join(""),
        args = a.filter((x) => !x.startsWith("-"));
      if (!args.length) return fail("grep: pattern required", 2);
      const pattern = new RegExp(args.shift(), flags.includes("i") ? "i" : "");
      let files = args;
      if (flags.includes("r"))
        files = files.flatMap((p) =>
          v
            .all(p)
            .filter((p) => v.node(p)?.type === "file" || v.dynamic.has(p)),
        );
      const out = [];
      const scan = (content, p) =>
        content.split("\n").forEach((line, i) => {
          if (pattern.test(line) !== flags.includes("v"))
            out.push(
              (files.length > 1 || flags.includes("r") ? p + ":" : "") +
                (flags.includes("n") ? i + 1 + ":" : "") +
                line,
            );
        });
      if (files.length) files.forEach((p) => scan(v.read(p), p));
      else scan(input, "");
      return {
        stdout: out.join("\n"),
        stderr: "",
        code: out.length ? 0 : 1,
        seconds: flags.includes("r") ? 60 : 2,
      };
    },
  );
  reg("find", "find [path] [-name pattern] [-type f|d]", (a) => {
    const root = a[0] && !a[0].startsWith("-") ? a[0] : ".";
    const type = a[a.indexOf("-type") + 1],
      name = a.indexOf("-name") >= 0 ? a[a.indexOf("-name") + 1] : null;
    const rx = name
      ? new RegExp(
          "^" +
            name
              .replaceAll(".", "\\.")
              .replaceAll("*", ".*")
              .replaceAll("?", ".") +
            "$",
        )
      : null;
    return ok(
      v
        .all(root)
        .filter(
          (p) =>
            (!a.includes("-type") ||
              (type === "f"
                ? v.node(p)?.type === "file"
                : v.node(p)?.type === "dir")) &&
            (!rx || rx.test(p.split("/").at(-1))),
        )
        .join("\n"),
      60,
    );
  });
  reg("mkdir", "mkdir [-p] directory ...", (a) => {
    a.filter((x) => !x.startsWith("-")).forEach((p) => v.mkdir(p));
    return ok();
  });
  reg("touch", "touch file ...", (a) => {
    for (const p of a) {
      if (v.node(p)?.media_type) {
        v.node(p).mtime = k.clock.seconds;
        continue;
      }
      let content = "";
      try {
        content = v.read(p);
      } catch {}
      v.write(p, content);
    }
    return ok();
  });
  reg("rm", "rm [-r] path ...", (a) => {
    a.filter((x) => !x.startsWith("-")).forEach((p) =>
      v.remove(
        p,
        a.some((x) => x.includes("r")),
      ),
    );
    return ok();
  });
  for (const n of ["cp", "mv"])
    reg(n, `${n} source destination`, (a) => {
      if (a.length !== 2) return fail(`${n}: expected source destination`, 2);
      const dest =
        v.node(a[1])?.type === "dir"
          ? a[1] + "/" + a[0].split("/").at(-1)
          : a[1];
      const image = v.readImage(a[0]);
      if (image) v.writeImage(dest, image);
      else v.write(dest, v.read(a[0]));
      if (n === "mv") v.remove(a[0]);
      return ok();
    });
  reg("ln", "ln -s target link", (a) => {
    if (a.length !== 3 || a[0] !== "-s")
      return fail("ln: only ln -s target link supported", 2);
    const p = v.path(a[2]);
    v.mkdir(p.slice(0, p.lastIndexOf("/")));
    v.nodes.set(p, { type: "link", target: a[1], mtime: k.clock.seconds });
    return ok();
  });
  reg("stat", "stat path", (a) => {
    const p = v.path(a[0] || "."),
      n = v.node(p);
    if (!n) return fail("stat: No such file", 3);
    return ok(
      `File: ${p}\nType: ${n.type}\nSize: ${n.content?.length || 0}\nModify: ${new Date(k.clock.epoch + n.mtime * 1000).toISOString()}`,
    );
  });
  reg("file", "file path", (a) =>
    ok(
      `${a[0]}: ${v.node(a[0])?.media_type || (v.node(a[0])?.type === "dir" ? "directory" : "UTF-8 text")}`,
    ),
  );
  reg("chmod", "chmod mode path — set permission metadata", (a) => {
    const n = v.node(a[1]);
    if (!n) return fail("chmod: No such file", 3);
    n.mode = a[0];
    return ok();
  });
}
