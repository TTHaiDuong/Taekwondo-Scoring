"use client"

import { useEffect, useRef, useState, useCallback } from "react"
import { io, Socket } from "socket.io-client"
import { getSingletonSocket, setAuthToken } from "@/scripts/global-client-io"
import { useSearchParams } from "next/navigation"


// ============================================================
// JUDGE — Giao diện giám định
// Tự quản lý socket riêng để kiểm soát auth token
// ============================================================

type Side = "blue" | "red"
type ScoreType = 1 | 2 | 3

// ── Socket riêng cho judge (không dùng singleton global) ─────

function createJudgeSocket(token: string | null): Socket {
    const proto = window.location.protocol
    const host = window.location.hostname
    const port = 3001
    return io(`${proto}//${host}:${port}`, {
        transports: ["websocket"],
        auth: { token },
    })
}

// ── Persist token qua reload ──────────────────────────────────

const TOKEN_KEY = "judge_token"
const COURT_KEY = "judge_courtId"

function saveSession(courtId: string, token: string) {
    sessionStorage.setItem(TOKEN_KEY, token)
    sessionStorage.setItem(COURT_KEY, courtId)
}

function loadSession(): { courtId: string; token: string } | null {
    const token = sessionStorage.getItem(TOKEN_KEY)
    const courtId = sessionStorage.getItem(COURT_KEY)
    if (token && courtId) return { token, courtId }
    return null
}

// ── Fullscreen + orientation hook ─────────────────────────────

function useEnvironment() {
    const [isFullscreen, setFullscreen] = useState(false)
    const [isLandscape, setLandscape] = useState(false)
    const [fsSupported, setFsSupported] = useState(true)

    useEffect(() => {
        const doc = document as any
        const el = document.documentElement as any

        // Detect support
        setFsSupported(!!(el.requestFullscreen || el.webkitRequestFullscreen))

        function checkFs() {
            setFullscreen(!!(doc.fullscreenElement || doc.webkitFullscreenElement))
        }
        function checkOrientation() {
            setLandscape(window.innerWidth > window.innerHeight)
        }

        checkFs()
        checkOrientation()

        document.addEventListener("fullscreenchange", checkFs)
        document.addEventListener("webkitfullscreenchange", checkFs)
        window.addEventListener("resize", checkOrientation)
        window.addEventListener("orientationchange", checkOrientation)

        return () => {
            document.removeEventListener("fullscreenchange", checkFs)
            document.removeEventListener("webkitfullscreenchange", checkFs)
            window.removeEventListener("resize", checkOrientation)
            window.removeEventListener("orientationchange", checkOrientation)
        }
    }, [])

    async function requestFullscreen() {
        const el = document.documentElement as any
        try {
            if (el.requestFullscreen) await el.requestFullscreen()
            else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen()
        } catch { }
        try {
            if (screen.orientation && (screen.orientation as any).lock) {
                await (screen.orientation as any).lock("landscape")
            }
        } catch { }
    }

    // Ready khi: (fullscreen HOẶC không hỗ trợ fs) VÀ landscape
    const ready = (isFullscreen || !fsSupported) && isLandscape

    return { ready, isFullscreen, isLandscape, fsSupported, requestFullscreen }
}

// ── Setup screen ──────────────────────────────────────────────

function SetupScreen(props: {
    isLandscape: boolean
    isFullscreen: boolean
    fsSupported: boolean
    onActivate: () => void
}) {
    const isIos = typeof navigator !== "undefined" && /iPad|iPhone|iPod/.test(navigator.userAgent)
    const isAndroid = typeof navigator !== "undefined" && /Android/.test(navigator.userAgent)

    return (
        <div className="fixed inset-0 flex flex-col items-center justify-center
            gap-[20px] bg-black text-white px-[24px]">

            <span className="text-[48px] leading-none">⛶</span>
            <p className="text-[18px] font-bold text-center">
                Cần xoay ngang & toàn màn hình
            </p>

            {/* Landscape status */}
            <div className={`flex items-center gap-[12px] w-full max-w-[300px]
                px-[16px] py-[12px] rounded-[12px]
                ${props.isLandscape ? "bg-green-950 border border-green-700" : "bg-white/5 border border-white/15"}`}>
                <span className="text-[22px]">{props.isLandscape ? "✓" : "↺"}</span>
                <div>
                    <p className="text-[14px] font-semibold">
                        {props.isLandscape ? "Đã xoay ngang" : "Xoay thiết bị ngang"}
                    </p>
                    {!props.isLandscape && (
                        <p className="text-[11px] text-white/40 mt-[2px]">
                            {isIos ? "Tắt khoá xoay trong Control Center" : "Xoay điện thoại 90°"}
                        </p>
                    )}
                </div>
            </div>

            {/* Fullscreen status */}
            {props.fsSupported ? (
                <div className={`flex items-center gap-[12px] w-full max-w-[300px]
                    px-[16px] py-[12px] rounded-[12px]
                    ${props.isFullscreen ? "bg-green-950 border border-green-700" : "bg-white/5 border border-white/15"}`}>
                    <span className="text-[22px]">{props.isFullscreen ? "✓" : "⛶"}</span>
                    <div>
                        <p className="text-[14px] font-semibold">
                            {props.isFullscreen ? "Đang toàn màn hình" : "Chưa toàn màn hình"}
                        </p>
                        {!props.isFullscreen && (
                            <p className="text-[11px] text-white/40 mt-[2px]">Nhấn nút bên dưới</p>
                        )}
                    </div>
                </div>
            ) : (
                <div className="flex items-start gap-[12px] w-full max-w-[300px]
                    px-[16px] py-[12px] rounded-[12px] bg-blue-950 border border-blue-700">
                    <span className="text-[22px]">ℹ</span>
                    <div>
                        <p className="text-[13px] font-semibold">Không hỗ trợ toàn màn hình</p>
                        <p className="text-[11px] text-white/50 mt-[2px]">
                            {isIos
                                ? "Dùng Safari → Chia sẻ → Thêm vào màn hình chính"
                                : isAndroid
                                    ? "Chrome → menu ⋮ → Thêm vào màn hình chính"
                                    : "Nhấn F11 để bật toàn màn hình"
                            }
                        </p>
                    </div>
                </div>
            )}

            <button
                onClick={props.onActivate}
                disabled={!props.isLandscape}
                className="mt-[8px] px-[48px] py-[14px] rounded-[14px]
                    bg-white text-black text-[16px] font-bold
                    disabled:opacity-30 disabled:cursor-not-allowed
                    active:scale-95 transition-transform"
            >
                {props.fsSupported && !props.isFullscreen ? "Bật toàn màn hình & Bắt đầu" : "Bắt đầu"}
            </button>
        </div>
    )
}

// ── Score button ──────────────────────────────────────────────

// Màu tương phản tối đa:
// 1 → vàng trên nền đen     (nhận diện: góc trên)
// 2 → trắng trên nền đen    (to nhất, giữa/dưới — ngón cái dễ với)
// 3 → đỏ cam trên nền đen   (nhận diện: góc dưới)

type BtnConfig = {
    color: string   // màu số
    shadow: string   // text shadow màu
}

const BLUE_CONFIG: Record<ScoreType, BtnConfig> = {
    1: { color: "#FFD700", shadow: "rgba(255,215,0,0.4)" },
    2: { color: "#FFFFFF", shadow: "rgba(255,255,255,0.3)" },
    3: { color: "#FF6B35", shadow: "rgba(255,107,53,0.4)" },
}
const RED_CONFIG: Record<ScoreType, BtnConfig> = {
    1: { color: "#FFD700", shadow: "rgba(255,215,0,0.4)" },
    2: { color: "#FFFFFF", shadow: "rgba(255,255,255,0.3)" },
    3: { color: "#FF6B35", shadow: "rgba(255,107,53,0.4)" },
}

function ScoreBtn(props: {
    score: ScoreType
    side: Side
    flash: boolean
    onPress: () => void
    style?: React.CSSProperties
    className?: string
}) {
    const cfg = props.side === "blue" ? BLUE_CONFIG[props.score] : RED_CONFIG[props.score]
    const flashBg = props.flash ? "rgba(255,255,255,0.18)" : "transparent"

    function handleTouch(e: React.TouchEvent) {
        e.preventDefault()
        e.stopPropagation()
        if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(55)
        props.onPress()
    }

    return (
        <button
            // onTouchStart={handleTouch}
            onPointerDown={e => { e.preventDefault(); props.onPress() }}
            onContextMenu={e => e.preventDefault()}
            className={`flex items-center justify-center select-none
                rounded-[3vw] border-[3px] transition-colors duration-75
                ${props.className ?? ""}`}
            style={{
                background: flashBg,
                borderColor: props.flash ? cfg.color : "rgba(255,255,255,0.12)",
                WebkitTapHighlightColor: "transparent",
                touchAction: "none",
                ...props.style,
            }}
        >
            <span
                className="font-score font-black leading-none tabular-nums"
                style={{
                    color: cfg.color,
                    fontSize: "inherit",
                    textShadow: `0 0 30px ${cfg.shadow}, 0 2px 4px rgba(0,0,0,0.8)`,
                }}
            >
                {props.score}
            </span>
        </button>
    )
}

// ── Side layout ───────────────────────────────────────────────
// Bố cục: nút 2 chiếm 60% chiều cao (dễ với tới)
//         nút 1 góc trên, nút 3 góc dưới (khó với hơn)

function SideLayout(props: {
    side: Side
    flashes: Record<ScoreType, boolean>
    onPress: (s: ScoreType) => void
}) {
    const isBlue = props.side === "blue"
    const sideBg = isBlue ? "rgba(0,80,160,0.4)" : "rgba(160,0,0,0.4)"
    const label = isBlue ? "XANH" : "ĐỎ"
    const labelColor = isBlue ? "#4488FF" : "#FF4444"
    const [isPortrait, setIsPortrait] = useState(false)

    useEffect(() => {
        const updateOrientation = () => {
            setIsPortrait(window.innerHeight > window.innerWidth)
        }

        updateOrientation()

        window.addEventListener("resize", updateOrientation)

        return () => {
            window.removeEventListener("resize", updateOrientation)
        }
    }, [])

    return (
        <div
            className="flex-1 flex flex-col gap-[1.5vw] p-[2vw] rounded-[3vw] relative"
            style={{ background: sideBg }}
        >
            {/* Label góc */}
            <div className={`
            absolute 
            ${isPortrait ?
                    "left-1/2 -translate-x-1/2 top-[2vw]" :
                    `${isBlue ? "left-[3vw]" : "right-[3vw]"} bottom-[2vw]`} 
                text-[1.2rem] font-black tracking-[0.25em] opacity-60`}
                style={{ color: labelColor }}>
                {label}
            </div>

            {/* Nút 2 — to nhất, giữa, ngón cái dễ với */}
            {isPortrait ?
                <div className="flex flex-col w-full h-full justify-end p-[5px] gap-[15px]">
                    <ScoreBtn
                        score={3} side={props.side}
                        flash={props.flashes[3]}
                        onPress={() => props.onPress(3)}
                        className="w-full h-[16vh]"
                        style={{ fontSize: "16vw" }}
                    />
                    <ScoreBtn
                        score={2} side={props.side}
                        flash={props.flashes[2]}
                        onPress={() => props.onPress(2)}
                        className="w-full h-[32vh]"
                        style={{ fontSize: "26vw" }}
                    />
                    <div />
                    <ScoreBtn
                        score={1} side={props.side}
                        flash={props.flashes[1]}
                        onPress={() => props.onPress(1)}
                        className="w-full h-[16vh]"
                        style={{ fontSize: "16vw" }}
                    />
                    <div />
                </div>
                : <>
                    <div className={`flex ${isBlue ? "" : "flex-row-reverse"} gap-[1.5vw] h-full`}>
                        <ScoreBtn
                            score={2} side={props.side}
                            flash={props.flashes[2]}
                            onPress={() => props.onPress(2)}
                            className="flex-1 w-full"
                            style={{ fontSize: "18vw" }}
                        />

                        {/* Nút 3 — vừa, góc dưới */}
                        <ScoreBtn
                            score={3} side={props.side}
                            flash={props.flashes[3]}
                            onPress={() => props.onPress(3)}
                            className="w-[18vw] h-full"
                            style={{ fontSize: "9vw" }}
                        />
                    </div>

                    {/* Nút 1 — nhỏ, góc trên đối diện label */}
                    <div className={`flex ${isBlue ? "justify-end" : "justify-start"}`}>
                        <ScoreBtn
                            score={1} side={props.side}
                            flash={props.flashes[1]}
                            onPress={() => props.onPress(1)}
                            className="w-[18vw] h-[14vw]"
                            style={{ fontSize: "7vw" }}
                        />
                    </div>
                </>}

        </div>
    )
}

// ── Main ──────────────────────────────────────────────────────

export default function Judge() {
    const searchParams = useSearchParams();

    const courtId = searchParams.get("courtId") ?? "1"
    const env = useEnvironment()

    const socketRef = useRef<Socket | null>(null)
    const [connected, setConnected] = useState(false)
    const [authed, setAuthed] = useState(false)
    const [judgeOrder, setJudgeOrder] = useState<number | undefined>(undefined)

    const [flashes, setFlashes] = useState<Record<Side, Record<ScoreType, boolean>>>({
        blue: { 1: false, 2: false, 3: false },
        red: { 1: false, 2: false, 3: false },
    })

    const audioCtxRef = useRef<AudioContext | null>(null)

    useEffect(() => {
        audioCtxRef.current = new AudioContext()
    }, [])

    function playTick(volume = 3) {
        const ctx = audioCtxRef.current
        if (!ctx) return

        const osc = ctx.createOscillator()
        const gain = ctx.createGain()

        gain.gain.value = volume

        osc.frequency.value = 1000

        osc.connect(gain)
        gain.connect(ctx.destination)

        osc.start()

        gain.gain.exponentialRampToValueAtTime(
            0.0001,
            ctx.currentTime + 0.03
        )

        osc.stop(ctx.currentTime + 0.03)
    }

    // Lấy số thứ tự judge (dùng chung cho join / rejoin)
    function fetchJudgeOrder(socket: Socket) {
        socket.emit("judge:order:get", { courtId }, (num?: number) => {
            setJudgeOrder(num)
        })
    }

    // ── Kết nối socket + auth ──────────────────────────────
    useEffect(() => {
        const session = loadSession()
        const token = session?.token ?? null

        const socket = getSingletonSocket()
        socketRef.current = socket

        socket.on("connect", () => {
            setConnected(true)
            // Nếu đã có token (reload) thì server tự auth qua middleware
            // Nếu chưa có token thì join để lấy token mới
            if (!token) {
                socket.emit("judge:join", { courtId }, (newToken: string) => {
                    if (newToken) {
                        saveSession(courtId, newToken)
                        setAuthed(true)
                    }
                })
            } else {
                // Reconnect với token cũ — vào room
                socket.emit("judge:rejoin", { courtId }, (ok: boolean) => {
                    setAuthed(!!ok)
                    // if (ok) fetchJudgeOrder(socket)
                })
            }

            socket.emit("court:join", { courtId, isJudge: true }, () => {
                fetchJudgeOrder(socket)
            })
        })

        socket.on("disconnect", () => {
            setConnected(false)
            setAuthed(false)
            setJudgeOrder(undefined)
        })

        socket.on("judge:kicked", () => {
            sessionStorage.removeItem(TOKEN_KEY)
            sessionStorage.removeItem(COURT_KEY)
            setAuthed(false)
            setJudgeOrder(undefined)
            socket.disconnect()
        })

        socket.on("judge:order:update", (data: { order: number }) => {
            setJudgeOrder(data.order)
        })

        return () => { socket.disconnect() }
    }, [courtId])

    // ── Flash feedback ─────────────────────────────────────
    function flash(side: Side, score: ScoreType) {
        setFlashes(prev => ({
            ...prev,
            [side]: { ...prev[side], [score]: true }
        }))
        setTimeout(() => setFlashes(prev => ({
            ...prev,
            [side]: { ...prev[side], [score]: false }
        })), 140)
    }

    // ── Emit score ─────────────────────────────────────────
    const handlePress = useCallback((side: Side, score: ScoreType) => {
        const map = {
            1: "punch",
            2: "trunkKick",
            3: "headKick"
        }
        flash(side, score)
        socketRef.current?.emit("score:judge:update", {
            courtId,
            side,
            pointType: map[score],
        })
        playTick()
    }, [])

    // ── Judge UI ───────────────────────────────────────────
    return (
        <div
            className="fixed inset-0 bg-black flex items-stretch gap-[2vw] p-[2vw] overflow-y-auto"
            style={{ touchAction: "manipulation" }}
        >
            <SideLayout
                side="blue"
                flashes={flashes.blue}
                onPress={s => handlePress("blue", s)}
            />

            {/* Divider — mỏng, không rào cản */}
            <div className="w-[2px] bg-white/8 rounded-full self-stretch my-[4vw]" />

            <SideLayout
                side="red"
                flashes={flashes.red}
                onPress={s => handlePress("red", s)}
            />

            {/* Số thứ tự giám khảo */}
            {judgeOrder !== undefined && (
                <div className="absolute top-[2vw] left-1/2 -translate-x-1/2
                    flex-center px-[1rem] py-[1vw] rounded-full
                    bg-white/10 border border-white/15">
                    <span className="text-[1rem] font-bold text-white/70 tracking-wide">
                        SÂN {courtId}
                        <br />
                        No. {judgeOrder + 1}
                    </span>
                </div>
            )}

            {/* Status dot */}
            <div className={`absolute bottom-[1.5vw] left-1/2 -translate-x-1/2
                w-[1.2vw] h-[1.2vw] rounded-full transition-colors
                ${connected && authed ? "bg-green-500" : "bg-red-500"}`}
            />
        </div>
    )
}