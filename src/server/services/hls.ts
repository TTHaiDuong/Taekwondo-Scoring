import fs from "fs"
import path from "path"
import { spawn, ChildProcess } from "child_process"
import { Server as SocketIOServer, Socket } from "socket.io"
import express from "express"

// ============================================================
// HLS STREAMING SERVICE
// Camera gửi video (+ audio) chất lượng gốc qua Socket.IO (namespace "/api/camera").
// FFmpeg nhận từ stdin, transcode ra NHIỀU rendition (ABR)
// và ghi HLS segments ra thư mục tĩnh.
// VIR chỉ fetch master.m3u8 để tua lại (rewind)/lưu clip — xem live giờ
// đi qua LiveKit riêng, HLS chỉ phục vụ replay.
// ============================================================

import { execSync } from "child_process"
import { getTimerEventsInRange } from "./timer"
import { getScoreEventsInRange } from "./score"
import { renderOverlayVideo } from "../overlay-render/renderOverlay"

const HLS_DIR = path.join(process.cwd(), "public", "hls")
const CLIPS_DIR = path.join(process.cwd(), "public", "clips")

function resetStorage() {
    for (const dir of [HLS_DIR, CLIPS_DIR]) {
        fs.rmSync(dir, {
            recursive: true,
            force: true,
        })

        fs.mkdirSync(dir, {
            recursive: true,
        })
    }
}

// Thêm hàm helper trong file server HLS
function readPlaylistStats(hlsDir: string): { totalDurationSec: number; lastSegmentAt: number } | null {
    const playlistPath = path.join(hlsDir, "source", "stream.m3u8")
    if (!fs.existsSync(playlistPath)) return null

    try {
        const content = fs.readFileSync(playlistPath, "utf8")
        // Cộng dồn TẤT CẢ giá trị #EXTINF:<giây> — đây là tổng thời lượng
        // THẬT theo đúng số liệu FFmpeg đã ghi vào playlist, không suy đoán
        // qua số lượng segment × SEGMENT_DURATION (vì segment cuối có thể
        // ngắn hơn segment chuẩn).
        let totalDurationSec = 0
        const extinfRegex = /#EXTINF:([\d.]+),/g
        let match: RegExpExecArray | null
        while ((match = extinfRegex.exec(content)) !== null) {
            totalDurationSec += parseFloat(match[1])
        }

        // mtime của file playlist = lần FFmpeg ghi gần nhất — dùng làm tín
        // hiệu THẬT để biết stream có đang "sống" hay không, không cần hls.js.
        const stat = fs.statSync(playlistPath)
        return { totalDurationSec, lastSegmentAt: stat.mtimeMs }
    } catch {
        return null
    }
}

// ── Dọn ffmpeg "mồ côi" từ lần chạy server TRƯỚC ─────────────
// node --watch (hoặc crash/restart bất kỳ) không tự kill các tiến trình
// ffmpeg CON đã spawn ở lần chạy trước — chúng tiếp tục chạy độc lập, vẫn
// ghi đè/khoá file trong public/hls, chiếm CPU, và có thể xung đột với
// FFmpeg mới khi camera reconnect vào cùng courtId/cameraId. Diệt chúng
// khi server khởi động, lọc CHÍNH XÁC theo HLS_DIR của app này (không diệt
// nhầm tiến trình ffmpeg khác không liên quan đang chạy trên cùng máy).
function killOrphanedFfmpeg() {
    try {
        if (process.platform === "win32") {

            const psScript = `
Get-CimInstance Win32_Process |
Where-Object {
    $_.Name -eq 'ffmpeg.exe' -and
    $_.CommandLine -like '*${HLS_DIR}*'
} |
ForEach-Object {
    Stop-Process -Id $_.ProcessId -Force
}
`;

            execSync(
                `powershell -NoProfile -ExecutionPolicy Bypass -Command "${psScript}"`,
                { stdio: "ignore" }
            );

        } else {

            execSync(`pkill -f "${HLS_DIR}" || true`, {
                stdio: "ignore",
            });

        }

        console.log("[HLS] Đã dọn ffmpeg mồ côi");

    } catch {

        console.log("[HLS] Không có ffmpeg mồ côi");

    }
}

const SEGMENT_DURATION = 2
const PLAYLIST_SIZE = 1800

const RENDITIONS = [
    // { name: "720p", height: 720, videoBitrate: "2500k", maxrate: "2675k", bufsize: "3750k" },
    // { name: "480p", height: 480, videoBitrate: "1000k", maxrate: "1075k", bufsize: "1500k" },
    // { name: "source", height: null, videoBitrate: "4500k", maxrate: "4800k", bufsize: "6750k" },
    { name: "source", height: null, videoBitrate: "3000k", maxrate: "3200k", bufsize: "4500k" },

] as const

const AUDIO_BITRATE = "128k"

type CameraSession = {
    cameraId: string
    courtId: string
    ffmpeg: ChildProcess
    socket: Socket
    hlsDir: string
    startedAt: number
    paused: boolean
    zoom: number
    chunkCount?: number
}

const sessions = new Map<string, CameraSession>()

function ensureDir(dir: string) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
}

function sessionKey(courtId: string, cameraId: string) {
    return `${courtId}/${cameraId}`
}

function mimeToFfmpegFormat(mime: string | undefined): string | null {
    if (!mime) return null
    // FFmpeg cần biết CHÍNH XÁC container để demux qua pipe (không seek
    // được) — để nó tự auto-probe rất dễ fail ngay từ chunk đầu, nhất là
    // với MP4 phân mảnh (fragmented) trôi vào theo từng đoạn nhỏ.
    if (mime.startsWith("video/mp4")) return "mp4"
    if (mime.startsWith("video/webm")) return "webm"
    return null // không nhận diện được — để ffmpeg tự auto-probe (hành vi cũ)
}

function spawnFFmpeg(hlsDir: string, key: string, inputFormat: string | null): ChildProcess {
    ensureDir(hlsDir)

    const needsFilterComplex = RENDITIONS.length > 1 || RENDITIONS.some(r => r.height)

    let filterComplex: string | null = null
    if (needsFilterComplex) {
        const splitLabels = RENDITIONS.map(r => `[v_${r.name}]`).join("")
        const scaleFilters = RENDITIONS
            .filter(r => r.height)
            .map(r => `[v_${r.name}]scale=-2:${r.height}[v_${r.name}_out]`)
            .join("; ")
        filterComplex = scaleFilters
            ? `[0:v]split=${RENDITIONS.length}${splitLabels}; ${scaleFilters}`
            : `[0:v]split=${RENDITIONS.length}${splitLabels}`
    }

    // Khi KHÔNG có filter_complex, map thẳng "0:v" (input gốc) thay vì
    // label ảo — vì label đó không còn tồn tại nữa.
    const outputLabel = (name: string, height: number | null) =>
        needsFilterComplex ? (height ? `[v_${name}_out]` : `[v_${name}]`) : "0:v"

    const args: string[] = [
        "-y",
        // "-use_wallclock_as_timestamps 1" (dùng trước đây để chống trôi
        // audio/video) lại chính là NGUYÊN NHÂN gây log "Non-monotonic DTS" /
        // "Queue input is backward in time" liên tục: khi chunk audio (tần
        // suất cao, frame nhỏ) đến qua mạng không đều (dồn cục do buffering),
        // timestamp tính theo giờ tường cho từng audio frame dễ tính RA NHỎ
        // HƠN timestamp trước đó → FFmpeg phải tự vá liên tục. Bỏ cờ này,
        // dùng "+genpts" để tự sinh PTS nhất quán từ luồng, và xử lý trôi nhẹ
        // (nếu có) bằng bộ lọc "aresample=async=1" ở audio bên dưới — đúng
        // cách khuyến nghị của FFmpeg cho input dạng live/piped thay vì áp
        // đặt lại toàn bộ timestamp theo đồng hồ hệ thống.
        "-fflags", "+genpts",
        ...(inputFormat ? ["-f", inputFormat] : []),
        "-i", "pipe:0",
        ...(filterComplex ? ["-filter_complex", filterComplex] : []),
    ]

    RENDITIONS.forEach((r, i) => {
        args.push(
            "-map", outputLabel(r.name, r.height),
            `-c:v:${i}`, "libx264",
            "-preset", "veryfast",
            // "-tune", "zerolatency",
            `-b:v:${i}`, r.videoBitrate,
            `-maxrate:v:${i}`, r.maxrate,
            `-bufsize:v:${i}`, r.bufsize,
            `-r:v:${i}`, "30",
            "-g", String(SEGMENT_DURATION * 60),
            // "-sc_threshold", "0",
        )
    })

    RENDITIONS.forEach((_, i) => {
        args.push(
            "-map", "0:a?", `-c:a:${i}`, "aac", `-b:a:${i}`, AUDIO_BITRATE, "-ar", "44100",
            // Tự làm mượt lệch nhỏ về timestamp audio (thay vì áp đặt lại
            // toàn bộ bằng wallclock) — chèn/bớt sample một cách êm tai để
            // giữ đồng bộ, không tạo ra chuỗi log "Non-monotonic DTS" nữa.
            // Cú pháp filter theo TỪNG stream output là "-filter:a:<index>"
            // ("-af" không có index chỉ áp dụng chung, không dùng được ở đây).
            `-filter:a:${i}`, "aresample=async=1:first_pts=0",
        )
    })

    args.push(
        "-f", "hls",
        "-hls_time", String(SEGMENT_DURATION),
        "-hls_list_size", String(PLAYLIST_SIZE),
        "-hls_flags", "delete_segments+append_list+independent_segments",
        "-hls_segment_type", "mpegts",
        "-master_pl_name", "master.m3u8",
        "-var_stream_map", RENDITIONS.map((r, i) => `v:${i},a:${i},name:${r.name}`).join(" "),
        "-hls_segment_filename", path.join(hlsDir, "%v", "seg%d.ts"),
        path.join(hlsDir, "%v", "stream.m3u8"),
    )

    RENDITIONS.forEach(r => ensureDir(path.join(hlsDir, r.name)))

    const ffmpeg = spawn("ffmpeg", args, { stdio: ["pipe", "pipe", "pipe"] })

    console.log(`[HLS] Spawn ffmpeg cho ${key} → ${hlsDir}`)
    // console.log(`[HLS] FFmpeg args:`, args.join(" "))


    // BẮT BUỘC: nếu không có listener "error" trên stdin, mọi lỗi ghi vào pipe
    // đã đóng (EOF/EPIPE — xảy ra khi FFmpeg thoát bất ngờ) sẽ ném exception
    // KHÔNG AI BẮT và làm SẬP TOÀN BỘ tiến trình Node.js (ảnh hưởng mọi camera
    // khác đang chạy, không chỉ riêng session này).
    ffmpeg.stdin?.on("error", (err) => {
        console.error(`[HLS] Lỗi ghi vào ffmpeg.stdin cho ${key} (bỏ qua, không crash server):`, (err as Error).message)
    })

    ffmpeg.stderr?.on("data", (_d: Buffer) => {
        // console.log(`[FFmpeg:${key}]`, _d.toString().slice(0, 300))
    })

    ffmpeg.on("error", (err) => {
        console.error(`[HLS] FFmpeg không khởi động được cho ${key}:`, err)
        sessions.delete(key)
    })

    ffmpeg.on("exit", (code, signal) => {
        console.log(`[HLS] FFmpeg ${key} exited — code=${code} signal=${signal}`)
        const current = sessions.get(key);

        if (current?.ffmpeg === ffmpeg) {
            sessions.delete(key);
        }
    })

    return ffmpeg
}

export function initHls(io: SocketIOServer, expressApp: any) {
    killOrphanedFfmpeg()
    // resetStorage()
    ensureDir(HLS_DIR)
    ensureDir(CLIPS_DIR)

    expressApp.use("/api/hls", (req: any, res: any, next: any) => {
        res.set("Access-Control-Allow-Origin", "*")
        if (req.path.endsWith(".m3u8")) {
            res.set("Cache-Control", "no-cache, no-store")
        }
        next()
    })
    expressApp.use("/api/hls", express.static(HLS_DIR))

    expressApp.use("/api/clips", (req: any, res: any, next: any) => {
        res.set("Access-Control-Allow-Origin", "*")
        next()
    })
    expressApp.use("/api/clips", express.static(CLIPS_DIR))

    // Namespace Socket.IO riêng nhận video+audio chunk từ camera.
    // LƯU Ý: đây chỉ là TÊN NAMESPACE, không phải HTTP path của engine.io.
    // HTTP path (mặc định "/socket.io/", ở đây đổi thành "/api/socket.io")
    // được cấu hình MỘT LẦN DUY NHẤT khi tạo `new Server(httpServer, { path })`
    // ở server.ts — áp dụng chung cho MỌI namespace, không set riêng ở đây được.
    const cameraNsp = io.of("/api/camera")

    cameraNsp.on("connection", (socket) => {
        const courtId = (socket.handshake.query.courtId as string) || "1"
        const cameraId = (socket.handshake.query.cameraId as string) || "main"
        const mime = socket.handshake.query.mime as string | undefined
        const inputFormat = mimeToFfmpegFormat(mime)
        const key = sessionKey(courtId, cameraId)

        console.log(`[HLS] Camera kết nối: ${key} (socket ${socket.id}, mime=${mime ?? "?"}, format=${inputFormat ?? "auto"})`)

        const stale = sessions.get(key)
        if (stale) {
            try { stale.ffmpeg.kill("SIGKILL") } catch { }
            if (stale.socket.id !== socket.id) stale.socket.disconnect(true)
            sessions.delete(key)
        }

        // Tạo 1 PHIÊN FFmpeg mới — dùng chung logic này cho cả lần connect
        // ĐẦU TIÊN lẫn khi cần "restart" (camera đổi nguồn MediaRecorder do
        // đổi zoom): mỗi lần MediaRecorder mới được tạo ở client sẽ phát ra
        // header container mới ngay từ chunk đầu, KHÔNG thể ghi tiếp vào
        // pipe FFmpeg cũ (đang demux dở dang) — phải kill FFmpeg cũ và mở
        // phiên (thư mục startedAt) mới hoàn toàn sạch cho container mới.
        function spawnFreshSession(): CameraSession {
            const startedAt = Date.now()
            const hlsDir = path.join(HLS_DIR, courtId, cameraId, String(startedAt))
            const ffmpeg = spawnFFmpeg(hlsDir, key, inputFormat)
            const session: CameraSession = {
                cameraId, courtId, ffmpeg, socket, hlsDir,
                startedAt,
                paused: false,
                zoom: sessions.get(key)?.zoom ?? 1,
            }
            sessions.set(key, session)
            return session
        }

        let session = spawnFreshSession()

        // Khi client đổi nguồn MediaRecorder (canvas ⇄ raw, do đổi zoom) —
        // xem giải thích ở spawnFreshSession(). VIR sẽ tự nhận ra phiên mới
        // qua poll /api/hls/cameras (startedAt đổi) và hls.js tự remount.
        socket.on("restart", () => {
            console.log(`[HLS] ${key} restart FFmpeg (đổi nguồn MediaRecorder)`)
            try { session.ffmpeg.stdin?.end() } catch { }
            try { session.ffmpeg.kill("SIGKILL") } catch { }
            session = spawnFreshSession()
        })

        // Chunk nhị phân = dữ liệu video/audio → ghi vào FFmpeg
        // (bỏ qua nếu đang paused: camera đã tự ngừng gửi, nhưng phòng khi
        // vẫn còn vài chunk đang bay tới thì server cũng chủ động drop)
        socket.on("chunk", (data: ArrayBuffer | Buffer) => {
            if (session.paused) return
            const ffmpeg = session.ffmpeg
            if (ffmpeg.stdin && !ffmpeg.stdin.destroyed) {
                const buf = Buffer.isBuffer(data) ? data : Buffer.from(data)
                try {
                    ffmpeg.stdin.write(buf)
                } catch (err) {
                    console.error(`[HLS] ${key} lỗi ghi chunk (ffmpeg có thể đã thoát):`, (err as Error).message)
                    return
                }
                session.chunkCount = (session.chunkCount ?? 0) + 1
                if (session.chunkCount === 1 || session.chunkCount % 20 === 0) {
                    console.log(`[HLS] ${key} đã nhận ${session.chunkCount} chunk (mới nhất: ${buf.length} bytes)`)
                }
            }
        })

        socket.on("disconnect", (reason) => {
            console.log(`[HLS] Camera ngắt kết nối: ${key} (${reason})`)
            if (session.ffmpeg.stdin && !session.ffmpeg.stdin.destroyed) session.ffmpeg.stdin.end()
            const current = sessions.get(key);

            if (current?.socket.id === socket.id) {
                sessions.delete(key);
            }
        })

        socket.on("error", (err) => {
            console.error(`[HLS] Socket error ${key}:`, err)
        })
    })

    expressApp.get("/api/hls/cameras", (req: any, res: any) => {
        const courtId = req.query.courtId as string | undefined
        const list = Array.from(sessions.values())
            .filter(s => !courtId || s.courtId === courtId)
            .filter(s => fs.existsSync(path.join(s.hlsDir, "master.m3u8")))
            .map(s => {
                const stats = readPlaylistStats(s.hlsDir)
                return {
                    courtId: s.courtId,
                    cameraId: s.cameraId,
                    paused: s.paused,
                    zoom: s.zoom,
                    startedAt: s.startedAt,
                    masterPlaylistUrl: `/api/hls/${s.courtId}/${s.cameraId}/${s.startedAt}/master.m3u8`,
                    totalDurationSec: stats?.totalDurationSec ?? 0,   // MỚI
                    lastSegmentAt: stats?.lastSegmentAt ?? null,       // MỚI
                }
            })
        res.json(list)
    })

    expressApp.post("/api/hls/control", (req: any, res: any) => {
        const { courtId, cameraId, action } = req.body
        const key = sessionKey(courtId, cameraId)
        const session = sessions.get(key)

        if (!session) {
            return res.status(404).json({ error: "Camera không tìm thấy" })
        }

        switch (action) {
            case "pause":
                session.paused = true
                session.socket.emit("control", { cmd: "pause" })
                break

            case "resume":
                session.paused = false
                session.socket.emit("control", { cmd: "resume" })
                break

            case "stop":
                session.socket.emit("control", { cmd: "stop" })
                session.socket.disconnect(true)
                if (session.ffmpeg.stdin && !session.ffmpeg.stdin.destroyed) {
                    session.ffmpeg.stdin.end()
                }
                sessions.delete(key)
                break

            case "zoom": {
                const { zoom } = req.body
                session.zoom = zoom
                session.socket.emit("control", { cmd: "zoom", zoom })
                break
            }

            default:
                return res.status(400).json({ error: `Action không hỗ trợ: ${action}` })
        }

        res.json({ ok: true, paused: session.paused, zoom: session.zoom })
    })

    expressApp.post("/api/hls/clip", (req: any, res: any) => {
        const { courtId, cameraId, startedAt, startSec, durationSec, rendition } = req.body
        const key = sessionKey(courtId, cameraId)
        const quality = rendition || "source"

        const resolvedStartedAt = startedAt ?? sessions.get(key)?.startedAt

        if (!resolvedStartedAt) {
            return res.status(404).json({ error: "Không xác định được phiên quay của camera này" })
        }

        const playlist = path.join(HLS_DIR, courtId, cameraId, String(resolvedStartedAt), quality, "stream.m3u8")
        if (!fs.existsSync(playlist)) {
            return res.status(404).json({ error: "Không tìm thấy dữ liệu video cho camera này" })
        }

        const outName = `clip-${courtId}-${cameraId}-${Date.now()}.mp4`
        const outPath = path.join(CLIPS_DIR, outName)

        const args = ["-y"]
        if (typeof startSec === "number" && startSec >= 0) args.push("-ss", String(startSec))
        args.push("-i", playlist)
        if (typeof durationSec === "number" && durationSec > 0) args.push("-t", String(durationSec))
        args.push("-c", "copy", "-movflags", "+faststart", outPath)

        const proc = spawn("ffmpeg", args)
        let stderr = ""
        proc.stderr?.on("data", (d) => { stderr += d.toString() })

        proc.on("exit", (code) => {
            if (code !== 0) {
                console.error(`[HLS] Xuất clip lỗi (${key}):`, stderr.slice(-500))
                return res.status(500).json({ error: "Xuất video thất bại" })
            }
            res.json({ ok: true, url: `/api/clips/${outName}` })
        })
    })

    expressApp.post("/api/hls/clip", async (req: any, res: any) => {
        const { courtId, cameraId, startedAt, startSec, durationSec, rendition, burnOverlay } = req.body
        const key = sessionKey(courtId, cameraId)
        const quality = rendition || "source"

        const resolvedStartedAt = startedAt ?? sessions.get(key)?.startedAt
        if (!resolvedStartedAt) {
            return res.status(404).json({ error: "Không xác định được phiên quay của camera này" })
        }

        const playlist = path.join(HLS_DIR, courtId, cameraId, String(resolvedStartedAt), quality, "stream.m3u8")
        if (!fs.existsSync(playlist)) {
            return res.status(404).json({ error: "Không tìm thấy dữ liệu video cho camera này" })
        }

        const outName = `clip-${courtId}-${cameraId}-${Date.now()}.mp4`
        const rawClipPath = path.join(CLIPS_DIR, outName)

        // ── Bước 1: cắt clip gốc bằng -c copy (giữ nguyên logic cũ) ──
        await new Promise<void>((resolve, reject) => {
            const args = ["-y"]
            if (typeof startSec === "number" && startSec >= 0) args.push("-ss", String(startSec))
            args.push("-i", playlist)
            if (typeof durationSec === "number" && durationSec > 0) args.push("-t", String(durationSec))
            args.push("-c", "copy", "-movflags", "+faststart", rawClipPath)

            const proc = spawn("ffmpeg", args)
            let stderr = ""
            proc.stderr?.on("data", (d) => { stderr += d.toString() })
            proc.on("exit", (code) => {
                if (code !== 0) {
                    console.error(`[HLS] Xuất clip lỗi (${key}):`, stderr.slice(-500))
                    return reject(new Error("Xuất video thất bại"))
                }
                resolve()
            })
        }).catch(() => null)

        if (!fs.existsSync(rawClipPath)) {
            return res.status(500).json({ error: "Xuất video thất bại" })
        }

        if (!burnOverlay) {
            return res.json({ ok: true, url: `/api/clips/${outName}` })
        }

        // ── Bước 2: burn-in overlay ──
        try {
            const startWallClockMs = resolvedStartedAt + (startSec ?? 0) * 1000
            const endWallClockMs = startWallClockMs + (durationSec ?? 0) * 1000

            const scoreEvents = getScoreEventsInRange(courtId, 1, startWallClockMs, endWallClockMs)
            const timerEvents = getTimerEventsInRange(courtId, startWallClockMs, endWallClockMs)

            const overlayPath = path.join(CLIPS_DIR, `overlay-${Date.now()}.webm`)
            await renderOverlayVideo({
                scoreEvents, timerEvents,
                startWallClockMs, durationSec,
                isReplay: false,
                outWidth: 1920, outHeight: 1080,
                outPath: overlayPath,
            })

            const finalName = `final-${outName}`
            const finalPath = path.join(CLIPS_DIR, finalName)

            await new Promise<void>((resolve, reject) => {
                const ff = spawn("ffmpeg", [
                    "-y",
                    "-i", rawClipPath,
                    "-i", overlayPath,
                    "-filter_complex", "[0:v][1:v]overlay=0:0:format=auto",
                    "-c:a", "copy",
                    finalPath,
                ])
                let stderr = ""
                ff.stderr?.on("data", (d) => { stderr += d.toString() })
                ff.on("exit", (code) => code === 0 ? resolve() : reject(new Error(stderr.slice(-500))))
            })

            // dọn file trung gian
            fs.rmSync(rawClipPath, { force: true })
            fs.rmSync(overlayPath, { force: true })

            res.json({ ok: true, url: `/api/clips/${finalName}` })
        } catch (err) {
            console.error(`[HLS] Burn overlay lỗi (${key}):`, err)
            // fallback: vẫn trả clip KHÔNG overlay, thay vì lỗi trắng tay
            res.json({ ok: true, url: `/api/clips/${outName}`, warning: "Không burn được overlay, trả clip gốc" })
        }
    })

    console.log("[HLS] Service khởi động — Socket.IO namespace: /api/camera, Segments: /api/hls/, Clips: /api/clips/")
}