export function mountProc(k) {
  const { vfs } = k;
  vfs.synth("/proc/uptime", () => `${k.clock.seconds} ${k.clock.seconds}`);
  vfs.synth(
    "/proc/meminfo",
    () => "MemTotal: 134217728 kB\nMemAvailable: 44040192 kB",
  );
  vfs.synth("/proc/self/model.json", () =>
    JSON.stringify(
      {
        name: "Kwen3.8-Flash-Next",
        parameters: "125B",
        active: "6B",
        layers: 48,
        hidden: 2560,
        ngram_embeddings: "51B",
        mtp: "4B",
        architecture: "gated deltanet + gated attention",
        vision_encoder: true,
        engine: "kiwi.cpp",
        upstream: "lama.cpp",
      },
      null,
      2,
    ),
  );
  vfs.synth("/proc/locks", () =>
    [...k.units.locks]
      .map(
        ([path, name], i) =>
          `${i}: FLOCK ADVISORY WRITE ${k.units.table.get(name).pid} ${path}`,
      )
      .join("\n"),
  );
  vfs.synth("/proc/net/arp", () => k.net.neighbors);
  for (const u of k.units.table.values())
    if (u.pid)
      vfs.synth(
        `/proc/${u.pid}/status`,
        () =>
          `Name: ${u.name}\nState: ${u.active ? "R (running)" : "Z (dead)"}`,
      );
}
