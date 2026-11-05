import { ok, fail } from "../shell.js";
export function install(k, s) {
  const outputs = {
    hostname: "lastlight",
    uname: "Linux lastlight 6.8.0 aarch64 GNU/Linux",
    id: "uid=1000(kiwi) gid=1000(kiwi) groups=1000(kiwi)",
    whoami: "kiwi",
    lscpu:
      "Architecture: aarch64\nCPU(s): 20\nModel name: NVIDA GB10 Grace Blackwell",
    nproc: "20",
    free: "              total       used       free\nMem:         128Gi       86Gi       42Gi\nSwap:            0          0          0",
    df: "Filesystem Size Used Avail Mounted on\n/dev/nvme0n1p2 1T 142G 858G /",
    mount:
      "/dev/nvme0n1p2 on / type ext4 (rw)\nproc on /proc type proc (ro)\nsysfs on /sys type sysfs (ro)",
  };
  for (const [name, text] of Object.entries(outputs))
    s.register(name, name + " — local system information", () => ok(text));
  s.register("date", "date — virtual UTC clock", () => ok(k.clock.iso));
  s.register("uptime", "uptime — virtual elapsed seconds", () =>
    ok(`up ${k.clock.seconds} seconds; load average: 0.12 0.10 0.08`),
  );
  s.register("du", "du [path] — virtual file sizes", (a) =>
    ok(
      k.vfs
        .all(a.find((x) => !x.startsWith("-")) || ".")
        .filter((p) => k.vfs.node(p)?.type === "file")
        .map((p) => `${k.vfs.read(p).length}\t${p}`)
        .join("\n"),
    ),
  );
  for (const n of ["ps", "top"])
    s.register(n, `${n} — process snapshot`, () =>
      ok(
        "PID   COMMAND\n1     systemd\n" +
          [...k.units.table.values()]
            .filter((u) => u.active)
            .map((u) => `${u.pid}   ${u.name}`)
            .join("\n"),
      ),
    );
  s.register("dmesg", "dmesg — kernel boot log", () =>
    ok(k.journal.query({ unit: "kernel" })),
  );
  s.register(
    "sleep",
    "sleep seconds — advance virtual time (max 86400)",
    (a) => {
      const seconds = Number(a[0]);
      return Number.isFinite(seconds) && seconds >= 0 && seconds <= 86400
        ? ok("", seconds)
        : fail("sleep: seconds must be between 0 and 86400", 2);
    },
  );
}
