"use client"

import Hls, { Level } from "hls.js"
import { useEffect, useRef, useState, useCallback, useMemo } from "react"
import { useSearchParams } from "next/navigation"
import { ScoreEvent } from "@/scripts/match-types"
import { getSingletonSocket } from "@/scripts/global-client-io"
import { getTimeString } from "@/components/MobileOperator"
import usePageVisibility from "@/components/UsePageVisibility"
import useVideoContentRect from "@/components/UseVideoContentRect"
import { motion, AnimatePresence } from "framer-motion"

// ============================================================
// VIEWER — HLS-ONLY, kiểu YouTube Live
//
// Đã BỎ HẲN LiveKit. Chỉ còn 1 pipeline HLS phục vụ cả xem trực tiếp lẫn
// tua lại: hls.js tự bám vào live edge (giống YouTube Live mặc định phát
// ở mép mới nhất), người xem kéo seek bar lùi lại để "tua lại" trong cửa
// sổ DVR, kéo về mép phải (hoặc bấm nút TRỰC TIẾP) để quay lại xem trực
// tiếp. Không còn khái niệm "2 lớp video" (live/replay) tách biệt như
// trước — chỉ 1 <video> duy nhất, logic đơn giản hơn nhiều và không còn
// hiện tượng giật do 2 encoder tranh CPU ở phía camera.
// ============================================================

type RecordingInfo = {
    cameraId: string
    paused: boolean
    zoom: number
    startedAt: number
    masterPlaylistUrl: string
    totalDurationSec: number   // MỚI — từ server, không qua hls.js
    lastSegmentAt: number | null   // MỚI
}

type Status = "connecting" | "connected" | "error" | "no-publisher"

const SPEED_OPTIONS = [0.25, 0.5, 1, 1.5, 2] as const
const LIVE_EDGE_THRESHOLD_SEC = 4
const CONTROLS_HIDE_DELAY_MS = 3500
const ZOOM_STEP = 0.5
const ZOOM_MAX = 5
const POLL_INTERVAL_MS = 3000

const BACKEND_PROTOCOL = process.env.NEXT_PUBLIC_SERVER_PROTOCOL || "https"
const BACKEND_PORT = process.env.NEXT_PUBLIC_SERVER_PORT

function serverBase() {
    const host = window.location.hostname
    const port = BACKEND_PORT ? `:${BACKEND_PORT}` : ""
    return `${BACKEND_PROTOCOL}://${host}${port}`
}

function fmtClock(sec: number): string {
    if (!isFinite(sec) || sec < 0) sec = 0
    const h = Math.floor(sec / 3600)
    const m = Math.floor((sec % 3600) / 60)
    const s = Math.floor(sec % 60)
    if (h > 0) {
        return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`
    }
    return `${m}:${s.toString().padStart(2, "0")}`
}

// ── Camera tab selector ──────────────────────────────────────
function CameraTabs(props: { cameraIds: string[]; active: string; onSelect: (id: string) => void }) {
    if (props.cameraIds.length <= 1) return null
    return (
        <div className="flex items-center gap-[6px] px-[12px] py-[8px] bg-black/60 backdrop-blur-sm overflow-x-auto">
            {props.cameraIds.map(id => (
                <button key={id} onClick={() => props.onSelect(id)}
                    className={`flex items-center gap-[6px] px-[12px] py-[7px] rounded-full
                        text-[12px] font-semibold whitespace-nowrap shrink-0 transition-colors
                        ${props.active === id ? "bg-amber-400 text-black" : "bg-white/10 text-white/60 active:bg-white/20"}`}>
                    <span className="w-[6px] h-[6px] rounded-full bg-red-500" />
                    {id}
                </button>
            ))}
        </div>
    )
}

function QualitySelector(props: { levels: Level[]; current: number; onChange: (level: number) => void }) {
    if (props.levels.length <= 1) return null
    const label = (i: number) => i === -1 ? "Tự động" : `${props.levels[i]?.height ?? "?"}p`
    return (
        <select value={props.current} onChange={e => props.onChange(Number(e.target.value))}
            className="bg-white/10 text-white text-[12px] font-semibold rounded-[8px] px-[8px] py-[6px] outline-none">
            <option value={-1} className="text-black">Tự động</option>
            {props.levels.map((_, i) => <option key={i} value={i} className="text-black">{label(i)}</option>)}
        </select>
    )
}

function fmtWallClock(ms: number): string {
    const d = new Date(ms)
    const hh = d.getHours().toString().padStart(2, "0")
    const mm = d.getMinutes().toString().padStart(2, "0")
    const ss = d.getSeconds().toString().padStart(2, "0")
    return `${hh}:${mm}:${ss}`
}

function SeekBar(props: {
    positionSec: number
    windowStartSec: number
    windowEndSec: number
    displayTotalSec: number
    onScrubMove: (sec: number, isFinal: boolean) => void
    onScrubStart: () => void
    onScrubEnd: () => void
    isLiveEdge?: boolean
    isScrubbing: boolean
    startedAt: number | null   // MỚI — epoch ms lúc camera bắt đầu quay, để suy ra giờ thực
}) {
    const barRef = useRef<HTMLDivElement>(null)
    const [isDragging, setDragging] = useState(false)
    const [previewPct, setPreviewPct] = useState<number | null>(null)

    const total = Math.max(0.001, props.windowEndSec - props.windowStartSec)
    const committedPercent = Math.min(100, Math.max(0, ((props.positionSec - props.windowStartSec) / total) * 100))

    useEffect(() => {
        if (!props.isScrubbing && previewPct !== null) {
            setPreviewPct(null)
        }
    }, [props.isScrubbing])

    const displayPercent = previewPct !== null
        ? previewPct
        : (props.isLiveEdge ? 100 : committedPercent)

    function pctFromClientX(clientX: number): number {
        const rect = barRef.current!.getBoundingClientRect()
        return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)) * 100
    }

    function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
        barRef.current?.setPointerCapture(e.pointerId)
        props.onScrubStart()
        setDragging(true)
        setPreviewPct(pctFromClientX(e.clientX))
    }

    function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
        if (!isDragging) return
        const pct = pctFromClientX(e.clientX)
        setPreviewPct(pct)
        const sec = props.windowStartSec + (pct / 100) * total
        props.onScrubMove(sec, false)
    }

    function handlePointerUp(e: React.PointerEvent<HTMLDivElement>) {
        if (!isDragging) return
        const pct = pctFromClientX(e.clientX)
        const sec = props.windowStartSec + (pct / 100) * total
        props.onScrubMove(sec, true)
        setDragging(false)
        props.onScrubEnd()
    }

    const isLive = props.isLiveEdge ?? false

    // Vị trí (giây, tính từ windowStartSec) đang được HIỂN THỊ — ưu tiên
    // previewPct lúc đang kéo, giống hệt logic hiện có của chuỗi thời gian
    // tương đối bên dưới, để 2 dòng chữ luôn đồng bộ với nhau.
    const displaySec = previewPct !== null
        ? (previewPct / 100) * total
        : (props.positionSec - props.windowStartSec)

    // Giờ thực = mốc bắt đầu quay (startedAt) + vị trí hiện tại trong cửa
    // sổ DVR (windowStartSec + displaySec) — CHÚ Ý cộng thêm windowStartSec
    // vì displaySec chỉ là khoảng lệch so với đầu cửa sổ, không phải mốc 0
    // tuyệt đối của toàn bộ bản ghi (windowStartSec trôi dần khi server xoá
    // segment cũ khỏi playlist).
    const wallClockStr = props.startedAt !== null
        ? fmtWallClock(props.startedAt + (props.windowStartSec + displaySec) * 1000)
        : null

    return (
        <div className="flex flex-col gap-[4px] w-full">
            <div
                ref={barRef}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
                className="relative w-full h-[8px] bg-white/15 rounded-full cursor-pointer overflow-hidden touch-none">
                <div className="absolute top-0 left-0 h-full bg-amber-400 rounded-full transition-[width] duration-75"
                    style={{ width: `${displayPercent}%` }} />
                <div className={`absolute top-1/2 -translate-y-1/2 w-[14px] h-[14px] bg-white rounded-full shadow-md
                    ${isDragging ? "" : "transition-[left] duration-75"}`}
                    style={{ left: `calc(${displayPercent}% - 7px)` }} />
            </div>
            <div className="flex justify-between text-[11px] text-white/40 font-mono">
                <span className="flex items-center gap-[6px]">
                    {fmtClock(displaySec)}
                </span>
                <span className="flex items-center gap-[6px]">
                    {wallClockStr && <span className="text-white/25">({wallClockStr})</span>}
                    <div className="w-[1rem]" />
                    {isLive && <span className="text-red-400 font-bold">● TRỰC TIẾP</span>}
                    <span>{fmtClock(props.displayTotalSec)}</span>
                </span>
            </div>
        </div>
    )
}
function CameraControls(props: {
    zoom: number; paused: boolean
    onZoom: (dir: 1 | -1) => void
    onTogglePause: () => void
    onStopRecording: () => void
}) {
    return (
        <div className="flex items-center gap-[8px]">
            <div className="flex items-center gap-[2px] bg-white/10 rounded-[10px] p-[3px]">
                <button onClick={() => props.onZoom(-1)} className="w-[32px] h-[32px] flex-center rounded-[8px] text-white active:bg-white/20">−</button>
                <span className="w-[38px] text-center text-[11px] text-white/70 font-mono">{props.zoom.toFixed(1)}×</span>
                <button onClick={() => props.onZoom(1)} className="w-[32px] h-[32px] flex-center rounded-[8px] text-white active:bg-white/20">+</button>
            </div>
            <button onClick={props.onTogglePause}
                className={`px-[10px] py-[8px] rounded-[10px] text-[11px] font-bold transition-colors
                    ${props.paused ? "bg-amber-400 text-black" : "bg-white/10 text-white active:bg-white/20"}`}>
                {props.paused ? "Tiếp tục gửi" : "Tạm dừng gửi"}
            </button>
            <button onClick={props.onStopRecording}
                className="px-[10px] py-[8px] rounded-[10px] text-[11px] font-bold bg-red-900/70 text-red-200 active:bg-red-900">
                Dừng quay
            </button>
        </div>
    )
}

function ConnectionBadge(props: { status: Status; count: number }) {
    if (props.status === "connected" && props.count > 0) {
        return <span className="px-[10px] py-[4px] rounded-full text-[11px] font-semibold bg-green-900/70 text-green-300">{props.count} camera đang phát</span>
    }
    const map = {
        connecting: { label: "Đang kết nối...", cls: "bg-amber-900/70 text-amber-300" },
        connected: { label: "Đã kết nối", cls: "bg-green-900/70 text-green-300" },
        error: { label: "Lỗi kết nối", cls: "bg-red-900/70 text-red-300" },
        "no-publisher": { label: "Chưa có camera phát", cls: "bg-white/10 text-white/50" },
    }
    const { label, cls } = map[props.status]
    return <span className={`px-[10px] py-[4px] rounded-full text-[11px] font-semibold ${cls}`}>{label}</span>
}

// ── Main component ────────────────────────────────────────────

export default function Viewer() {
    const params = useSearchParams()
    const courtId = params.get("courtId") || "1"

    const videoRef = useRef<HTMLVideoElement>(null)
    const hlsRef = useRef<Hls | null>(null)
    const controlsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    const [status, setStatus] = useState<Status>("connecting")
    const [recordings, setRecordings] = useState<Map<string, RecordingInfo>>(new Map())
    const [activeCameraId, setActiveCameraId] = useState<string | null>(null)

    const [isPlaying, setPlaying] = useState(true)

    useEffect(() => {
        const video = videoRef.current
        if (!video) return
        const onPlay = () => setPlaying(true)
        const onPause = () => setPlaying(false)
        video.addEventListener("play", onPlay)
        video.addEventListener("pause", onPause)
        return () => {
            video.removeEventListener("play", onPlay)
            video.removeEventListener("pause", onPause)
        }
    }, [])

    const [speed, setSpeedState] = useState<number>(1)
    const [muted, setMuted] = useState(true)
    const [levels, setLevels] = useState<Level[]>([])
    const [currentLevel, setCurrentLevel] = useState(-1)
    const [positionSec, setPositionSec] = useState(0)
    const [windowStartSec, setWindowStartSec] = useState(0)
    const [windowEndSec, setWindowEndSec] = useState(0)
    const [controlsVisible, setControlsVisible] = useState(true)
    const [markIn, setMarkIn] = useState<number | null>(null)
    const [savingClip, setSavingClip] = useState(false)

    const cameraIds = Array.from(recordings.keys())
    const activeRecording = activeCameraId ? recordings.get(activeCameraId) ?? null : null

    const playPromiseRef = useRef<Promise<void> | null>(null)

    // Bọc DUY NHẤT mọi lệnh play()/pause() trong toàn component qua 2 hàm này.
    // Lý do: nếu gọi pause() trong lúc promise của play() trước đó CHƯA settle,
    // trình duyệt reject promise đó với AbortError ("play() request was
    // interrupted by a call to pause()") — không phải lỗi thực sự cần xử lý,
    // nhưng nếu không ai bắt sẽ log ra console dưới dạng unhandled rejection.
    // safePlay/safePause đảm bảo LUÔN đợi play() cũ settle trước khi pause(),
    // và LUÔN catch mọi play() — loại bỏ hoàn toàn lỗi này tận gốc, thay vì
    // phải nhớ thêm .catch() thủ công ở từng nơi gọi.
    const safePlay = useCallback((video: HTMLVideoElement) => {
        const p = video.play()
        playPromiseRef.current = p
        p.catch(() => { }).finally(() => {
            if (playPromiseRef.current === p) playPromiseRef.current = null
        })
        return p
    }, [])

    const safePause = useCallback(async (video: HTMLVideoElement) => {
        if (playPromiseRef.current) {
            await playPromiseRef.current.catch(() => { })   // đợi play() cũ settle trước
        }
        video.pause()
    }, [])

    const [isScrubbing, setScrubbing] = useState(false)
    const wasPlayingRef = useRef(false)

    // Cập nhật vị trí của SeekBar
    const isScrubbingRef = useRef(false)

    const [isFollowingLive, setFollowingLive] = useState(true)
    const isFollowingLiveRef = useRef(true)

    const setLiveMode = useCallback((value: boolean) => {
        isFollowingLiveRef.current = value   // gán NGAY, đồng bộ — dùng trong closure của interval/keydown
        setFollowingLive(value)
    }, [])

    // Đồng bộ ref với state mỗi khi state đổi — nhưng quan trọng hơn, các nơi
    // SET giá trị (handleScrubStart, requestScrubSeek, handleScrubEnd) sẽ gán
    // isScrubbingRef.current TRỰC TIẾP, ĐỒNG BỘ, không đợi React re-render.
    useEffect(() => {
        isScrubbingRef.current = isScrubbing
    }, [isScrubbing])

    useEffect(() => {
        const video = videoRef.current
        if (!video) return
        let raf: number
        function loop() {
            if (!isScrubbingRef.current) {   // đọc từ REF — luôn là giá trị mới nhất, không có độ trễ
                setPositionSec(video!.currentTime)
            }
            raf = requestAnimationFrame(loop)
        }
        raf = requestAnimationFrame(loop)
        return () => cancelAnimationFrame(raf)
    }, [])   // không cần phụ thuộc isScrubbing nữa — loop chạy 1 lần duy nhất, tự đọc ref mỗi frame

    useEffect(() => {
        const video = videoRef.current
        if (!video) return
        const tick = () => {
            if (!video.seekable || video.seekable.length === 0) return
            setWindowStartSec(video.seekable.start(0))
            setWindowEndSec(video.seekable.end(0))
            // KHÔNG còn điều kiện chặn isScrubbingRef nữa — window luôn cập
            // nhật đều mỗi giây, kể cả khi đang kéo. Điều này AN TOÀN vì
            // displayPercent trong SeekBar dùng previewPct (số cố định 0-100
            // theo vị trí ngón tay) khi đang kéo — không phụ thuộc total, nên
            // window thay đổi ngầm bên dưới không gây giật hình. Chỉ khi thả
            // tay và previewPct bị xóa, UI mới rơi về committedPercent — lúc
            // đó windowEndSec đã LUÔN cập nhật liên tục, không có khoảng dồn
            // cục nào để "bắt kịp" đột ngột.
        }
        tick()
        const id = setInterval(tick, 1000)
        return () => clearInterval(id)
    }, [])

    const pendingSeekRef = useRef<number | null>(null)
    const isSeekingRef = useRef(false)
    const isFinalRef = useRef(false)              // ← khai báo TRƯỚC requestScrubSeek
    const settleTimerRef = useRef<ReturnType<typeof setTimeout>>(null)

    const requestScrubSeek = useCallback((sec: number, isFinal = false) => {
        const video = videoRef.current
        if (!video) return
        pendingSeekRef.current = sec
        isFinalRef.current = isFinal   // LUÔN cập nhật, kể cả khi thoát sớm bên dưới —
        // đảm bảo lần gọi MỚI NHẤT luôn thắng, không bị
        // "khóa cứng" vào isFinal của lần gọi đã khởi động chuỗi doSeek

        setPositionSec(sec)

        if (isSeekingRef.current) return

        function doSeek() {
            const target = pendingSeekRef.current
            if (target === null) { isSeekingRef.current = false; return }
            isSeekingRef.current = true
            pendingSeekRef.current = null
            video!.currentTime = target

            const onSeeked = () => {
                video!.removeEventListener("seeked", onSeeked)
                if (pendingSeekRef.current !== null) {
                    doSeek()
                } else {
                    isSeekingRef.current = false
                    clearTimeout(settleTimerRef.current || undefined)
                    if (isFinalRef.current) {   // ← đọc REF thay vì tham số closure cũ
                        settleTimerRef.current = setTimeout(() => {
                            isScrubbingRef.current = false
                            setScrubbing(false)
                            if (wasPlayingRef.current) safePlay(video!)
                        }, 500)
                    }
                }
            }
            video!.addEventListener("seeked", onSeeked)
        }
        doSeek()
    }, [safePlay])

    const handleScrubStart = useCallback(async () => {
        const alreadyScrubbing = isScrubbingRef.current   // đọc TRƯỚC khi set true bên dưới

        isScrubbingRef.current = true
        setScrubbing(true)
        setLiveMode(false)   // MỚI: bất kỳ thao tác tua nào cũng rời khỏi live-mode

        const video = videoRef.current
        if (video) {
            // CHỈ chụp trạng thái play/pause ở lần ĐẦU TIÊN của cả chuỗi tua.
            // Nếu đã đang scrub (vd: bấm mũi tên liên tiếp trước khi seek trước
            // kịp settle), video có thể đã bị pause bởi chính lần gọi trước đó —
            // đọc lại video.paused lúc này sẽ luôn ra `true` và xoá mất ý định
            // ban đầu "video đang phát", khiến video không bao giờ tự chạy lại.
            if (!alreadyScrubbing) {
                wasPlayingRef.current = !video.paused
            }
            await safePause(video)
        }
    }, [safePause, setLiveMode])

    const handleScrubEnd = useCallback(() => {
        // Không seek gì thêm ở đây — pointerup của SeekBar đã gọi
        // onScrubMove(sec, final vị trí) ngay trước khi onScrubEnd() được gọi.
        // Ta chỉ cần đánh dấu lần seek đang treo (nếu có) là "final", để
        // requestScrubSeek tự mở khóa UI sau khi ổn định.
        isFinalRef.current = true

        // Trường hợp không có seek nào đang treo (ví dụ người dùng chạm rồi
        // nhấc tay ngay tại chỗ, không di chuyển) → mở khóa ngay, không cần đợi.
        if (!isSeekingRef.current && pendingSeekRef.current === null) {
            isScrubbingRef.current = false   // gán NGAY trước
            setScrubbing(false)
            if (wasPlayingRef.current && videoRef.current) {
                safePlay(videoRef.current)
            }
        }
    }, [safePlay])

    // ── Poll danh sách camera đang có bản ghi HLS ──
    // Đây giờ là NGUỒN DUY NHẤT cho cả danh sách camera lẫn trạng thái
    // live/replay — không còn tách biệt "liveCameras" (LiveKit) và
    // "recordings" (HLS) như kiến trúc cũ.
    useEffect(() => {
        let cancelled = false
        async function poll() {
            try {
                const res = await fetch(`${serverBase()}/api/hls/cameras?courtId=${courtId}`)
                const data = await res.json()
                const list: RecordingInfo[] = Array.isArray(data) ? data : []
                if (cancelled) return
                setRecordings(new Map(list.map(r => [r.cameraId, r])))
                setStatus(list.length > 0 ? "connected" : "no-publisher")
                setActiveCameraId(prev => (prev && list.some(r => r.cameraId === prev)) ? prev : (list[0]?.cameraId ?? null))
            } catch {
                if (!cancelled) setStatus("error")
            }
        }
        poll()
        const id = setInterval(poll, POLL_INTERVAL_MS)
        return () => { cancelled = true; clearInterval(id) }
    }, [courtId])

    const totalAnchorRef = useRef({ value: 0, at: Date.now() })
    const [displayTotalSec, setDisplayTotalSec] = useState(0)

    useEffect(() => {
        const video = videoRef.current
        if (!video || !activeRecording) return

        setLevels([]); setCurrentLevel(-1)
        const url = `${serverBase()}${activeRecording.masterPlaylistUrl}`

        hlsRef.current?.destroy()

        if (Hls.isSupported()) {
            const hls = new Hls({
                backBufferLength: 90,
                maxBufferLength: 30,
                liveSyncDurationCount: 3,
                liveMaxLatencyDurationCount: 9999,
            })
            hlsRef.current = hls

            hls.loadSource(url)
            hls.attachMedia(video)
            hls.on(Hls.Events.MANIFEST_PARSED, (_e, data) => setLevels(data.levels))
            hls.on(Hls.Events.LEVEL_SWITCHED, (_e, data) => setCurrentLevel(data.level))
            hls.on(Hls.Events.ERROR, (_e, data) => { if (data.fatal) console.error("[VIR] HLS lỗi:", data) })
        } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
            video.src = url
        }
        safePlay(video)

        return () => { hlsRef.current?.destroy(); hlsRef.current = null }
    }, [activeRecording?.masterPlaylistUrl, activeRecording?.startedAt])

    // "Stream còn sống" = lastSegmentAt gần đây (trong vòng vài lần
    // SEGMENT_DURATION) — không cần hls.js báo live=false nữa.
    const STALE_THRESHOLD_MS = 8000   // ~4× SEGMENT_DURATION (2s), đủ dung sai
    function isStreamAlive(recording: RecordingInfo | null): boolean {
        if (!recording || recording.lastSegmentAt === null) return false
        return Date.now() - recording.lastSegmentAt < STALE_THRESHOLD_MS
    }

    useEffect(() => {
        const id = setInterval(() => {
            const anchor = totalAnchorRef.current
            const streamStopped =
                activeRecording?.paused ||
                status === "no-publisher" ||
                !isStreamAlive(activeRecording)

            if (streamStopped || !isFollowingLiveRef.current) {
                setDisplayTotalSec(anchor.value)
                return
            }

            const elapsed = (Date.now() - anchor.at) / 1000
            setDisplayTotalSec(anchor.value + elapsed)
        }, 1000)
        return () => clearInterval(id)
    }, [activeRecording, status])

    // Mỗi khi poll /api/hls/cameras trả về dữ liệu mới (đã có sẵn interval
    // POLL_INTERVAL_MS=3000), cập nhật lại mốc neo NẾU totalDurationSec thật
    // sự đổi — hoàn toàn không phụ thuộc hls.js, nên chạy giống hệt nhau trên
    // mọi trình duyệt kể cả Safari macOS (native HLS).
    useEffect(() => {
        if (!activeRecording) return
        if (activeRecording.totalDurationSec !== totalAnchorRef.current.value) {
            totalAnchorRef.current = {
                value: activeRecording.totalDurationSec,
                at: Date.now(),
            }
        }
    }, [activeRecording?.totalDurationSec])

    const bumpControlsVisible = useCallback(() => {
        setControlsVisible(true)
        if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current)
        controlsTimerRef.current = setTimeout(() => setControlsVisible(false), CONTROLS_HIDE_DELAY_MS)
    }, [])
    useEffect(() => {
        bumpControlsVisible()
        return () => { if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current) }
    }, [bumpControlsVisible])

    const sendControl = useCallback(async (action: string, extra: Record<string, unknown> = {}) => {
        if (!activeCameraId) return false
        try {
            const res = await fetch(`${serverBase()}/api/hls/control`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ courtId, cameraId: activeCameraId, action, ...extra }),
            })
            return res.ok
        } catch { return false }
    }, [activeCameraId, courtId])

    const jumpLive = useCallback(() => {
        const video = videoRef.current
        if (!video || !video.seekable || video.seekable.length === 0) return
        wasPlayingRef.current = true
        setLiveMode(true)   // MỚI: chỉ nơi này bật lại — đúng yêu cầu "phải bấm nút mới về live"
        requestScrubSeek(video.seekable.end(0), true)
        setSpeedState(1)
        video.playbackRate = 1
    }, [requestScrubSeek, setLiveMode, isFollowingLive])

    const togglePlay = useCallback(() => {
        const video = videoRef.current
        if (!video) return
        if (video.paused) {
            safePlay(video)
        }
        else {
            safePause(video)
        }
    }, [safePlay, safePause])

    const setSpeed = useCallback((s: number) => {
        setSpeedState(s)
        if (videoRef.current) videoRef.current.playbackRate = s
    }, [])

    const toggleMute = useCallback(() => {
        const video = videoRef.current
        if (!video) return
        video.muted = !video.muted
        setMuted(video.muted)
    }, [])

    const changeLevel = useCallback((level: number) => {
        if (hlsRef.current) hlsRef.current.currentLevel = level
        setCurrentLevel(level)
    }, [])

    const changeZoom = useCallback(async (dir: 1 | -1) => {
        if (!activeCameraId || !activeRecording) return
        const prevZoom = activeRecording.zoom
        const next = Math.min(ZOOM_MAX, Math.max(1, prevZoom + dir * ZOOM_STEP))
        setRecordings(prev => { const n = new Map(prev); const r = n.get(activeCameraId); if (r) n.set(activeCameraId, { ...r, zoom: next }); return n })
        const ok = await sendControl("zoom", { zoom: next })
        if (!ok) setRecordings(prev => { const n = new Map(prev); const r = n.get(activeCameraId); if (r) n.set(activeCameraId, { ...r, zoom: prevZoom }); return n })
    }, [activeCameraId, activeRecording, sendControl])

    const togglePauseUpload = useCallback(async () => {
        if (!activeCameraId || !activeRecording) return
        const prevPaused = activeRecording.paused
        setRecordings(prev => { const n = new Map(prev); const r = n.get(activeCameraId); if (r) n.set(activeCameraId, { ...r, paused: !r.paused }); return n })
        const ok = await sendControl(prevPaused ? "resume" : "pause")
        if (!ok) setRecordings(prev => { const n = new Map(prev); const r = n.get(activeCameraId); if (r) n.set(activeCameraId, { ...r, paused: prevPaused }); return n })
    }, [activeCameraId, activeRecording, sendControl])

    const stopRecording = useCallback(() => {
        if (!activeCameraId) return
        if (!confirm(`Dừng camera "${activeCameraId}"? Camera sẽ ngắt kết nối hoàn toàn.`)) return
        sendControl("stop")
    }, [activeCameraId, sendControl])

    const markStart = useCallback(() => setMarkIn(positionSec), [positionSec])

    // const saveClip = useCallback(async () => {
    //     if (!activeCameraId || !activeRecording || markIn === null) return
    //     const start = Math.min(markIn, positionSec)
    //     const duration = Math.max(0.5, Math.abs(positionSec - markIn))
    //     setSavingClip(true)
    //     try {
    //         const res = await fetch(`${serverBase()}/api/hls/clip`, {
    //             method: "POST",
    //             headers: { "Content-Type": "application/json" },
    //             body: JSON.stringify({
    //                 courtId, cameraId: activeCameraId, startedAt: activeRecording.startedAt,
    //                 startSec: start - windowStartSec, durationSec: duration,
    //                 rendition: "source",
    //             }),
    //         })
    //         const data = await res.json()
    //         if (data.url) {
    //             const a = document.createElement("a")
    //             a.href = `${serverBase()}${data.url}`
    //             a.download = ""
    //             document.body.appendChild(a); a.click(); a.remove()
    //         } else {
    //             alert(data.error || "Không thể xuất video")
    //         }
    //     } finally {
    //         setSavingClip(false)
    //         setMarkIn(null)
    //     }
    // }, [activeCameraId, activeRecording, markIn, positionSec, windowStartSec, courtId])

    const saveClip = useCallback(async () => {
        if (!activeCameraId || !activeRecording || markIn === null) return
        const start = Math.min(markIn, positionSec)
        const duration = Math.max(0.5, Math.abs(positionSec - markIn))
        setSavingClip(true)
        try {
            const res = await fetch(`${serverBase()}/api/hls/clip`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    courtId, cameraId: activeCameraId, startedAt: activeRecording.startedAt,
                    startSec: start - windowStartSec, durationSec: duration,
                    rendition: "source",
                    burnOverlay: true,   // ← THÊM DÒNG NÀY để bật burn-in
                }),
            })
            const data = await res.json()
            if (data.url) {
                const a = document.createElement("a")
                a.href = `${serverBase()}${data.url}`
                a.download = ""
                document.body.appendChild(a); a.click(); a.remove()
                if (data.warning) console.warn("[Clip]", data.warning)   // fallback không burn được
            } else {
                alert(data.error || "Không thể xuất video")
            }
        } finally {
            setSavingClip(false)
            setMarkIn(null)
        }
    }, [activeCameraId, activeRecording, markIn, positionSec, windowStartSec, courtId])

    const switchCamera = useCallback((id: string) => {
        setActiveCameraId(id)
        setMarkIn(null)
        setLiveMode(true)
    }, [])

    // const behindLive = windowEndSec - positionSec
    // const isAtLiveEdge = behindLive < LIVE_EDGE_THRESHOLD_SEC

    // const isAtLiveEdgeRef = useRef(isAtLiveEdge)
    // useEffect(() => {
    //     isAtLiveEdgeRef.current = isAtLiveEdge
    // }, [isAtLiveEdge])

    useEffect(() => {
        function isTypingTarget(el: EventTarget | null) {
            if (!(el instanceof HTMLElement)) return false
            return el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable
        }

        function handleKeyDown(e: KeyboardEvent) {
            if (isTypingTarget(e.target)) return
            const video = videoRef.current
            if (!video) return

            if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
                e.preventDefault()
                const dir = e.key === "ArrowLeft" ? -1 : 1
                handleScrubStart()   // đặt isScrubbingRef=true + pause TRƯỚC khi seek — y hệt luồng kéo tay,
                // chặn vòng lặp rAF ghi đè positionSec trong lúc đang seek
                requestScrubSeek(video.currentTime + dir * 0.5, true)
                if (controlsVisible) bumpControlsVisible()
            } else if (e.key === "0" || e.code === "Numpad0") {
                // e.code === "Numpad0" bắt đúng phím 0 ở numpad kể cả khi
                // NumLock tắt trên một số hệ điều hành (lúc đó e.key có thể
                // trả về "Insert" thay vì "0") — dùng e.code đảm bảo ổn định.
                e.preventDefault()
                jumpLive()
            } else if (e.code === "Space") {
                e.preventDefault()
                togglePlay()
            }
        }

        window.addEventListener("keydown", handleKeyDown)
        return () => window.removeEventListener("keydown", handleKeyDown)
    }, [requestScrubSeek, jumpLive, setLiveMode, controlsVisible, bumpControlsVisible, handleScrubStart])

    const wallClockTimeMs = activeRecording
        ? activeRecording.startedAt + positionSec * 1000
        : null

    const currentScore = useScoreOverlay(courtId, wallClockTimeMs)
    const { remainingMs: timerRemainingMs, hasStarted, isRunning } = useTimerOverlay(courtId, wallClockTimeMs)

    const isPageActive = usePageVisibility()
    useEffect(() => {
        if (!isPageActive && !isFollowingLive) jumpLive()
    }, [isPageActive, isFollowingLive])

    const containerRef = useRef<HTMLDivElement>(null)   // MỚI
    const videoRect = useVideoContentRect(containerRef, videoRef)   // MỚI

    return (
        <div ref={containerRef} className="fixed inset-0 bg-black flex flex-col overflow-hidden select-none"
            onPointerMove={bumpControlsVisible} onPointerDown={bumpControlsVisible}>

            <video ref={videoRef} muted={muted} playsInline autoPlay
                className="absolute inset-0 w-full h-full object-contain bg-black z-[1]" />

            <ScoreOverlay
                score={currentScore}
                timerRemainingMs={timerRemainingMs}
                isReplay={!isFollowingLive}
                hasStarted={hasStarted}
                videoRect={videoRect}   // MỚI
                isRunning={isRunning}   // MỚI
            />

            <div className={`absolute top-0 left-0 right-0 z-10 flex flex-col transition-opacity duration-300
                ${controlsVisible ? "opacity-100" : "opacity-0 pointer-events-none"}`}>
                <div className="flex items-center justify-between px-[16px] py-[12px] bg-gradient-to-b from-black/70 to-transparent">
                    <div className="flex items-center gap-[8px]">
                        <ConnectionBadge status={status} count={cameraIds.length} />
                        {!isFollowingLive && (
                            <span className="px-[10px] py-[4px] rounded-full text-[11px] font-bold bg-amber-500/90 text-black">
                                ⏸ ĐANG XEM LẠI
                            </span>
                        )}
                    </div>
                    <button onClick={toggleMute} className="px-[10px] py-[4px] rounded-full text-[11px] font-bold bg-black/40 text-white">
                        {muted ? "🔇 Bật tiếng" : "🔊 Đang bật tiếng"}
                    </button>
                </div>
                <CameraTabs cameraIds={cameraIds} active={activeCameraId ?? ""} onSelect={switchCamera} />
            </div>

            {status === "no-publisher" && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-[12px] text-white/40">
                    <span className="text-[40px]">📹</span>
                    <p className="text-[14px] text-center px-[24px]">Đang chờ camera phát luồng vào sân {courtId}...</p>
                    <p className="text-[11px] text-white/25">Mở /camera2?courtId={courtId}&cameraId=front trên thiết bị camera</p>
                </div>
            )}

            {/* ── Thanh điều khiển kiểu YouTube Live: seek bar + play/speed + camera controls ── */}
            {activeCameraId && activeRecording && (
                <div className={`absolute bottom-0 left-0 right-0 z-[20] flex flex-col gap-[10px]
                    px-[16px] pt-[28px] pb-[14px]
                    bg-gradient-to-t from-black/85 via-black/50 to-transparent
                    transition-all duration-300
                    ${controlsVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-[12px] pointer-events-none"}`}>

                    <SeekBar
                        positionSec={positionSec}
                        windowStartSec={windowStartSec}
                        windowEndSec={windowEndSec}
                        displayTotalSec={displayTotalSec}
                        onScrubStart={handleScrubStart}
                        onScrubEnd={handleScrubEnd}
                        isLiveEdge={isFollowingLive}
                        onScrubMove={requestScrubSeek}
                        isScrubbing={isScrubbing}
                        startedAt={activeRecording?.startedAt ?? null}   // MỚI
                    />

                    <div className="flex items-center justify-between gap-[10px]">
                        <div className="flex items-center gap-[6px]">
                            <button onClick={togglePlay} className="w-[40px] h-[40px] flex-center rounded-full bg-white text-black active:scale-95 transition-transform">
                                {isPlaying ? "❚❚" : "▶"}
                            </button>
                            <div className="hidden sm:flex items-center gap-[2px] bg-white/10 rounded-[10px] p-[3px]">
                                {SPEED_OPTIONS.map(s => (
                                    <button key={s} onClick={() => setSpeed(s)}
                                        className={`px-[8px] py-[5px] rounded-[8px] text-[11px] font-bold
                                            ${speed === s ? "bg-amber-400 text-black" : "text-white/50 active:bg-white/10"}`}>
                                        {s}×
                                    </button>
                                ))}
                            </div>
                            <QualitySelector levels={levels} current={currentLevel} onChange={changeLevel} />
                        </div>

                        {!isFollowingLive && (
                            <button onClick={jumpLive}
                                className="px-[14px] py-[8px] rounded-[10px] text-[12px] font-bold bg-red-600/80 text-white active:bg-red-600 flex items-center gap-[6px] shrink-0">
                                <span className="w-[6px] h-[6px] rounded-full bg-white animate-pulse" />
                                TRỰC TIẾP
                            </button>
                        )}
                    </div>

                    <div className="flex items-center justify-between gap-[10px] flex-wrap">
                        <CameraControls
                            zoom={activeRecording.zoom}
                            paused={activeRecording.paused}
                            onZoom={changeZoom}
                            onTogglePause={togglePauseUpload}
                            onStopRecording={stopRecording}
                        />

                        <div className="flex items-center gap-[6px]">
                            {markIn === null ? (
                                <button onClick={markStart} className="px-[10px] py-[8px] rounded-[10px] text-[11px] font-bold bg-white/10 text-white active:bg-white/20">
                                    Đánh dấu điểm bắt đầu
                                </button>
                            ) : (
                                <>
                                    <span className="text-[11px] text-white/50 font-mono">Từ {fmtClock(markIn - windowStartSec)}</span>
                                    <button onClick={saveClip} disabled={savingClip}
                                        className="px-[10px] py-[8px] rounded-[10px] text-[11px] font-bold bg-amber-400 text-black active:scale-95 disabled:opacity-50">
                                        {savingClip ? "Đang lưu..." : "💾 Lưu video"}
                                    </button>
                                    <button onClick={() => setMarkIn(null)} className="px-[8px] py-[8px] rounded-[10px] text-[11px] text-white/50">Huỷ</button>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

type ScoreHistoryEntry = {
    timestamp: number
    event: ScoreEvent | null
}

function useScoreOverlay(courtId: string, wallClockTimeMs: number | null) {
    const [entries, setEntries] = useState<ScoreHistoryEntry[]>()

    useEffect(() => {
        const socket = getSingletonSocket()

        socket.emit("court:join", { courtId })

        socket.emit("score:events:get", { courtId }, (entries: ScoreHistoryEntry[]) => {
            setEntries(entries)
        })

        const onAdd = (entry: ScoreHistoryEntry) => {
            setEntries(prev => [...(prev ? prev : []), entry])
        }

        socket.on("score:event:add", onAdd)
        return () => { socket.off("score:event:add", onAdd) }
    }, [courtId])

    // Tìm entry MỚI NHẤT ≤ wallClockTimeMs — nếu event là null nghĩa là
    // tại thời điểm này điểm đã bị RESET, trả về null để ScoreOverlay tự
    // hiển thị 0-0 mặc định (giống cách hasStarted xử lý bên timer).
    return useMemo(() => {
        if (wallClockTimeMs === null || !entries || entries.length === 0) return null

        let lo = 0, hi = entries.length - 1, idx = -1
        while (lo <= hi) {
            const mid = (lo + hi) >> 1
            if (entries[mid].timestamp <= wallClockTimeMs) { idx = mid; lo = mid + 1 }
            else hi = mid - 1
        }
        if (idx === -1) return null

        return entries[idx].event   // có thể là null — ScoreOverlay đã xử lý sẵn
    }, [entries, wallClockTimeMs])
}

// ── Design tokens dùng chung (để sau này tái sử dụng khi burn-in vào video) ──
const SCORE_COLORS = {
    bgPanel: "#0a1230",       // nền phẳng, không gradient
    bgClock: "#0d1a3f",
    accent: "#22d3ee",        // cyan cho viền/label
    red: "#e11d2e",
    blue: "#1d6fe1",
    textDim: "rgba(255,255,255,0.45)",
} as const

function AthleteRow(props: {
    score: number
    gamjeom: number
    flatColor: string
    isLeading: boolean
    rowHeight: number
    scoreBoxWidth: number
    scoreFontSize: number
    athleteName: string
}) {
    return (
        <div className="flex items-stretch" style={{ height: props.rowHeight }}>
            <div className="flex items-center justify-center shrink-0" style={{ width: props.rowHeight * 0.85, padding: `0 ${props.rowHeight * 0.15}px` }}>
                <div className="rounded-[2px] bg-white/10 border border-white/15"
                    style={{ width: props.rowHeight * 0.55, height: props.rowHeight * 0.4 }} />
            </div>
            <div className="flex-1 min-w-0 flex items-center">
                <span className="text-white font-bold uppercase tracking-wide truncate opacity-40" style={{ fontSize: props.rowHeight * 0.34 }}>{props.athleteName}</span>
            </div>
            <div className="flex items-center justify-center shrink-0" style={{ width: props.scoreBoxWidth, backgroundColor: props.flatColor }}>
                <span className="font-black tabular-nums" style={{ fontSize: props.scoreFontSize, color: props.isLeading ? "#FFD700" : "white" }}>
                    {props.score}
                </span>
            </div>

            {/* Gamjeom — NGAY SAU ô điểm chính, ô riêng biệt để không lẫn với
                điểm kỹ thuật. Chỉ hiện khi > 0, giữ chỗ bằng width cố định để
                hàng RED/BLUE không lệch chiều rộng khác nhau khi 1 bên có
                gamjeom còn bên kia không. */}
            <div className="flex items-center justify-center shrink-0"
                style={{
                    width: props.rowHeight * 0.6,
                    backgroundColor: props.gamjeom > 0
                        ? (props.gamjeom >= 4 ? "rgba(225,29,46,0.9)" : "rgba(255,255,255,0.12)")
                        : "transparent",
                }}>
                {props.gamjeom > 0 && (
                    <span className="text-center font-black tabular-nums leading-none"
                        style={{ fontSize: props.rowHeight * 0.4, color: props.gamjeom >= 4 ? "#fff" : "rgba(255,255,255,0.75)" }}>
                        {props.gamjeom}
                    </span>
                )}
            </div>
        </div>
    )
}

// ── Variants cho animation — cascade theo đúng thứ tự:
// container (toàn khối) → group (clock+panel) → clock trước, panel sau →
// panel → row 1 trước, row 2 sau (stagger lồng nhau qua framer-motion).
const overlayContainerVariants = {
    hidden: {},
    visible: { transition: { staggerChildren: 0.15 } },
}

const groupVariants = {
    hidden: {},
    visible: { transition: { staggerChildren: 0.1 } },
}

// Đồng hồ "mọc" ra từ đầu nhọn bên trái — scaleX từ 0, neo transform-origin
// bên trái để đúng đầu nhọn của clip-path polygon đứng yên, phần thân xoè
// rộng ra bên phải.
const clockVariants = {
    hidden: { opacity: 0, scaleX: 0 },
    visible: {
        opacity: 1, scaleX: 1,
        transition: { duration: 0.3, ease: [0.16, 1, 0.3, 1] as const },
    },
}

const panelVariants = {
    hidden: {},
    visible: { transition: { staggerChildren: 0.09 } },
}

// Mỗi hàng athlete "trượt/mở" từ mép TRONG (sát đồng hồ, bên trái) ra
// ngoài — dùng clip-path wipe thay vì transform đơn thuần để có cảm giác
// "kéo màn hình thể thao ra" giống đồ hoạ broadcast thật, không phải chỉ
// trượt vị trí.
const rowRevealVariants = {
    hidden: { clipPath: "inset(0 100% 0 0)" },
    visible: {
        clipPath: "inset(0 0% 0 0)",
        transition: { duration: 0.38, ease: [0.22, 1, 0.36, 1] as const },
    },
}

const badgeVariants = {
    hidden: { opacity: 0, y: 6 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.25 } },
}

function ScoreOverlay(props: {
    score: ScoreEvent | null
    timerRemainingMs: number | null
    roundNo?: number
    matchNo?: number
    isReplay?: boolean
    hasStarted: boolean
    videoRect: { left: number; top: number; width: number; height: number } | null
    isRunning: boolean
}) {
    const show = props.hasStarted && props.videoRect !== null

    return (
        <AnimatePresence>
            {show && <ScoreOverlayContent {...props} videoRect={props.videoRect!} />}
        </AnimatePresence>
    )
}

function ScoreOverlayContent(props: {
    score: ScoreEvent | null
    timerRemainingMs: number | null
    roundNo?: number
    matchNo?: number
    isReplay?: boolean
    hasStarted: boolean
    videoRect: { left: number; top: number; width: number; height: number } | null
    isRunning: boolean   // MỚI
}) {
    if (!props.hasStarted || !props.videoRect) return null

    const s: Pick<ScoreEvent, "redScore" | "blueScore" | "redGamjeom" | "blueGamjeom" | "leadingSide"> =
        props.score ?? { redScore: 0, blueScore: 0, redGamjeom: 0, blueGamjeom: 0, leadingSide: null }

    const timeStr = typeof props.timerRemainingMs === "number"
        ? getTimeString(props.timerRemainingMs)
        : "0:00"

    const isTimeUp = props.timerRemainingMs !== null && props.timerRemainingMs <= 0
    const isPaused = !props.isRunning && !isTimeUp   // tạm dừng giữa chừng, KHÔNG phải hết giờ

    const { width: vw, height: vh } = props.videoRect

    // ── Bước 1: hệ số scale GỐC theo chiều cao video, có sàn/trần tuyệt
    // đối để overlay không bao giờ bé/to bất thường dù vh cực nhỏ/cực lớn.
    const MIN_SCALE = 40    // ứng với video rất thấp (vd cửa sổ thu nhỏ)
    const MAX_SCALE = 90    // ứng với video rất cao (vd fullscreen 4K)
    const rawScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, vh * 0.09))

    // ── Bước 2: TOÀN BỘ layout của overlay là các TỈ LỆ CỐ ĐỊNH nhân với
    // scale — nghĩa là width luôn tỉ lệ đúng với height của overlay theo
    // đúng 1 "khuôn hình" thiết kế, không tính riêng lẻ từng phần tử theo
    // vh nữa (tránh méo tỉ lệ khi vh thay đổi).
    const clockWidthRatio = 1.7      // clockWidth = scale * 1.7
    const rowHeightRatio = 0.8
    const panelMinWidthRatio = 3.8   // panel (2 hàng VĐV) rộng tối thiểu = scale * 3.8

    // Tổng chiều rộng ước tính của TOÀN BỘ khối overlay (clock + panel),
    // dùng để kiểm tra ràng buộc theo chiều rộng video ở bước 3.
    const estimatedTotalWidth = (clockWidth: number, panelWidth: number) => clockWidth + panelWidth

    // ── Bước 3: RÀNG BUỘC theo chiều rộng video — nếu video có tỷ lệ cực
    // đoan (rất cao & hẹp, như quay dọc điện thoại), overlay tính theo vh
    // thuần có thể RỘNG HƠN cả video → cần scale down toàn bộ theo 1 hệ số
    // chung để tổng chiều rộng overlay không vượt quá 1 phần video.
    const MAX_OVERLAY_WIDTH_RATIO = 0.55   // overlay rộng tối đa 55% chiều rộng video
    const maxAllowedTotalWidth = vw * MAX_OVERLAY_WIDTH_RATIO

    const rawClockWidth = rawScale * clockWidthRatio
    const rawPanelWidth = rawScale * panelMinWidthRatio
    const rawTotalWidth = estimatedTotalWidth(rawClockWidth, rawPanelWidth)

    // Nếu vượt ngưỡng, tính lại 1 scale NHỎ HƠN sao cho tổng chiều rộng vừa
    // đúng giới hạn — nhân đều lên MỌI kích thước để giữ nguyên tỉ lệ nội
    // bộ của overlay (không bị méo hình, chỉ nhỏ lại đồng đều).
    const widthConstrainedScale = rawTotalWidth > maxAllowedTotalWidth
        ? rawScale * (maxAllowedTotalWidth / rawTotalWidth)
        : rawScale

    // Cũng ràng buộc ngược lại: nếu video RẤT RỘNG nhưng THẤP (vd ultrawide
    // 21:9 nhưng cửa sổ dẹt), đừng để overlay quá nhỏ so với video — đặt
    // sàn tối thiểu theo % chiều rộng video để overlay vẫn đọc được.
    const MIN_OVERLAY_WIDTH_RATIO = 0.12
    const minAllowedTotalWidth = vw * MIN_OVERLAY_WIDTH_RATIO
    const finalScale = rawTotalWidth < minAllowedTotalWidth
        ? Math.min(MAX_SCALE, widthConstrainedScale * (minAllowedTotalWidth / Math.max(1, rawTotalWidth)))
        : widthConstrainedScale

    // ── Bước 4: mọi kích thước hiển thị đều tính từ CÙNG 1 finalScale ──
    const clockWidth = finalScale * clockWidthRatio
    const rowHeight = finalScale * rowHeightRatio
    const scoreBoxWidth = finalScale * 0.8
    const scoreFontSize = finalScale * 0.4
    const timeFontSize = finalScale * 0.46
    const labelFontSize = finalScale * 0.19
    const matchFontSize = finalScale * 0.16
    const badgeFontSize = finalScale * 0.23
    const gap = finalScale * 0.09
    const panelMinWidth = finalScale * panelMinWidthRatio
    const clockPaddingLeft = finalScale * 0.16

    const overlayLeftOffset = props.videoRect.left + vw * 0.03
    const overlayTopOffset = props.videoRect.top + vh * 0.03

    const timeColor = isTimeUp ? "#f87171" /* đỏ nhạt */ : (isPaused ? "rgba(255,255,255,0.55)" : "#fff")
    const pauseIconSize = finalScale * 0.16

    return (
        <motion.div
            className="absolute z-[5] pointer-events-none select-none flex flex-col"
            style={{ left: overlayLeftOffset, top: overlayTopOffset, gap }}
            initial="hidden"
            animate="visible"
            exit="hidden"
            variants={overlayContainerVariants}
        >
            <motion.div
                className="flex items-stretch overflow-hidden rounded-[5px]"
                style={{ boxShadow: "0 3px 10px rgba(0,0,0,0.4)" }}
                variants={groupVariants}
            >
                <motion.div
                    className="relative flex flex-col items-center justify-center shrink-0 gap-[3px]"
                    style={{
                        width: clockWidth,
                        backgroundColor: SCORE_COLORS.bgClock,
                        clipPath: "polygon(12% 0%, 100% 0%, 100% 100%, 12% 100%, 0% 50%)",
                        paddingLeft: clockPaddingLeft,
                        transformOrigin: "left center",
                    }}
                    variants={clockVariants}
                >
                    <span className="font-bold tracking-[0.12em]" style={{ fontSize: labelFontSize, color: SCORE_COLORS.accent }}>
                        ROUND {props.roundNo ?? 1}
                    </span>

                    <div className="flex items-center" style={{ gap: finalScale * 0.05 }}>
                        {isPaused && (
                            <div className="flex" style={{ gap: pauseIconSize * 0.25 }}>
                                <div style={{ width: pauseIconSize * 0.3, height: pauseIconSize, backgroundColor: "rgba(255,255,255,0.55)" }} />
                                <div style={{ width: pauseIconSize * 0.3, height: pauseIconSize, backgroundColor: "rgba(255,255,255,0.55)" }} />
                            </div>
                        )}
                        <span className="font-black leading-none font-mono" style={{
                            fontSize: timeFontSize, color: timeColor,
                            fontVariantNumeric: "tabular-nums", letterSpacing: "0.02em",
                            animation: isTimeUp ? "score-overlay-blink 1s ease-in-out infinite" : undefined,
                        }}>
                            {timeStr}
                        </span>
                    </div>

                    <span className="font-semibold tracking-wider" style={{
                        fontSize: matchFontSize,
                        color: isTimeUp ? "#f87171" : SCORE_COLORS.textDim,
                        fontWeight: isTimeUp ? 800 : 600,
                    }}>
                        {isTimeUp ? "HẾT GIỜ" : `MATCH ${props.matchNo ?? 1}`}
                    </span>
                </motion.div>

                <motion.div className="flex flex-col" style={{ minWidth: panelMinWidth, backgroundColor: SCORE_COLORS.bgPanel }} variants={panelVariants}>
                    <motion.div variants={rowRevealVariants}>
                        <AthleteRow score={s.redScore} gamjeom={s.redGamjeom} flatColor={SCORE_COLORS.red} isLeading={s.leadingSide === "red"}
                            rowHeight={rowHeight} scoreBoxWidth={scoreBoxWidth} scoreFontSize={scoreFontSize}
                            athleteName="HONG" />
                    </motion.div>
                    <div className="h-px bg-white/10" />
                    <motion.div variants={rowRevealVariants}>
                        <AthleteRow score={s.blueScore} gamjeom={s.blueGamjeom} flatColor={SCORE_COLORS.blue} isLeading={s.leadingSide === "blue"}
                            rowHeight={rowHeight} scoreBoxWidth={scoreBoxWidth} scoreFontSize={scoreFontSize}
                            athleteName="CHONG" />
                    </motion.div>
                </motion.div>
            </motion.div>

            {props.isReplay && (
                <motion.div className="self-start font-black tracking-[0.12em] rounded-[3px]" style={{
                    fontSize: badgeFontSize, padding: `${gap}px ${gap * 2}px`,
                    backgroundColor: SCORE_COLORS.accent, color: "#04121f",
                }} variants={badgeVariants}>
                    INSTANT VIDEO REPLAY
                </motion.div>
            )}

            <style jsx>{`
                @keyframes score-overlay-blink {
                    0%, 100% { opacity: 1; }
                    50% { opacity: 0.35; }
                }
            `}</style>
        </motion.div>
    )
}

type TimerEvent = {
    timestamp: number
    remainingMs: number
    isRunning: boolean
}

// MỚI: khớp với TimerHistoryEntry ở server
type TimerHistoryEntry = {
    timestamp: number
    event: TimerEvent | null
}

function useTimerOverlay(courtId: string, wallClockTimeMs: number | null) {
    const [entries, setEntries] = useState<TimerHistoryEntry[]>()

    useEffect(() => {
        const socket = getSingletonSocket()
        socket.emit("timer:events:get", { courtId }, (evts: TimerHistoryEntry[]) => {
            setEntries(evts)
        })
        const onAdd = (entry: TimerHistoryEntry) => {
            setEntries(prev => [...(prev ? prev : []), entry])
        }
        socket.on("timer:event:add", onAdd)
        return () => { socket.off("timer:event:add", onAdd) }
    }, [courtId])

    return useMemo(() => {
        if (wallClockTimeMs === null || !entries || entries.length === 0) {
            return { remainingMs: null, hasStarted: false, isRunning: false }
        }

        let lo = 0, hi = entries.length - 1, idx = -1
        while (lo <= hi) {
            const mid = (lo + hi) >> 1
            if (entries[mid].timestamp <= wallClockTimeMs) { idx = mid; lo = mid + 1 }
            else hi = mid - 1
        }
        if (idx === -1) return { remainingMs: null, hasStarted: false, isRunning: false }

        const entry = entries[idx]
        if (entry.event === null) return { remainingMs: null, hasStarted: false, isRunning: false }

        const evt = entry.event
        const remainingMs = evt.isRunning
            ? Math.max(0, evt.remainingMs - (wallClockTimeMs - evt.timestamp))
            : evt.remainingMs

        // Đồng hồ được coi là "đang chạy" chỉ khi evt.isRunning=true VÀ
        // vẫn còn thời gian thực tế tại thời điểm này — nếu remainingMs đã
        // về 0 (dù evt.isRunning vẫn true do server chưa kịp clearInterval),
        // coi như đã HẾT GIỜ chứ không phải đang chạy.
        const isRunning = evt.isRunning && remainingMs > 0

        return { remainingMs, hasStarted: true, isRunning }
    }, [entries, wallClockTimeMs])
}