import { ok, fail } from "../shell.js";
export function installStoryCommands(k) {
  k.shell.register(
    "relayctl",
    "relayctl status|scan|receive|sync|fetch PART [--from NODE]|assemble|probe NODE — offline roof relay; status lists blockers/chunks; sync retries advertised mirrors; config /etc/relay/link.conf; manual /usr/share/doc/relay/terminal.txt",
    async (a) => {
      try {
        if (a[0] === "status" && a.length === 1)
          return ok(
            JSON.stringify(await k.story.radioStatus(), null, 2) +
              "\nconfiguration=/etc/relay/link.conf\nmanual=/usr/share/doc/relay/terminal.txt",
          );
        if (a[0] === "scan" && a.length === 1) {
          k.story.requirePower();
          return ok(
            "passive beacon: emergency-v2\nchannel: 437.500 MHz / narrowband data\nhill-03 / RSSI -81 dBm / SNR 18 dB / spool active\nschool-02 / RSSI -89 dBm / SNR 11 dB / verified archive mirror\nridge-04 / RSSI -86 dBm / SNR 14 dB / receiver advertised\nharbor-01 / RSSI -94 dBm / SNR 7 dB / receiver advertised\nObservations: current passive sweep; transmit depends on loaded profile and deployed antenna.\nWAN route: unavailable",
            10,
          );
        }
        if (a[0] === "receive" && a.length === 1)
          return ok(await k.story.receive(), 10);
        if (a[0] === "sync" && a.length === 1)
          return ok(await k.story.sync(), 25);
        if (
          a[0] === "fetch" &&
          (a.length === 2 || (a.length === 4 && a[2] === "--from"))
        )
          return ok(await k.story.fetch(Number(a[1]), a[3]), 10);
        if (a[0] === "assemble" && a.length === 1)
          return ok(await k.story.assemble(), 10);
        if (a[0] === "probe" && a.length === 2)
          return ok(k.story.probe(a[1]), 10);
        return fail(
          "relayctl: expected status|scan|receive|sync|fetch PART [--from NODE]|assemble|probe NODE",
          2,
        );
      } catch (e) {
        k.journal.add("relay.service", e.message, 3);
        return fail(e.message, 1, 3);
      }
    },
  );
  k.shell.register(
    "energyctl",
    "energyctl status — read measured daily budget; config /etc/kiwi/runtime.conf",
    (a) =>
      a.length === 1 && a[0] === "status"
        ? ok(JSON.stringify(k.story.energy(), null, 2))
        : fail("energyctl: expected status", 2),
  );
}
