import os from "os"

export function getIP() {
    return Object.values(os.networkInterfaces())
        .flat()
        .find(i => i && i.family === "IPv4" && !i.internal)
        ?.address
}