import { ok } from "../shell.js";
export function install(k, s) {
  s.register(
    "journalctl",
    "journalctl [-u unit] [-n count] [--since ISO-time] [--priority 0..7] [-f snapshot]",
    (a) => {
      const arg = (flag, fallback) =>
        a.includes(flag) ? a[a.indexOf(flag) + 1] : fallback;
      return ok(
        k.journal.query({
          unit: arg("-u"),
          limit: Number(arg("-n", 100)),
          priority: Number(arg("--priority", 7)),
          since: arg("--since"),
        }),
        30,
      );
    },
  );
}
