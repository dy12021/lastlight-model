import { fail } from "../shell.js";
export function install(k, s) {
  for (const name of ["sh", "bash"])
    s.register(
      name,
      `${name} FILE — execute a file in the supported shell subset; no host execution; no arguments; nesting <= 4`,
      async (a) => {
        if (a.length !== 1) return fail(name + ": expected one script file", 2);
        if ((s.scriptDepth || 0) >= 4)
          return fail(name + ": script nesting limit reached", 2);
        const source = k.vfs.read(a[0]),
          env = { ...s.env },
          cwd = k.vfs.cwd;
        s.scriptDepth = (s.scriptDepth || 0) + 1;
        try {
          return await s.run(source);
        } finally {
          s.env = env;
          k.vfs.cwd = cwd;
          s.scriptDepth--;
        }
      },
    );
}
