import { ok, fail } from "../shell.js";
export function install(k, s) {
  s.register(
    "wakeonlan",
    "wakeonlan MAC — broadcast a magic packet to a standby device",
    (a) => ok(k.net.wake(a[0] || ""), 45),
  );
  s.register("ping", "ping [-c1|-c 1] IP — send one ICMP echo request", (a) => {
    const ip = a.at(-1);
    return k.net.reachable(ip)
      ? ok(
          `64 bytes from ${ip}: icmp_seq=1 ttl=64 time=0.6 ms\n1 packets transmitted, 1 received, 0% packet loss`,
          5,
        )
      : fail(
          `From 192.168.1.50 Destination Host Unreachable: ${ip}\n1 packets transmitted, 0 received, 100% packet loss`,
          1,
          5,
        );
  });
  s.register("ip", "ip addr|link|route|neigh [show]", (a) => {
    if (a[0] === "neigh") return ok(k.net.neighbors);
    if (a[0] === "addr")
      return ok("1: lo inet 127.0.0.1/8\n2: eth0 UP inet 192.168.1.50/24");
    if (a[0] === "link") return ok("eth0: UP LOWER_UP mtu 1500");
    if (a[0] === "route")
      return ok(
        "default via 192.168.1.1 dev eth0\n192.168.1.0/24 dev eth0 scope link src 192.168.1.50",
      );
    return fail("ip: unsupported action", 2);
  });
  s.register("arp", "arp [-a] — neighbor table", () => ok(k.net.neighbors));
  for (const name of ["ssh", "nc"])
    s.register(name, `${name} host [port] — inspect connectivity`, (a) => {
      const host = a.find((x) => /^(\d{1,3}\.){3}\d{1,3}$/.test(x)) || a[0];
      return k.net.reachable(host)
        ? fail(
            `${name}: ${host}: connection refused (no remote shell exposed)`,
            1,
          )
        : fail(`${name}: ${host}: network unreachable`, 1);
    });
}
