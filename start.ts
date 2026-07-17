import fs from "fs";
import { spawn } from "child_process";
import { getWifiIP } from "./src/server/services/get-ip.js";
import path from "path";
import { execSync } from "child_process";

const CADDY_FILE = "./caddy/caddyfile.yaml"

function updateCaddyFile(ip: string) {
    let text = fs.readFileSync(CADDY_FILE, "utf8");

    text = text.replace(
        /^\d+\.\d+\.\d+\.\d+\s*\{/m,
        `${ip} {`
    );

    fs.writeFileSync(CADDY_FILE, text);

    console.log("Updated Caddy IP:", ip);
}

function killOldCaddy() {
    try {
        execSync("taskkill /F /IM caddy.exe", {
            stdio: "ignore",
        });
        console.log("Killed old Caddy");
    } catch {
        console.log("Không có caddy cũ đang chạy.")
    }
}

function startCaddy() {
    const exe = path.resolve("caddy", "caddy.exe");

    const child = spawn(
        exe,
        [
            "run",
            "--config",
            path.resolve(CADDY_FILE),
        ],
        {
            stdio: "inherit",
            shell: false, // hoặc bỏ luôn dòng này
        }
    );

    child.on("error", console.error);
}

const ip = getWifiIP();

if (!ip) {
    throw new Error("Không tìm thấy IP LAN");
}

killOldCaddy()

updateCaddyFile(ip);

startCaddy();