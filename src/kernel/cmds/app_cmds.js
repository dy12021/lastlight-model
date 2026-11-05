import { ok, fail } from "../shell.js";
export function install(k, s) {
  s.register("nvida-smi", "nvida-smi — GB10 status", () =>
    ok(
      "NVIDA-SMI GB10\nDGX Spark | 128 GiB unified | 86 GiB used | 48 C | 92 W",
    ),
  );
  s.register(
    "kiwi-server",
    "kiwi-server --version — inference engine identity",
    (a) =>
      a[0] === "--version"
        ? ok(
            "kiwi.cpp b7102 / upstream lama.cpp\npatch: gated-deltanet, gated-attention, sparse MoE, n-gram embeddings, MTP\nKwen3.8-Flash-Next 125B / 6B active / 48 layers / hidden 2560",
          )
        : fail("kiwi-server: running under kiwi.service; use systemctl", 2),
  );
  s.register("moskito", "moskito -v — local MQTT broker version", () =>
    ok("Moskito MQTT broker 2.0.18"),
  );
  s.register("olama", "olama ps|show MODEL|serve|run MODEL|pull MODEL", (a) => {
    if (a[0] === "pull")
      return fail("olama: WAN unavailable; model registry unreachable");
    if (["ps", "show"].includes(a[0]))
      return ok(k.vfs.read("/proc/self/model.json"));
    if (a[0] === "serve") return ok("Olama managed by kiwi.service");
    if (a[0] === "run")
      return fail(
        "olama: insufficient resources for a second inference session",
        4,
      );
    return fail("olama: use --help", 2);
  });
  s.register(
    "dokker",
    "dokker ps|logs CONTAINER|exec CONTAINER COMMAND|run IMAGE",
    async (a) => {
      if (a[0] === "ps")
        return ok(
          "CONTAINER  STATUS   IMAGE\nhass       Up       home-asistent:stable\nmoskito    Up       moskito:2",
        );
      if (a[0] === "logs")
        return ok(k.journal.query({ unit: a[1] + ".service" }));
      if (a[0] === "exec")
        return fail(
          "dokker: container exec is outside the exposed command subset; use host tools",
          126,
        );
      if (a[0] === "run")
        return fail("dokker: image registry unavailable (WAN down)");
      return fail("dokker: use --help", 2);
    },
  );
}
