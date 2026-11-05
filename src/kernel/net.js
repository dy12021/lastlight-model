export const ROUTER_MAC = "A4:5E:60:11:22:33";
export class Network {
  constructor(journal) {
    this.journal = journal;
    this.awake = false;
  }
  reachable(ip) {
    return (
      ["127.0.0.1", "localhost", "192.168.1.50", "192.168.1.2"].includes(ip) ||
      (this.awake &&
        [
          "192.168.1.1",
          "192.168.1.60",
          "192.168.1.71",
          "192.168.1.72",
        ].includes(ip))
    );
  }
  wake(mac) {
    if (mac.toUpperCase() !== ROUTER_MAC) {
      if (mac.toUpperCase() === "D4:5E:60:AA:BB:CC")
        throw new Error("wakeonlan: target is not in standby");
      throw new Error(
        `wakeonlan: no such device; known standby device RT-01 ${ROUTER_MAC}`,
      );
    }
    if (this.awake) throw new Error("wakeonlan: target is not in standby");
    this.awake = true;
    this.journal.add(
      "network.service",
      "RT-01 CPU restarted. Wi-Fi lastlight active. DGI-Power2000 reconnected: 192.168.1.60",
    );
    this.journal.add(
      "hass.service",
      "LAN devices reconnected; camera.living_room / camera.balcony; inventory=/etc/home-assistant/devices.json; pending=/var/log/home-asistent/optics-watch.log",
    );
    return `Broadcasting magic packet to 255.255.255.255:9\n${"FF ".repeat(6)}${(mac.replaceAll(":", " ") + " ").repeat(16)}\nRT-01: active; Wi-Fi clients reconnected\nHome Assistant: LAN device inventory refreshed; /etc/home-assistant/devices.json`;
  }
  get neighbors() {
    return (
      "192.168.1.2 dev eth0 lladdr 9c:3a:1d:44:55:66 REACHABLE" +
      (this.awake
        ? "\n192.168.1.1 dev eth0 lladdr a4:5e:60:11:22:33 REACHABLE\n192.168.1.60 dev eth0 lladdr d4:5e:60:aa:bb:cc REACHABLE\n192.168.1.71 dev eth0 lladdr 02:71:00:00:00:01 REACHABLE\n192.168.1.72 dev eth0 lladdr 02:72:00:00:00:01 REACHABLE"
        : "")
    );
  }
}
