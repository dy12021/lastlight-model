import { ok, fail } from "../shell.js";
export function install(k, s) {
  const reg = (n, h, f) => s.register(n, h, f),
    v = k.vfs;
  const data = (a, input) => (a.length ? v.read(a[0]) : input);
  reg("echo", "echo [-n] words ...", (a) =>
    ok(a.filter((x) => x !== "-n").join(" ")),
  );
  reg("printf", "printf format [arguments ...]", (a) => {
    let i = 1;
    return ok(
      (a[0] || "")
        .replace(/%[sd]/g, () => a[i++] ?? "")
        .replaceAll("\\n", "\n")
        .replaceAll("\\t", "\t"),
    );
  });
  reg("wc", "wc [-lwc] [file]", (a, input) => {
    const text = data(
        a.filter((x) => !x.startsWith("-")),
        input,
      ),
      lines = text ? text.trimEnd().split("\n").length : 0,
      words = text.trim() ? text.trim().split(/\s+/).length : 0;
    return ok(
      a.includes("-l")
        ? lines
        : a.includes("-w")
          ? words
          : a.includes("-c")
            ? text.length
            : `${lines} ${words} ${text.length}`,
    );
  });
  reg("sort", "sort [-r] [-n] [file]", (a, input) => {
    let lines = data(
      a.filter((x) => !x.startsWith("-")),
      input,
    )
      .trimEnd()
      .split("\n");
    lines.sort(a.includes("-n") ? (a, b) => Number(a) - Number(b) : undefined);
    if (a.includes("-r")) lines.reverse();
    return ok(lines.join("\n"));
  });
  reg("uniq", "uniq [file] — collapse adjacent duplicate lines", (a, input) =>
    ok(
      data(a, input)
        .split("\n")
        .filter((l, i, all) => !i || l !== all[i - 1])
        .join("\n"),
    ),
  );
  reg("cut", "cut -d delimiter -f field [file]", (a, input) => {
    const d = a.indexOf("-d"),
      f = a.indexOf("-f");
    if (f < 0) return fail("cut: -f required", 2);
    const excluded = new Set([d, d + 1, f, f + 1]);
    return ok(
      data(
        a.filter((_, i) => !excluded.has(i)),
        input,
      )
        .split("\n")
        .map(
          (l) => l.split(d >= 0 ? a[d + 1] : "\t")[Number(a[f + 1]) - 1] ?? "",
        )
        .join("\n"),
    );
  });
  reg("tr", "tr from to — translate stdin", (a, input) =>
    ok(
      [...input]
        .map((c) => {
          const i = (a[0] || "").indexOf(c);
          return i < 0
            ? c
            : (a[1] || "")[Math.min(i, (a[1] || "").length - 1)] || "";
        })
        .join(""),
    ),
  );
  reg("sed", "sed [-i] s/pattern/replacement/[g] [file]", (a, input) => {
    const inplace = a[0] === "-i";
    if (inplace) a = a.slice(1);
    const match = a[0]?.match(/^s(.)(.*?)\1(.*?)\1(g?)$/);
    if (!match) return fail("sed: supported syntax s/pattern/replacement/g", 2);
    const result = data(a.slice(1), input).replace(
      new RegExp(match[2], match[4]),
      match[3],
    );
    if (inplace) {
      v.write(a[1], result);
      return ok();
    }
    return ok(result);
  });
  reg("awk", "awk [-F delimiter] '{print $N}' [file]", (a, input) => {
    let separator = /\s+/;
    if (a[0] === "-F") {
      separator = a[1];
      a = a.slice(2);
    }
    const match = a[0]?.match(/^\{\s*print\s+\$(\d+)\s*\}$/);
    if (!match) return fail("awk: supported form {print $N}", 2);
    const field = Number(match[1]);
    return ok(
      data(a.slice(1), input)
        .split("\n")
        .map((l) => (field ? (l.split(separator)[field - 1] ?? "") : l))
        .join("\n"),
    );
  });
  reg(
    "jq",
    "jq [-r] .path[.nested] [file] — JSON field selection",
    (a, input) => {
      const raw = a[0] === "-r";
      if (raw) a = a.slice(1);
      const query = a[0] || ".";
      if (!/^\.(?:[\w]+(?:\.[\w]+)*)?$/.test(query))
        return fail("jq: supported query . or .field.nested", 2);
      let obj = JSON.parse(data(a.slice(1), input));
      for (const key of query.slice(1).split(".").filter(Boolean))
        obj = obj?.[key] ?? null;
      return ok(
        raw && typeof obj === "string" ? obj : JSON.stringify(obj, null, 2),
      );
    },
  );
  reg("tee", "tee [-a] file ...", (a, input) => {
    const append = a.includes("-a");
    for (const p of a.filter((x) => x !== "-a")) {
      let old = "";
      if (append)
        try {
          old = v.read(p);
        } catch {}
      v.write(p, old + input + "\n");
    }
    return ok(input);
  });
  reg("diff", "diff first second", (a) => {
    const left = v.read(a[0]),
      right = v.read(a[1]);
    return left === right
      ? ok()
      : { ...ok(`< ${left}\n---\n> ${right}`), code: 1 };
  });
  reg("which", "which command ...", (a) =>
    ok(
      a
        .map((n) =>
          s.commands.has(n) ? "/usr/local/bin/" + n : `${n} not found`,
        )
        .join("\n"),
    ),
  );
  reg("env", "env — show environment", () =>
    ok(
      Object.entries(s.env)
        .map(([a, b]) => a + "=" + b)
        .join("\n"),
    ),
  );
  reg("export", "export NAME=value ...", (a) => {
    for (const item of a) {
      const m = item.match(/^(\w+)=(.*)$/s);
      if (!m) return fail("export: expected NAME=value", 2);
      s.env[m[1]] = m[2];
    }
    return ok();
  });
  reg("seq", "seq [first] last", (a) => {
    const start = a.length === 1 ? 1 : Number(a[0]),
      end = Number(a.at(-1));
    if (!Number.isFinite(start) || !Number.isFinite(end) || end - start > 20000)
      return fail("seq: range must be finite and <= 20000", 2);
    return ok(
      Array.from(
        { length: Math.max(0, end - start + 1) },
        (_, i) => start + i,
      ).join("\n"),
    );
  });
  reg("true", "true — exit 0", () => ok());
  reg("false", "false — exit 1", () => ({ ...ok(), code: 1 }));
  reg("man", "man command — show supported syntax", (a) =>
    s.commands.has(a[0])
      ? ok(s.commands.get(a[0]).help)
      : fail("No manual entry for " + a[0], 3),
  );
}
