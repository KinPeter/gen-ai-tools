import os from "node:os";

/**
 * First non-internal IPv4 address of this machine, or null when none exists
 * (offline, or only IPv6/loopback). Used to log the LAN URL at startup.
 */
export function primaryLanAddress() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] ?? []) {
      const family =
        typeof iface.family === "string"
          ? iface.family.toLowerCase()
          : iface.family;
      const isIpv4 = family === "ipv4" || family === 4;
      if (isIpv4 && !iface.internal) {
        return iface.address;
      }
    }
  }
  return null;
}
