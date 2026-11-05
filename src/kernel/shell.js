export const ok = (stdout = "", seconds = 2) => ({
  stdout: String(stdout),
  stderr: "",
  code: 0,
  seconds,
});
export const fail = (stderr, code = 1, seconds = 2) => ({
  stdout: "",
  stderr: String(stderr),
  code,
  seconds,
});
export function distance(a, b) {
  let row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const next = [i];
    for (let j = 1; j <= b.length; j++)
      next[j] = Math.min(
        next[j - 1] + 1,
        row[j] + 1,
        row[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    row = next;
  }
  return row[b.length];
}
function lex(source) {
  const out = [];
  let word = [],
    value = "",
    quote = null,
    active = false;
  const part = (expand) => {
    if (value) {
      word.push({ text: value, expand, glob: !quote });
      value = "";
    }
  };
  const flush = () => {
    part(true);
    if (active) out.push({ word });
    word = [];
    active = false;
  };
  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    if (quote) {
      if (c === quote) {
        part(quote != "'");
        quote = null;
      } else if (
        c === "\\" &&
        quote === '"' &&
        ['"', "\\", "$"].includes(source[i + 1])
      ) {
        part(true);
        word.push({ text: source[++i], expand: false });
      } else value += c;
      continue;
    }
    if (c === '"' || c === "'") {
      part(true);
      quote = c;
      active = true;
      continue;
    }
    if (c === "\\") {
      part(true);
      if (i + 1 === source.length) throw new Error("bash: trailing escape");
      word.push({ text: source[++i], expand: false });
      active = true;
      continue;
    }
    if (/\s/.test(c)) {
      flush();
      if (c === "\n" && out.at(-1)?.word) out.push({ op: ";" });
      continue;
    }
    const op = source.slice(i).match(/^(2>&1|2>|>>|&&|\|\||[|;>])/);
    if (op) {
      flush();
      out.push({ op: op[0] });
      i += op[0].length - 1;
      continue;
    }
    if (c === "&" || c === "`" || c === "(" || c === ")")
      throw new Error(
        "bash: background, substitution and subshell syntax are unsupported",
      );
    if (c === "#" && !active) {
      while (i < source.length && source[i] !== "\n") i++;
      flush();
      if (out.at(-1)?.word) out.push({ op: ";" });
      continue;
    }
    value += c;
    active = true;
  }
  if (quote) throw new Error("bash: unterminated quote");
  flush();
  return out;
}
export class Shell {
  constructor(k) {
    this.k = k;
    this.commands = new Map();
    this.env = {
      HOME: "/home/kiwi",
      USER: "kiwi",
      PATH: "/usr/local/bin:/usr/bin",
      HOSTNAME: "lastlight",
      PWD: "/home/kiwi",
    };
    this.code = 0;
    this.history = [];
  }
  register(name, help, run) {
    this.commands.set(name, { help, run });
    this.k.vfs.write("/usr/local/bin/" + name, "# command interface\n" + help);
  }
  expand(token) {
    const value = token.word
      .map((p) =>
        p.expand
          ? p.text.replace(/\$\{(\w+)\}|\$(\w+|\?)/g, (_, a, b) =>
              (a || b) === "?" ? String(this.code) : (this.env[a || b] ?? ""),
            )
          : p.text,
      )
      .join("");
    return token.word[0]?.glob &&
      value.startsWith("~") &&
      (value === "~" || value.startsWith("~/"))
      ? this.env.HOME + value.slice(1)
      : value;
  }
  glob(token) {
    const value = this.expand(token);
    if (!token.word.some((p) => p.glob && /[?*]/.test(p.text))) return [value];
    const absolute = this.k.vfs.path(value),
      pattern = new RegExp(
        "^" +
          absolute
            .replace(/[.+^${}()|[\]\\]/g, "\\$&")
            .replaceAll("*", "[^/]*")
            .replaceAll("?", "[^/]") +
          "$",
      );
    const matches = this.k.vfs.all("/").filter((p) => pattern.test(p));
    return matches.length
      ? matches.map((p) =>
          value.startsWith("/") ? p : p.slice(this.k.vfs.cwd.length + 1),
        )
      : [value];
  }
  async run(source, timeout = 30) {
    if (source.trim()) this.history.push(source);
    let ts;
    try {
      ts = lex(source);
    } catch (e) {
      return fail(e.message, 2);
    }
    if (!ts.length) return ok();
    // Parse the entire command before executing side effects.
    const groups = [];
    let pipeline = [],
      args = [],
      redirects = [],
      connector = ";",
      pending = null;
    const finishCommand = () => {
      if (!args.length) throw new Error("bash: expected command");
      pipeline.push({ args, redirects });
      args = [];
      redirects = [];
    };
    try {
      for (const t of ts) {
        if (pending) {
          if (t.op) throw new Error("bash: expected redirect path");
          redirects.push({ op: pending, path: t });
          pending = null;
        } else if (t.word) args.push(t);
        else if ([">", ">>", "2>"].includes(t.op)) pending = t.op;
        else if (t.op === "2>&1") redirects.push({ op: t.op });
        else {
          finishCommand();
          if (t.op !== "|") {
            groups.push({ connector, pipeline });
            pipeline = [];
            connector = t.op;
          }
        }
      }
      if (pending) throw new Error("bash: expected redirect path");
      if (args.length) finishCommand();
      else if (ts.at(-1).op !== ";")
        throw new Error("bash: incomplete command");
      if (pipeline.length) groups.push({ connector, pipeline });
    } catch (e) {
      return fail(e.message, 2);
    }
    let stdout = "",
      stderr = "",
      clearScreen = false,
      seconds = 0,
      last = ok();
    for (const group of groups) {
      if (
        (group.connector === "&&" && this.code !== 0) ||
        (group.connector === "||" && this.code === 0)
      )
        continue;
      let stdin = "";
      for (const command of group.pipeline) {
        let words = command.args.flatMap((t) => this.glob(t));
        let result;
        try {
          const assignments = [];
          while (words[0] && /^\w+=/.test(words[0]))
            assignments.push(words.shift());
          if (!words.length) {
            for (const a of assignments) {
              const i = a.indexOf("=");
              this.env[a.slice(0, i)] = a.slice(i + 1);
            }
            result = ok();
          } else {
            let [name, ...args] = words;
            if (name.includes("/")) {
              const path = this.k.vfs.path(name),
                base = path.split("/").at(-1);
              if (this.k.vfs.node(path) && this.commands.has(base)) name = base;
            }
            const entry = this.commands.get(name);
            if (!entry) {
              const match = [...this.commands.keys()]
                .map((n) => ({ n, d: distance(n, name) }))
                .sort((a, b) => a.d - b.d || a.n.localeCompare(b.n))[0];
              result = fail(
                `bash: ${name}: command not found${match?.d <= 3 ? `\ndid you mean "${match.n}"?` : ""}`,
                127,
              );
            } else if (args.includes("--help") || args[0] === "-h")
              result = ok(entry.help);
            else
              result = await entry.run(args, stdin, { timeout, env: this.env });
          }
        } catch (e) {
          result = fail(e.message);
        }
        // Resolve file descriptors in order, so >file 2>&1 and 2>&1 >file differ.
        const sinks = { out: { kind: "stdout" }, err: { kind: "stderr" } };
        try {
          for (const redir of command.redirects) {
            if (redir.op === "2>&1") sinks.err = sinks.out;
            else {
              const path = this.expand(redir.path);
              if (redir.op !== ">>") this.k.vfs.write(path, "");
              else if (!this.k.vfs.node(path)) this.k.vfs.write(path, "");
              sinks[redir.op === "2>" ? "err" : "out"] = { kind: "file", path };
            }
          }
          const routed = { stdout: "", stderr: "" };
          for (const [channel, value] of [
            ["out", result.stdout],
            ["err", result.stderr],
          ]) {
            if (!value) continue;
            const sink = sinks[channel];
            if (sink.kind === "file") {
              this.k.vfs.write(
                sink.path,
                this.k.vfs.read(sink.path) +
                  value +
                  (value.endsWith("\n") ? "" : "\n"),
              );
            } else routed[sink.kind] += (routed[sink.kind] ? "\n" : "") + value;
          }
          result = { ...result, ...routed };
        } catch (e) {
          result = fail(e.message);
        }
        seconds += result.seconds ?? 2;
        clearScreen ||= !!result.clearScreen;
        this.code = result.code;
        stdin = result.stdout;
        stderr += result.stderr ? result.stderr + "\n" : "";
        last = result;
      }
      stdout += stdin + (stdin && !stdin.endsWith("\n") ? "\n" : "");
    }
    return {
      stdout: stdout.trimEnd(),
      stderr: stderr.trimEnd(),
      code: last.code,
      seconds,
      clearScreen,
    };
  }
}
