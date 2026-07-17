// server/overlay-render/renderOverlay.ts
import puppeteer from "puppeteer"
import { spawn } from "child_process"
import path from "path"
import fs from "fs"

const OVERLAY_FPS = 30

export async function renderOverlayVideo(opts: {
    scoreEvents: { timestamp: number; redScore: number; blueScore: number }[]
    timerEvents: { timestamp: number; remainingMs: number; isRunning: boolean }[]
    startWallClockMs: number   // thời điểm bắt đầu clip theo giờ tường
    durationSec: number
    isReplay: boolean
    outWidth: number
    outHeight: number
    outPath: string           // đường dẫn file overlay.webm (VP9 + alpha)
}) {
    const browser = await puppeteer.launch({ args: ["--no-sandbox"] })
    const page = await browser.newPage()
    await page.setViewport({ width: opts.outWidth, height: opts.outHeight })

    // Bơm dữ liệu VÀO TRƯỚC khi load trang, để script overlay.html đọc được
    await page.evaluateOnNewDocument((data) => {
        (window as any).__OVERLAY_DATA__ = data
    }, {
        scoreEvents: opts.scoreEvents,
        timerEvents: opts.timerEvents,
        isReplay: opts.isReplay,
    })

    await page.goto(`file://${path.join(__dirname, "overlay.html")}`)

    const totalFrames = Math.ceil(opts.durationSec * OVERLAY_FPS)
    const framesDir = fs.mkdtempSync("/tmp/overlay-frames-")

    for (let i = 0; i < totalFrames; i++) {
        const wallClockMs = opts.startWallClockMs + (i / OVERLAY_FPS) * 1000
        await page.evaluate((t) => (window as any).renderAtTime(t), wallClockMs)
        await page.screenshot({
            path: path.join(framesDir, `f${String(i).padStart(6, "0")}.png`),
            omitBackground: true,   // GIỮ ALPHA — nền overlay.html trong suốt
        })
    }
    await browser.close()

    // Ghép chuỗi PNG (còn alpha) thành video VP9 + alpha channel (yuva420p)
    await new Promise<void>((resolve, reject) => {
        const ff = spawn("ffmpeg", [
            "-y",
            "-framerate", String(OVERLAY_FPS),
            "-i", path.join(framesDir, "f%06d.png"),
            "-c:v", "libvpx-vp9", "-pix_fmt", "yuva420p",
            opts.outPath,
        ])
        ff.on("exit", (code) => code === 0 ? resolve() : reject(new Error("ffmpeg overlay build lỗi")))
    })

    fs.rmSync(framesDir, { recursive: true, force: true })
}