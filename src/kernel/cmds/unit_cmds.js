import { ok } from "../shell.js";
export function install(k, s) {
  s.register(
    "systemctl",
    "systemctl status|start|stop|restart|enable|is-active UNIT | list-units",
    (a) => {
      if (a[0] === "list-units")
        return ok(
          [...k.units.table.values()]
            .map(
              (u) =>
                `${u.name.padEnd(25)} loaded ${u.active ? "active running" : "inactive dead"}`,
            )
            .join("\n"),
        );
      const r = k.units.action(a[0], a[1]);
      return {
        stdout: r.code === 0 ? r.text : "",
        stderr: r.code ? r.text : "",
        code: r.code,
        seconds: a[0] === "restart" ? 120 : 2,
      };
    },
  );
}
