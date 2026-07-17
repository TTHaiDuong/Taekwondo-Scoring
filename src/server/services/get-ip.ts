import os from "os";

export function getWifiIP() {
    const wifi = os.networkInterfaces()["Wi-Fi"];

    if (!wifi) return null;

    const ipv4 = wifi.find(
        addr =>
            addr.family === "IPv4" &&
            !addr.internal
    );

    return ipv4?.address ?? null;
}