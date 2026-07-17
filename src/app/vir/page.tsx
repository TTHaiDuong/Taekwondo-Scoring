"use client"

import Hls, { Level } from "hls.js"
import { Room, RoomEvent, RemoteParticipant, RemoteTrack, RemoteTrackPublication, Track } from "livekit-client"
import { useEffect, useRef, useState, useCallback } from "react"
import { useSearchParams } from "next/navigation"
import { InstantReplayBuffer, BufferStats } from "./InstantReplayBuffer"

// ============================================================
// VIEWER — 3 CHẾ ĐỘ
//
// 1) "live"    — LiveKit (WebRTC), độ trễ <1s. Mặc định.
// 2) "instant" — Tua lại TỨC THỜI: buffer ghi liên tục ngay tại trình
//                duyệt trọng tài (không qua server), tối đa ~90s gần nhất.
//                Bấm là xem lại ngay, không phải chờ server đóng gói HLS.
//                Dùng cho việc RA QUYẾT ĐỊNH nhanh trong lúc thi đấu.
// 3) "archive" — HLS (server transcode qua FFmpeg): tua xa hơn, đánh dấu
//                điểm bắt đầu/kết thúc và xuất file clip vĩnh viễn.
//                Dùng cho việc xem lại sâu hơn / lưu trữ, không yêu cầu
//                độ trễ thấp nhất.
// ============================================================

type LiveCameraInfo = { cameraId: string; participantIdentity: string }
type RecordingInfo = {
    cameraId: string
    paused: boolean
    zoom: number
    startedAt: number
    masterPlaylistUrl: string
}

type Status = "connecting" | "connected" | "error" | "no-publisher"
type Mode = "live" | "instant" | "archive"

const SPEED_OPTIONS = [0.25, 0.5, 1, 1.5, 2] as const
const LIVE_EDGE_THRESHOLD_SEC = 4
const CONTROLS_HIDE_DELAY_MS = 3500
const ZOOM_STEP = 0.5
const ZOOM_MAX = 5

// Bộ đệm tua lại tức thời: giữ tối đa 90s gần nhất trong RAM trình duyệt.
// Tăng lên nếu muốn tua xa hơn, nhưng tốn RAM hơn (video gốc, không nén lại).
const INSTANT_BUFFER_SEC = 90
// Các mức "tua lại nhanh" hiện dưới dạng nút bấm nổi, giống nút rewind
// của các hệ thống video review thể thao (rewind 8s/10s...).
const QUICK_JUMP_OPTIONS = [5, 10, 30] as const

const BACKEND_PROTOCOL = process.env.NEXT_PUBLIC_SERVER_PROTOCOL || "https"
const BACKEND_PORT = process.env.NEXT_PUBLIC_SERVER_PORT

function serverBase() {
    const host = window.location.hostname
    const port = BACKEND_PORT ? `:${BACKEND_PORT}` : ""
    return `${BACKEND_PROTOCOL}://${host}${port}`
}

function wsBase() {
    const proto = process.env.NEXT_PUBLIC_LIVEKIT_WS_PROTOCOL || "wss"
    const host = process.env.NEXT_PUBLIC_LIVEKIT_HOST || window.location.hostname
    const port = process.env.NEXT_PUBLIC_LIVEKIT_PORT
    return `${proto}://${host}${port ? ":" + port : ""}`
}

function fmtClock(sec: number): string {
    if (!isFinite(sec) || sec < 0) sec = 0
    const m = Math.floor(sec / 60)
    const s = Math.floor(sec % 60)
    return `${m}:${s.toString().padStart(2, "0")}`
}

function parseCameraId(participant: RemoteParticipant): string {
    try {
        const meta = JSON.parse(participant.metadata || "{}")
        return meta.cameraId ?? participant.identity
    } catch {
        return participant.identity
    }
}

function getParticipantAudioTrack(room: Room | null, cameraId: string): MediaStreamTrack | null {
    if (!room) return null
    for (const participant of room.remoteParticipants.values()) {
        if (parseCameraId(participant) !== cameraId) continue
        for (const pub of participant.audioTrackPublications.values()) {
            if (pub.track?.mediaStreamTrack) return pub.track.mediaStreamTrack
        }
    }
    return null
}

// ── Camera tab selector ──────────────────────────────────────

function CameraTabs(props: { cameraIds: string[]; active: string; onSelect: (id: string) => void }) {
    const ids = Array.isArray(props.cameraIds) ? props.cameraIds : []
    if (ids.length <= 1) return null
    return (
        <div className="flex items-center gap-[6px] px-[12px] py-[8px] bg-black/60 backdrop-blur-sm overflow-x-auto">
            {ids.map(id => (
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

function SpeedSelector(props: { speed: number; onChange: (s: number) => void; compact?: boolean }) {
    return (
        <div className={`${props.compact ? "hidden sm:flex" : "flex"} items-center gap-[2px] bg-white/10 rounded-[10px] p-[3px]`}>
            {SPEED_OPTIONS.map(s => (
                <button key={s} onClick={() => props.onChange(s)}
                    className={`px-[8px] py-[5px] rounded-[8px] text-[11px] font-bold
                        ${props.speed === s ? "bg-amber-400 text-black" : "text-white/50 active:bg-white/10"}`}>
                    {s}×
                </button>
            ))}
        </div>
    )
}

function SeekBar(props: { positionSec: number; windowStartSec: number; windowEndSec: number; onSeek: (sec: number) => void; liveEdgeLabel?: string }) {
    const total = Math.max(0.001, props.windowEndSec - props.windowStartSec)
    const percent = Math.min(100, Math.max(0, ((props.positionSec - props.windowStartSec) / total) * 100))
    function handleClick(e: React.MouseEvent<HTMLDivElement>) {
        const rect = e.currentTarget.getBoundingClientRect()
        const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
        props.onSeek(props.windowStartSec + pct * total)
    }
    const behindLive = props.windowEndSec - props.positionSec
    return (
        <div className="flex flex-col gap-[4px] w-full">
            <div onClick={handleClick} className="relative w-full h-[8px] bg-white/15 rounded-full cursor-pointer overflow-hidden">
                <div className="absolute top-0 left-0 h-full bg-amber-400 rounded-full transition-[width] duration-75" style={{ width: `${percent}%` }} />
                <div className="absolute top-1/2 -translate-y-1/2 w-[14px] h-[14px] bg-white rounded-full shadow-md transition-[left] duration-75"
                    style={{ left: `calc(${percent}% - 7px)` }} />
            </div>
            <div className="flex justify-between text-[11px] text-white/40 font-mono">
                <span>{fmtClock(props.positionSec - props.windowStartSec)}</span>
                <span>{behindLive < LIVE_EDGE_THRESHOLD_SEC ? (props.liveEdgeLabel ?? "GẦN ĐIỂM MỚI NHẤT") : `-${fmtClock(behindLive)}`}</span>
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

    const liveVideoRef = useRef<HTMLVideoElement>(null)
    const instantVideoRef = useRef<HTMLVideoElement>(null)
    const replayVideoRef = useRef<HTMLVideoElement>(null)
    const roomRef = useRef<Room | null>(null)
    const hlsRef = useRef<Hls | null>(null)
    const controlsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const attachedTrackRef = useRef<RemoteTrack | null>(null)

    // ── Bộ đệm tua lại tức thời ──
    const instantBufferRef = useRef<InstantReplayBuffer | null>(null)
    const instantObjectUrlRef = useRef<string | null>(null)

    const [status, setStatus] = useState<Status>("connecting")
    const [liveCameras, setLiveCameras] = useState<Map<string, LiveCameraInfo>>(new Map())
    const [recordings, setRecordings] = useState<Map<string, RecordingInfo>>(new Map())
    const [activeCameraId, setActiveCameraId] = useState<string | null>(null)
    // Dùng state (thay vì chỉ ref) cho track đang gắn, để các effect khác
    // (đặc biệt là effect khởi động bộ đệm tua lại tức thời) có thể phụ
    // thuộc (dependency) vào đúng lúc track thay đổi.
    const [liveTrack, setLiveTrack] = useState<RemoteTrack | null>(null)

    const [mode, setMode] = useState<Mode>("live")
    const [isPlaying, setPlaying] = useState(true)
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

    // Trạng thái riêng cho chế độ tua lại tức thời
    const [instantBufferedSec, setInstantBufferedSec] = useState(0)
    const [instantDurationSec, setInstantDurationSec] = useState(0)
    const [instantPositionSec, setInstantPositionSec] = useState(0)
    const [instantPlaying, setInstantPlaying] = useState(true)
    const [instantSpeed, setInstantSpeedState] = useState(1)

    const cameraIds = Array.from(new Set([...liveCameras.keys(), ...recordings.keys()]))
    const activeRecording = activeCameraId ? recordings.get(activeCameraId) ?? null : null

    // ── (1) Kết nối LiveKit — nguồn XEM LIVE chính ──
    useEffect(() => {
        let cancelled = false
        const room = new Room({
            // Tự động điều chỉnh chất lượng theo kích thước video hiển thị
            // và tắt encode các layer không ai xem — giảm tải mạng/CPU phía
            // publisher khi có nhiều viewer với điều kiện xem khác nhau.
            adaptiveStream: true,
            dynacast: true,
        })
        roomRef.current = room

        async function connect() {
            try {
                const token = await fetch(`${serverBase()}/api/livekit/viewer-token?courtId=${courtId}`).then(r => r.text())
                await room.connect(wsBase(), token)
                if (cancelled) return

                room.on(RoomEvent.TrackSubscribed, (track: RemoteTrack, _pub: RemoteTrackPublication, participant: RemoteParticipant) => {
                    const camId = parseCameraId(participant)
                    setLiveCameras(prev => {
                        const next = new Map(prev)
                        next.set(camId, { cameraId: camId, participantIdentity: participant.identity })
                        return next
                    })
                    setActiveCameraId(prev => prev ?? camId)
                    setStatus("connected")

                    if (track.kind === Track.Kind.Video && camId === (activeCameraId ?? camId) && mode === "live") {
                        attachedTrackRef.current = track
                        setLiveTrack(track)
                        if (liveVideoRef.current) track.attach(liveVideoRef.current)
                    } else if (track.kind === Track.Kind.Audio) {
                        track.attach()
                    }
                })

                room.on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack, _pub: RemoteTrackPublication, participant: RemoteParticipant) => {
                    const camId = parseCameraId(participant)
                    track.detach()
                    if (attachedTrackRef.current === track) {
                        attachedTrackRef.current = null
                        setLiveTrack(null)
                    }
                    setLiveCameras(prev => {
                        const next = new Map(prev)
                        next.delete(camId)
                        return next
                    })
                    setActiveCameraId(prev => {
                        if (prev !== camId) return prev
                        const remaining = Array.from(liveCameras.keys()).filter(id => id !== camId)
                        return remaining[0] ?? null
                    })
                })

                room.on(RoomEvent.Disconnected, () => { if (!cancelled) setStatus("error") })
            } catch (err) {
                console.error("[VIR] LiveKit connect error:", err)
                if (!cancelled) setStatus("error")
            }
        }
        connect()

        return () => {
            cancelled = true
            room.disconnect()
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [courtId])

    // ── Gắn lại track live vào <video> mỗi khi đổi camera active (chế độ live) ──
    useEffect(() => {
        if (mode !== "live" || !activeCameraId) return
        const room = roomRef.current
        if (!room) return
        for (const participant of room.remoteParticipants.values()) {
            if (parseCameraId(participant) !== activeCameraId) continue
            participant.videoTrackPublications.forEach(pub => {
                if (pub.track && liveVideoRef.current) {
                    attachedTrackRef.current = pub.track
                    setLiveTrack(pub.track)
                    pub.track.attach(liveVideoRef.current)
                }
            })
        }
    }, [activeCameraId, mode])

    // ── Bộ đệm tua lại tức thời — ghi liên tục ngay khi có track live cho
    //    camera đang active, BẤT KỂ đang ở chế độ nào (live/instant/archive),
    //    để khi quay lại "live" hoặc bấm "tua lại" luôn có sẵn dữ liệu mới
    //    nhất. Chỉ chạy 1 buffer cho camera active tại một thời điểm — nếu
    //    cần buffer riêng cho từng camera cùng lúc, có thể mở rộng thành Map.
    useEffect(() => {
        instantBufferRef.current?.stop()
        instantBufferRef.current = null
        setInstantBufferedSec(0)

        if (!activeCameraId || !liveTrack || liveTrack.kind !== Track.Kind.Video) return

        const videoTrack = liveTrack.mediaStreamTrack
        if (!videoTrack) return
        const audioTrack = getParticipantAudioTrack(roomRef.current, activeCameraId)
        const mediaStream = new MediaStream([videoTrack, ...(audioTrack ? [audioTrack] : [])])

        const buffer = new InstantReplayBuffer(mediaStream, {
            maxDurationSec: INSTANT_BUFFER_SEC,
            onStatsChange: (s: BufferStats) => setInstantBufferedSec(s.bufferedSec),
        })
        buffer.start()
        instantBufferRef.current = buffer

        return () => {
            buffer.stop()
        }
    }, [activeCameraId, liveTrack])

    // ── (2) Poll thông tin bản ghi HLS (kho lưu trữ) ──
    useEffect(() => {
        let cancelled = false
        async function poll() {
            try {
                const res = await fetch(`${serverBase()}/api/hls/cameras?courtId=${courtId}`)
                const data = await res.json()
                const list: RecordingInfo[] = Array.isArray(data) ? data : []
                if (cancelled) return
                setRecordings(new Map(list.map(r => [r.cameraId, r])))
                setActiveCameraId(prev => prev ?? list[0]?.cameraId ?? null)
            } catch { /* dữ liệu bổ trợ, không phải nguồn live chính */ }
        }
        poll()
        const id = setInterval(poll, 3000)
        return () => { cancelled = true; clearInterval(id) }
    }, [courtId])

    // ── Gắn hls.js khi vào chế độ "archive" (kho lưu trữ) ──
    useEffect(() => {
        if (mode !== "archive") {
            hlsRef.current?.destroy()
            hlsRef.current = null
            return
        }
        const video = replayVideoRef.current
        if (!video || !activeRecording) return

        setLevels([]); setCurrentLevel(-1)
        const url = `${serverBase()}${activeRecording.masterPlaylistUrl}`

        if (Hls.isSupported()) {
            const hls = new Hls({ backBufferLength: 90, maxBufferLength: 30, liveSyncDurationCount: 3, liveMaxLatencyDurationCount: 15 })
            hlsRef.current = hls
            hls.loadSource(url)
            hls.attachMedia(video)
            hls.on(Hls.Events.MANIFEST_PARSED, (_e, data) => setLevels(data.levels))
            hls.on(Hls.Events.LEVEL_SWITCHED, (_e, data) => setCurrentLevel(data.level))
            hls.on(Hls.Events.ERROR, (_e, data) => { if (data.fatal) console.error("[VIR] HLS lỗi:", data) })
        } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
            video.src = url
        }
        video.play().catch(() => { })

        return () => { hlsRef.current?.destroy(); hlsRef.current = null }
    }, [mode, activeRecording?.masterPlaylistUrl, activeRecording?.startedAt])

    // ── Theo dõi vị trí phát của chế độ archive ──
    useEffect(() => {
        if (mode !== "archive") return
        const video = replayVideoRef.current
        if (!video) return
        const tick = () => {
            if (!video.seekable || video.seekable.length === 0) return
            setWindowStartSec(video.seekable.start(0))
            setWindowEndSec(video.seekable.end(0))
            setPositionSec(video.currentTime)
        }
        const id = setInterval(tick, 500)
        return () => clearInterval(id)
    }, [mode])

    // ── Theo dõi vị trí phát của chế độ instant ──
    useEffect(() => {
        if (mode !== "instant") return
        const video = instantVideoRef.current
        if (!video) return
        const tick = () => setInstantPositionSec(video.currentTime)
        const id = setInterval(tick, 200)
        return () => clearInterval(id)
    }, [mode])

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

    // ============================================================
    // CHẾ ĐỘ "INSTANT" — tua lại tức thời
    // ============================================================

    // jumpBackSec: nếu có, nhảy tới vị trí (cuối buffer - jumpBackSec) ngay
    // khi vào chế độ xem lại — dùng cho các nút "⏪ 10s" bấm nhanh.
    const enterInstantReplay = useCallback((jumpBackSec?: number) => {
        const buffer = instantBufferRef.current
        if (!buffer || !buffer.hasEnoughData()) return
        const blob = buffer.buildPlayableBlob()
        if (!blob) return

        if (instantObjectUrlRef.current) URL.revokeObjectURL(instantObjectUrlRef.current)
        const url = URL.createObjectURL(blob)
        instantObjectUrlRef.current = url

        setMode("instant")
        setInstantSpeedState(1)
        setInstantPlaying(true)

        // Chờ 1 nhịp để <video> của chế độ instant chắc chắn đã render
        // (mode vừa đổi) trước khi gán src.
        requestAnimationFrame(() => {
            const video = instantVideoRef.current
            if (!video) return
            video.src = url
            video.playbackRate = 1

            const onLoaded = () => {
                const dur = isFinite(video.duration) ? video.duration : 0
                setInstantDurationSec(dur)
                const target = jumpBackSec != null ? Math.max(0, dur - jumpBackSec) : Math.max(0, dur - 5)
                video.currentTime = target
                setInstantPositionSec(target)
                video.play().catch(() => { })
                video.removeEventListener("loadedmetadata", onLoaded)
            }
            video.addEventListener("loadedmetadata", onLoaded)
        })
    }, [])

    // Nút "⏪ 10s" v.v — luôn DỰNG LẠI buffer mới nhất (gọi lại enterInstantReplay)
    // để đảm bảo dữ liệu tính từ đúng thời điểm bấm, không phải bản snapshot cũ.
    const quickJumpBack = useCallback((sec: number) => {
        enterInstantReplay(sec)
    }, [enterInstantReplay])

    const exitInstantReplay = useCallback(() => {
        setMode("live")
        const video = instantVideoRef.current
        if (video) {
            video.pause()
            video.removeAttribute("src")
            video.load()
        }
        if (instantObjectUrlRef.current) {
            URL.revokeObjectURL(instantObjectUrlRef.current)
            instantObjectUrlRef.current = null
        }
    }, [])

    const instantTogglePlay = useCallback(() => {
        const video = instantVideoRef.current
        if (!video) return
        if (video.paused) { video.play(); setInstantPlaying(true) } else { video.pause(); setInstantPlaying(false) }
    }, [])

    const instantSetSpeed = useCallback((s: number) => {
        setInstantSpeedState(s)
        if (instantVideoRef.current) instantVideoRef.current.playbackRate = s
    }, [])

    const instantSeekTo = useCallback((sec: number) => {
        if (instantVideoRef.current) {
            instantVideoRef.current.currentTime = Math.max(0, Math.min(instantDurationSec, sec))
        }
    }, [instantDurationSec])

    // Tải xuống toàn bộ đoạn đang đệm (tối đa INSTANT_BUFFER_SEC giây gần
    // nhất) dưới dạng file .webm — hữu ích để lưu nhanh 1 pha tranh cãi mà
    // không cần chờ xuất clip qua server.
    const downloadInstantBuffer = useCallback(() => {
        const buffer = instantBufferRef.current
        if (!buffer) return
        const blob = buffer.buildPlayableBlob()
        if (!blob) return
        const url = URL.createObjectURL(blob)
        const a = document.createElement("a")
        a.href = url
        a.download = `tua-lai-${activeCameraId ?? "cam"}-${Date.now()}.webm`
        document.body.appendChild(a)
        a.click()
        a.remove()
        setTimeout(() => URL.revokeObjectURL(url), 5000)
    }, [activeCameraId])

    // ============================================================
    // CHẾ ĐỘ "ARCHIVE" — kho lưu trữ HLS (như cũ)
    // ============================================================

    const enterArchive = useCallback(() => {
        if (!activeRecording) return
        setMode("archive")
    }, [activeRecording])

    const jumpToLive = useCallback(() => {
        setMode("live")
        setSpeedState(1)
        setPlaying(true)
    }, [])

    // Nút "TRỰC TIẾP" dùng chung cho cả 2 chế độ xem lại
    const backToLive = useCallback(() => {
        if (mode === "archive") jumpToLive()
        else if (mode === "instant") exitInstantReplay()
    }, [mode, jumpToLive, exitInstantReplay])

    const togglePlay = useCallback(() => {
        const video = replayVideoRef.current
        if (!video || mode !== "archive") return
        if (video.paused) { video.play(); setPlaying(true) } else { video.pause(); setPlaying(false) }
    }, [mode])

    const setSpeed = useCallback((s: number) => {
        setSpeedState(s)
        if (replayVideoRef.current) replayVideoRef.current.playbackRate = s
    }, [])

    const seekTo = useCallback((sec: number) => {
        if (replayVideoRef.current) replayVideoRef.current.currentTime = sec
    }, [])

    const toggleMute = useCallback(() => {
        const video = mode === "archive" ? replayVideoRef.current
            : mode === "instant" ? instantVideoRef.current
                : liveVideoRef.current
        if (!video) return
        video.muted = !video.muted
        setMuted(video.muted)
    }, [mode])

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
        if (!confirm(`Dừng camera "${activeCameraId}"? Camera sẽ ngắt kết nối hoàn toàn (cả live lẫn ghi hình).`)) return
        sendControl("stop")
    }, [activeCameraId, sendControl])

    const markStart = useCallback(() => setMarkIn(positionSec), [positionSec])

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
                }),
            })
            const data = await res.json()
            if (data.url) {
                const a = document.createElement("a")
                a.href = `${serverBase()}${data.url}`
                a.download = ""
                document.body.appendChild(a); a.click(); a.remove()
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
        setMode("live") // đổi camera thì quay về live cho camera mới, tránh nhầm bản ghi
    }, [])

    return (
        <div className="fixed inset-0 bg-black flex flex-col overflow-hidden select-none"
            onPointerMove={bumpControlsVisible} onPointerDown={bumpControlsVisible}>

            {/* ── Layer 1: LIVE (LiveKit) — luôn chạy phía sau kể cả khi đang xem lại ── */}
            <video ref={liveVideoRef} muted={muted} playsInline autoPlay
                className={`absolute inset-0 w-full h-full object-contain bg-black z-[1] transition-opacity duration-150
                    ${mode === "live" ? "opacity-100" : "opacity-0 pointer-events-none"}`} />

            {/* ── Layer 2: TUA LẠI TỨC THỜI (buffer client-side) ── */}
            <video ref={instantVideoRef} muted={muted} playsInline
                className={`absolute inset-0 w-full h-full object-contain bg-black z-[2] transition-opacity duration-150
                    ${mode === "instant" ? "opacity-100" : "opacity-0 pointer-events-none"}`} />

            {/* ── Layer 3: KHO LƯU TRỮ (hls.js) ── */}
            <video ref={replayVideoRef} muted={muted} playsInline
                className={`absolute inset-0 w-full h-full object-contain bg-black z-[3] transition-opacity duration-150
                    ${mode === "archive" ? "opacity-100" : "opacity-0 pointer-events-none"}`} />

            <div className={`absolute top-0 left-0 right-0 z-10 flex flex-col transition-opacity duration-300
                ${controlsVisible ? "opacity-100" : "opacity-0 pointer-events-none"}`}>
                <div className="flex items-center justify-between px-[16px] py-[12px] bg-gradient-to-b from-black/70 to-transparent">
                    <div className="flex items-center gap-[8px]">
                        <ConnectionBadge status={status} count={cameraIds.length} />
                        {mode === "instant" && (
                            <span className="px-[10px] py-[4px] rounded-full text-[11px] font-bold bg-amber-500/90 text-black">
                                ⚡ TUA LẠI TỨC THỜI
                            </span>
                        )}
                        {mode === "archive" && (
                            <span className="px-[10px] py-[4px] rounded-full text-[11px] font-bold bg-blue-500/90 text-white">
                                🗄 KHO LƯU TRỮ
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

            {/* ── Nút nổi khi đang LIVE: tua lại nhanh + kho lưu trữ ── */}
            {mode === "live" && (
                <div className={`absolute bottom-[24px] left-1/2 -translate-x-1/2 z-10
                    flex flex-col items-center gap-[10px] transition-opacity duration-300
                    ${controlsVisible ? "opacity-100" : "opacity-0 pointer-events-none"}`}>

                    {instantBufferedSec >= 2 && (
                        <div className="flex items-center gap-[8px]">
                            {QUICK_JUMP_OPTIONS.map(sec => (
                                <button key={sec} onClick={() => quickJumpBack(sec)}
                                    className="px-[14px] py-[10px] rounded-full font-bold text-[13px]
                                        bg-white/15 text-white backdrop-blur-sm active:scale-95 transition-transform">
                                    ⏪ {sec}s
                                </button>
                            ))}
                        </div>
                    )}

                    <div className="flex items-center gap-[10px]">
                        <button onClick={() => enterInstantReplay()}
                            disabled={instantBufferedSec < 2}
                            className="flex items-center gap-[10px] px-[24px] py-[16px]
                                bg-amber-400 text-black rounded-full font-bold text-[15px]
                                shadow-lg active:scale-95 transition-transform disabled:opacity-40 disabled:active:scale-100">
                            ⚡ Tua lại tức thời
                        </button>

                        {activeRecording && (
                            <button onClick={enterArchive}
                                className="flex items-center gap-[8px] px-[16px] py-[16px]
                                    bg-white/10 text-white rounded-full font-bold text-[13px]
                                    active:scale-95 transition-transform">
                                🗄 Kho lưu trữ
                            </button>
                        )}
                    </div>

                    {instantBufferedSec < 2 && (
                        <span className="text-[11px] text-white/40">Đang tích luỹ bộ đệm để có thể tua lại...</span>
                    )}
                </div>
            )}

            {/* ── Thanh điều khiển chế độ TUA LẠI TỨC THỜI ── */}
            {mode === "instant" && (
                <div className={`absolute bottom-0 left-0 right-0 z-[20] flex flex-col gap-[10px]
                    px-[16px] pt-[28px] pb-[14px]
                    bg-gradient-to-t from-black/85 via-black/50 to-transparent
                    transition-all duration-300
                    ${controlsVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-[12px] pointer-events-none"}`}>

                    <SeekBar
                        positionSec={instantPositionSec}
                        windowStartSec={0}
                        windowEndSec={instantDurationSec}
                        onSeek={instantSeekTo}
                        liveEdgeLabel="GẦN THỜI ĐIỂM HIỆN TẠI"
                    />

                    <div className="flex items-center justify-between gap-[10px]">
                        <div className="flex items-center gap-[6px]">
                            <button onClick={instantTogglePlay} className="w-[40px] h-[40px] flex-center rounded-full bg-white text-black active:scale-95 transition-transform">
                                {instantPlaying ? "❚❚" : "▶"}
                            </button>
                            <SpeedSelector speed={instantSpeed} onChange={instantSetSpeed} compact />
                            {QUICK_JUMP_OPTIONS.map(sec => (
                                <button key={sec} onClick={() => quickJumpBack(sec)}
                                    className="hidden md:block px-[10px] py-[8px] rounded-[10px] text-[11px] font-bold bg-white/10 text-white active:bg-white/20">
                                    ⏪{sec}s
                                </button>
                            ))}
                        </div>

                        <div className="flex items-center gap-[8px] shrink-0">
                            <button onClick={downloadInstantBuffer}
                                className="px-[12px] py-[8px] rounded-[10px] text-[11px] font-bold bg-white/10 text-white active:bg-white/20">
                                💾 Tải đoạn này
                            </button>
                            <button onClick={backToLive}
                                className="px-[14px] py-[8px] rounded-[10px] text-[12px] font-bold bg-red-600/80 text-white active:bg-red-600 flex items-center gap-[6px]">
                                <span className="w-[6px] h-[6px] rounded-full bg-white animate-pulse" />
                                TRỰC TIẾP
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Thanh điều khiển chế độ KHO LƯU TRỮ (như cũ) ── */}
            {mode === "archive" && activeCameraId && activeRecording && (
                <div className={`absolute bottom-0 left-0 right-0 z-[20] flex flex-col gap-[10px]
                    px-[16px] pt-[28px] pb-[14px]
                    bg-gradient-to-t from-black/85 via-black/50 to-transparent
                    transition-all duration-300
                    ${controlsVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-[12px] pointer-events-none"}`}>

                    <SeekBar positionSec={positionSec} windowStartSec={windowStartSec} windowEndSec={windowEndSec} onSeek={seekTo} />

                    <div className="flex items-center justify-between gap-[10px]">
                        <div className="flex items-center gap-[6px]">
                            <button onClick={togglePlay} className="w-[40px] h-[40px] flex-center rounded-full bg-white text-black active:scale-95 transition-transform">
                                {isPlaying ? "❚❚" : "▶"}
                            </button>
                            <SpeedSelector speed={speed} onChange={setSpeed} compact />
                            <QualitySelector levels={levels} current={currentLevel} onChange={changeLevel} />
                        </div>

                        <button onClick={backToLive}
                            className="px-[14px] py-[8px] rounded-[10px] text-[12px] font-bold bg-red-600/80 text-white active:bg-red-600 flex items-center gap-[6px] shrink-0">
                            <span className="w-[6px] h-[6px] rounded-full bg-white animate-pulse" />
                            TRỰC TIẾP
                        </button>
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

            {/* ── Khi ở chế độ LIVE nhưng vẫn cần điều khiển camera (zoom/dừng) ── */}
            {mode === "live" && activeCameraId && activeRecording && (
                <div className={`absolute bottom-0 left-0 right-0 z-[15] flex justify-center pb-[160px]
                    pointer-events-none
                    transition-opacity duration-300 ${controlsVisible ? "opacity-100" : "opacity-0"}`}>
                    <div className="bg-black/60 backdrop-blur-sm rounded-[14px] px-[10px] py-[8px] pointer-events-auto">
                        <CameraControls
                            zoom={activeRecording.zoom}
                            paused={activeRecording.paused}
                            onZoom={changeZoom}
                            onTogglePause={togglePauseUpload}
                            onStopRecording={stopRecording}
                        />
                    </div>
                </div>
            )}
        </div>
    )
}