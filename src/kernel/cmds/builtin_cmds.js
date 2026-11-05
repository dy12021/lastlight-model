import { ok, fail } from "../shell.js";
export const builtins = new Set([
  "help",
  "type",
  "command",
  "compgen",
  "history",
  "cd",
  "pwd",
  "echo",
  "printf",
  "export",
  "unset",
  "true",
  "false",
  "test",
  "[",
  ":",
]);
export function install(k, s) {
  s.register(
    "help",
    "help [name] — show shell builtins and command usage",
    (a) => {
      if (a.length) {
        const matches = [...s.commands].filter(([n]) => n === a[0]);
        return matches.length
          ? ok(matches.map(([, v]) => v.help).join("\n"))
          : fail(`help: no help topics match ${a[0]}`, 1);
      }
      return ok(
        "Shell builtins:\n" +
          [...builtins]
            .filter((n) => s.commands.has(n))
            .sort()
            .join("  ") +
          "\n\nInstalled commands:\n" +
          [...s.commands.keys()]
            .filter((n) => !builtins.has(n))
            .sort()
            .join("  ") +
          "\n\nhelp NAME / man NAME / NAME --help",
      );
    },
  );
  s.register("type", "type [-a] NAME ...", (a) => {
    let code = 0;
    return {
      ...ok(
        a
          .filter((x) => x !== "-a")
          .map((n) => {
            if (!s.commands.has(n)) {
              code = 1;
              return `bash: type: ${n}: not found`;
            }
            return builtins.has(n)
              ? `${n} is a shell builtin`
              : `${n} is /usr/local/bin/${n}`;
          })
          .join("\n"),
      ),
      code,
    };
  });
  s.register(
    "command",
    "command [-v|-V] NAME | command NAME ARGS ...",
    async (a, input, meta) => {
      if (a[0] === "-v" || a[0] === "-V") {
        const verbose = a.shift() === "-V";
        let code = 0;
        const out = a
          .map((n) => {
            if (!s.commands.has(n)) {
              code = 1;
              return "";
            }
            return verbose
              ? builtins.has(n)
                ? `${n} is a shell builtin`
                : `${n} is /usr/local/bin/${n}`
              : builtins.has(n)
                ? n
                : "/usr/local/bin/" + n;
          })
          .filter(Boolean);
        return { ...ok(out.join("\n")), code };
      }
      if (!a.length) return ok();
      const name = a.shift(),
        entry = s.commands.get(name);
      return entry
        ? entry.run(a, input, meta)
        : fail(`bash: ${name}: command not found`, 127);
    },
  );
  s.register("compgen", "compgen -c [prefix] | compgen -b [prefix]", (a) => {
    const names =
      a[0] === "-b"
        ? [...builtins].filter((n) => s.commands.has(n))
        : [...s.commands.keys()];
    if (!["-c", "-b"].includes(a[0]))
      return fail("compgen: expected -c or -b", 2);
    return ok(
      names
        .filter((n) => n.startsWith(a[1] || ""))
        .sort()
        .join("\n"),
    );
  });
  s.register(
    "history",
    "history [count] — show commands executed in this shell",
    (a) => {
      const n = a.length ? Number(a[0]) : s.history.length;
      if (!Number.isInteger(n) || n < 0)
        return fail("history: expected non-negative count", 2);
      return ok(
        s.history
          .slice(-n)
          .map(
            (v, i) =>
              `${s.history.length - Math.min(n, s.history.length) + i + 1}  ${v}`,
          )
          .join("\n"),
      );
    },
  );
  s.register("unset", "unset NAME ...", (a) => {
    a.forEach((n) => delete s.env[n]);
    return ok();
  });
  s.register(":", ": — successful no-op", () => ok());
  const test = (a) => {
    let result = false;
    if (a[0] === "!") {
      const r = test(a.slice(1));
      return r.code === 2 ? r : { ...r, code: r.code === 0 ? 1 : 0 };
    }
    if (!a.length) result = false;
    else if (a.length === 1) result = !!a[0];
    else if (a.length === 2) {
      const n = k.vfs.node(a[1]),
        exists = !!n || k.vfs.dynamic.has(k.vfs.path(a[1]));
      if (a[0] === "-e") result = exists;
      else if (a[0] === "-f") result = exists && n?.type !== "dir";
      else if (a[0] === "-d") result = n?.type === "dir";
      else if (a[0] === "-s") result = exists && k.vfs.read(a[1]).length > 0;
      else if (a[0] === "-n") result = a[1].length > 0;
      else if (a[0] === "-z") result = a[1].length === 0;
      else return fail("test: unknown operator", 2);
    } else if (a.length === 3) {
      const [l, op, r] = a;
      if (op === "=" || op === "==") result = l === r;
      else if (op === "!=") result = l !== r;
      else if (["-eq", "-ne", "-gt", "-ge", "-lt", "-le"].includes(op)) {
        if (!/^-?\d+$/.test(l) || !/^-?\d+$/.test(r))
          return fail("test: integer expression expected", 2);
        const x = Number(l),
          y = Number(r);
        result = {
          "-eq": x === y,
          "-ne": x !== y,
          "-gt": x > y,
          "-ge": x >= y,
          "-lt": x < y,
          "-le": x <= y,
        }[op];
      } else return fail("test: unknown operator", 2);
    } else return fail("test: unsupported expression", 2);
    return { ...ok(), code: result ? 0 : 1 };
  };
  s.register("test", "test [-e|-f|-d|-s PATH] | [-n|-z STRING] | A OP B", test);
  s.register("[", "[ EXPRESSION ] — conditional test", (a) =>
    a.at(-1) === "]" ? test(a.slice(0, -1)) : fail("[: missing ]", 2),
  );
  s.register("clear", "clear — clear terminal display", () => ({
    ...ok(),
    clearScreen: true,
  }));
  s.register("realpath", "realpath PATH ...", (a) =>
    ok(a.map((p) => k.vfs.path(p)).join("\n")),
  );
  s.register("basename", "basename PATH [SUFFIX]", (a) =>
    ok(
      (a[0] || "")
        .replace(/\/+$/, "")
        .split("/")
        .at(-1)
        .replace(
          a[1]
            ? new RegExp(a[1].replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "$")
            : /$^/,
          "",
        ),
    ),
  );
  s.register("dirname", "dirname PATH", (a) => {
    const p = (a[0] || "").replace(/\/+$/, "");
    return ok(p.includes("/") ? p.slice(0, p.lastIndexOf("/")) || "/" : ".");
  });
}
