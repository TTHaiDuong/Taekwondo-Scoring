"use client"

import { useEffect, useRef, useState } from "react"
import { getSingletonSocket, setAuthToken } from "@/scripts/global-client-io"
import { PointType, RoundResult, RoundWinner, ScoreBreakdown, Side, calcTotalFromBreakdown, emptyBreakdown, inferRoundWinner } from "@/scripts/match-types"
import MobileSetting, { createBinding } from "./MobileSetting"
import QuickAccess from "./QuickAccess"

// ── SVG assets ────────────────────────────────────────────────
import ArmorI from "@/assets/solid-armor.svg"
import HelmetI from "@/assets/solid-helmet.svg"
import PunchI from "@/assets/solid-punch.svg"
import WifiI from "@/assets/wifi.svg"
import JudgeI from "@/assets/judge.svg"
import NutI from "@/assets/nut.svg"
import CameraI from "@/assets/camera.svg"
import CameraOffI from "@/assets/camera-off.svg"
import IvrPanel, { type IvrState, createDefaultIvrState } from "./IvrPanel"
import TimePicker from "./TimePicker"
import { JudgePointType } from "@/server/services/score"
import { JudgePressStack } from "./JudgePress"
import { motion, AnimatePresence, useDragControls, useMotionValue, useAnimation } from "framer-motion"

// ── Fullscreen hook ───────────────────────────────────────────
function useFullscreen() {
    const [isFullscreen, setIsFullscreen] = useState(false)
    const [fsAvailable, setFsAvailable] = useState<"full" | "partial" | "none">("none")
    const [showGuide, setShowGuide] = useState(false)

    useEffect(() => {
        // Kiểm tra API hỗ trợ
        const el = document.documentElement as any
        if (el.requestFullscreen || el.webkitRequestFullscreen || el.mozRequestFullScreen) {
            setFsAvailable("full")
        } else if ((navigator as any).standalone !== undefined || window.matchMedia("(display-mode: standalone)").matches) {
            setFsAvailable("partial")
        } else {
            setFsAvailable("none")
        }

        function onFsChange() {
            const doc = document as any
            setIsFullscreen(!!(doc.fullscreenElement || doc.webkitFullscreenElement || doc.mozFullScreenElement))
        }
        document.addEventListener("fullscreenchange", onFsChange)
        document.addEventListener("webkitfullscreenchange", onFsChange)
        document.addEventListener("mozfullscreenchange", onFsChange)
        return () => {
            document.removeEventListener("fullscreenchange", onFsChange)
            document.removeEventListener("webkitfullscreenchange", onFsChange)
            document.removeEventListener("mozfullscreenchange", onFsChange)
        }
    }, [])

    async function toggleFullscreen() {
        const el = document.documentElement as any
        const doc = document as any
        if (fsAvailable === "none") { setShowGuide(true); return }
        try {
            if (!doc.fullscreenElement && !doc.webkitFullscreenElement) {
                if (el.requestFullscreen) await el.requestFullscreen()
                else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen()
                else if (el.mozRequestFullScreen) el.mozRequestFullScreen()
            } else {
                if (doc.exitFullscreen) await doc.exitFullscreen()
                else if (doc.webkitExitFullscreen) doc.webkitExitFullscreen()
                else if (doc.mozCancelFullScreen) doc.mozCancelFullScreen()
            }
        } catch { setShowGuide(true) }
    }

    return { isFullscreen, fsAvailable, showGuide, setShowGuide, toggleFullscreen }
}

// ── Fullscreen guide modal ────────────────────────────────────
function FullscreenGuide(props: { onClose: () => void }) {
    const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent)
    const isAndroid = /Android/.test(navigator.userAgent)
    const steps = isIos
        ? ["Nhấn nút Chia sẻ (□↑) ở thanh dưới Safari", "Chọn \"Thêm vào Màn hình chính\"", "Mở app từ màn hình chính để dùng toàn màn hình"]
        : isAndroid
            ? ["Nhấn menu ⋮ góc trên phải trình duyệt", "Chọn \"Thêm vào màn hình chính\"", "Hoặc chọn \"Mở trong chế độ toàn màn hình\""]
            : ["Nhấn F11 để bật/tắt toàn màn hình", "Hoặc vào menu trình duyệt → Toàn màn hình"]
    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center"
            style={{ background: "rgba(0,0,0,0.8)" }}
            onClick={e => { if (e.target === e.currentTarget) props.onClose() }}>
            <div className="flex flex-col gap-[14px] mx-[20px] px-[20px] py-[18px]
                bg-[#1a1a1a] rounded-[16px] border border-white/15 max-w-[320px] w-full">
                <div className="flex items-center justify-between">
                    <span className="text-[15px] font-semibold text-white">Toàn màn hình</span>
                    <button onClick={props.onClose}
                        className="text-white/40 text-[18px] active:text-white/70">✕</button>
                </div>
                <div className="flex items-start gap-[8px] px-[12px] py-[10px]
                    bg-amber-500/10 border border-amber-500/30 rounded-[10px]">
                    <span className="text-[12px] text-amber-300 leading-relaxed">
                        Trình duyệt này không hỗ trợ API toàn màn hình tự động.
                        Làm theo hướng dẫn để mở thủ công:
                    </span>
                </div>
                <div className="flex flex-col gap-[8px]">
                    {steps.map((step, i) => (
                        <div key={i} className="flex items-start gap-[10px]">
                            <div className="flex-center w-[20px] h-[20px] rounded-full shrink-0
                                bg-white/10 text-white/50 text-[10px] font-bold mt-[1px]">{i + 1}</div>
                            <span className="text-[13px] text-white/70 leading-relaxed">{step}</span>
                        </div>
                    ))}
                </div>
                <button onClick={props.onClose}
                    className="w-full py-[10px] rounded-[10px] text-[13px] font-medium
                        bg-white/10 text-white/60 active:bg-white/20 transition-colors">
                    Đã hiểu
                </button>
            </div>
        </div>
    )
}

// ══════════════════════════════════════════════════════════════
// TYPES
// ══════════════════════════════════════════════════════════════

type AppMode = "match" | "break" | "countdown" | "test"

const MODE_LABEL: Record<AppMode, string> = {
    match: "Thi đấu",
    break: "Giải lao",
    countdown: "Đếm ngược",
    test: "Test mode",
}

const MODE_COLOR: Record<AppMode, string> = {
    match: "text-white/70",
    break: "text-blue-300",
    countdown: "text-amber-300",
    test: "text-amber-400",
}

// ══════════════════════════════════════════════════════════════
// SCORE ROW — một dòng điểm (icon + số + nút +/−)
// ══════════════════════════════════════════════════════════════

const POINT_ROWS: { type: PointType; icon?: any; label?: string }[] = [
    { type: "punch", icon: PunchI },
    { type: "trunkKick", icon: ArmorI },
    { type: "headKick", icon: HelmetI },
    { type: "spinTrunk", label: "4" },
    { type: "spinHead", label: "6" },
]

const scoreSize = "1.8rem"
const scoreColor = "white/70"

function ScoreRow(props: {
    side: "BLUE" | "RED"
    type: PointType
    icon?: any
    label?: string
    value: number
    onPlus: () => void
    onMinus: () => void
    disabled: boolean
}) {
    const isBlue = props.side === "BLUE"
    const accent = isBlue ? "rgba(0,136,255," : "rgba(255,56,59,"

    const BtnPlus = () => (
        <button
            disabled={props.disabled}
            onClick={props.onPlus}
            className={`flex-center w-[25px] h-[25px] rounded-[6px] text-[25px] text-white
                transition-colors active:scale-95
                ${props.disabled ? "opacity-30 cursor-not-allowed" : "active:opacity-80"}`}
            style={{ background: `${accent}0.5)` }}
        >+</button>
    )

    const BtnMinus = () => (
        <button
            disabled={props.disabled}
            onClick={props.onMinus}
            className={`flex-center w-[25px] h-[25px] rounded-[6px] text-[25px] rounded-[6px]
                text-white/40 transition-colors active:scale-95
                ${props.disabled ? "opacity-30 cursor-not-allowed" : "active:opacity-80"}`}
            style={{ background: `${accent}0.3)` }}
        >−</button>
    )

    const Icon = () => (
        props.icon
            ? <props.icon className="w-[18px] h-[18px]"
                style={{ color: `${accent}0.85)` }} />
            : <span className="flex-center text-[20px] w-[18px] font-bold"
                style={{ color: `${accent}0.85)` }}>{props.label}</span>
    )

    return (
        <div
            className="flex items-center px-[14px] py-[5px] rounded-[8px] gap-[10px]"
            style={{ background: `${accent}0.07)` }}
        >
            {isBlue ? (
                <>
                    <Icon />
                    <BtnMinus />
                    <span className={`flex-1 text-center font-bold
                        font-variant-numeric tabular-nums text-${scoreColor}`}
                        style={{ fontSize: scoreSize }}>
                        {props.value}
                    </span>
                    <BtnPlus />
                </>
            ) : (
                <>
                    <BtnPlus />
                    <span className={`flex-1 text-center font-bold
                        font-variant-numeric tabular-nums text-${scoreColor}`}
                        style={{ fontSize: scoreSize }}>
                        {props.value}
                    </span>
                    <BtnMinus />
                    <Icon />
                </>
            )}
        </div>
    )
}

// ══════════════════════════════════════════════════════════════
// GJ ROW — hàng gam-jeom riêng biệt
// ══════════════════════════════════════════════════════════════

function GjRow(props: {
    label: string
    side: "BLUE" | "RED"
    value: number
    onPlus: () => void
    onMinus: () => void
    disabled: boolean
}) {
    const isBlue = props.side === "BLUE"
    return (
        <div className="flex items-center px-[14px] py-[5px] rounded-[8px] gap-[10px] min-w-0 bg-white/10">
            {isBlue ? (
                <>
                    <span className="flex-center w-[20px] text-[18px] font-bold text-white/60">{props.label}</span>
                    <button disabled={props.disabled} onClick={props.onMinus}
                        className="flex-center w-[25px] h-[25px] text-[25px] rounded-[6px]
                            text-white/40 bg-white/10 active:scale-95 disabled:opacity-30">−</button>
                    <span className={`flex-1 text-center font-bold 
                            font-variant-numeric tabular-nums text-${scoreColor}`}
                        style={{ fontSize: scoreSize }}>
                        {props.value}
                    </span>
                    <button disabled={props.disabled} onClick={props.onPlus}
                        className="flex-center w-[25px] h-[25px] text-[25px] rounded-[6px]
                            text-white bg-white/20 active:scale-95 disabled:opacity-30">+</button>
                </>
            ) : (
                <>
                    <button disabled={props.disabled} onClick={props.onPlus}
                        className="flex-center w-[25px] h-[25px] text-[25px] rounded-[6px]
                            text-white bg-white/20 active:scale-95 disabled:opacity-30">+</button>
                    <span className={`flex-1 text-center font-bold 
                            font-variant-numeric tabular-nums text-${scoreColor}`}
                        style={{ fontSize: scoreSize }}>
                        {props.value}
                    </span>
                    <button disabled={props.disabled} onClick={props.onMinus}
                        className="flex-center w-[25px] h-[25px] text-[25px] rounded-[6px]
                                text-white/40 bg-white/10 active:scale-95 disabled:opacity-30">−</button>
                    <span className="flex-center w-[20px] text-[18px] font-bold text-white/60">{props.label}</span>
                </>
            )}
        </div>
    )
}

// ══════════════════════════════════════════════════════════════
// MODE SELECTOR — dropdown chọn mode
// ══════════════════════════════════════════════════════════════

function ModeSelector(props: {
    current: AppMode
    onChange: (m: AppMode) => void
}) {
    const [open, setOpen] = useState(false)
    const ref = useRef<HTMLDivElement>(null)

    useEffect(() => {
        if (!open) return
        function handleClick(e: MouseEvent) {
            if (ref.current && !ref.current.contains(e.target as Node))
                setOpen(false)
        }
        document.addEventListener("mousedown", handleClick)
        return () => document.removeEventListener("mousedown", handleClick)
    }, [open])

    const MODES: AppMode[] = ["match", "break", "countdown", "test"]

    return (
        <div ref={ref} className="relative">
            <button
                onClick={() => setOpen(o => !o)}
                className={`flex items-center gap-[4px] px-[8px] py-[3px] rounded-[8px]
                    text-[10px] font-semibold tracking-wide bg-white/10 transition-colors
                    active:bg-white/20 ${MODE_COLOR[props.current]}`}
            >
                {MODE_LABEL[props.current]}
                <span className="text-[8px] text-white/30">▼</span>
            </button>

            {open && (
                <div className="absolute bottom-[110%] left-1/4 -translate-x-1/2
                    bg-[#1a1a1a] border border-white/15 rounded-[12px]
                    overflow-hidden z-50 w-[130px] shadow-lg">
                    {MODES.map(m => (
                        <button
                            key={m}
                            onClick={() => { props.onChange(m); setOpen(false) }}
                            className={`flex items-center gap-[8px] w-full px-[12px] py-[9px]
                                text-[12px] font-medium transition-colors active:bg-white/10
                                ${props.current === m ? "bg-white/10" : "hover:bg-white/5"}`}
                        >
                            <div className={`w-[6px] h-[6px] rounded-full shrink-0
                                ${m === "test" ? "bg-amber-400" :
                                    m === "countdown" ? "bg-amber-300" :
                                        m === "break" ? "bg-blue-300" :
                                            "bg-green-400"}`}
                            />
                            <span className={MODE_COLOR[m]}>{MODE_LABEL[m]}</span>
                            {props.current === m && (
                                <span className="ml-auto text-white/40 text-[10px]">✓</span>
                            )}
                        </button>
                    ))}
                </div>
            )}
        </div>
    )
}

// ══════════════════════════════════════════════════════════════
// ROUND INDICATOR — hiệp thắng best-of-3
// ══════════════════════════════════════════════════════════════

function RoundIndicator(props: {
    currentRound: number
    blueWins: number
    redWins: number
    side: "BLUE" | "RED"
}) {
    const wins = props.side === "BLUE" ? props.blueWins : props.redWins
    const isBlue = props.side === "BLUE"

    return (
        <div className={`flex items-center gap-[4px] px-[6px] py-[2px]
            ${isBlue ? "justify-start" : "flex-row-reverse"}`}>
            <span className="text-[9px] font-semibold text-white/30 tracking-wider mr-[2px]">
                THẮNG
            </span>
            {[1, 2].map(i => {
                const won = wins >= i
                const isCurrent = props.currentRound === i
                return (
                    <div
                        key={i}
                        className={`flex-center rounded-full text-[8px] font-bold transition-all
                            ${isCurrent
                                ? "w-[16px] h-[16px] border border-white/30 text-white/40"
                                : won
                                    ? `w-[16px] h-[16px] ${isBlue ? "bg-blue-500" : "bg-red-500"} text-white`
                                    : "w-[14px] h-[14px] bg-white/10 text-white/20"
                            }`}
                    >
                        {i}
                    </div>
                )
            })}
        </div>
    )
}

// ══════════════════════════════════════════════════════════════
// SCORE PANEL — điểm lớn + camera icon
// ══════════════════════════════════════════════════════════════

function ScorePanel(props: {
    side: Side
    total: number
    isLeading: boolean
    cameraOn?: boolean
    onCameraClick?: () => void
}) {
    const isBlue = props.side === "blue"
    const bg = isBlue
        ? "linear-gradient(180deg,#0800A3,#050069)"
        : "linear-gradient(180deg,#9F0000,#740707)"
    const radius = isBlue
        ? "0 var(--border-radius-medium) var(--border-radius-medium) 0"
        : "var(--border-radius-medium) 0 0 var(--border-radius-medium)"

    return (
        <div
            className={`grid ${props.side === "red" ? "[direction:rtl]" : ""}`}
            style={{
                background: bg,
                borderRadius: radius,
                gridTemplateRows: "1fr 5fr 2fr",
                gridTemplateColumns: "1fr 3fr 1fr",
                minHeight: "90px",
            }}
        >
            <JudgePressStack
                side={props.side}
                judgesNum={3}
                voteThreshold={2}
                className={`row-span-3 ${props.side === "blue" ? "pl-[8px]" : "pr-[8px]"}`}
            />

            <div />
            <div className="row-span-3" />

            <div className="flex justify-center items-center">
                <span
                    className="font-score font-bold leading-none font-variant-numeric tabular-nums"
                    style={{
                        fontSize: "clamp(2rem,14vw,4.5rem)",
                        color: props.isLeading ? "#FFD700" : "white",
                        transition: "color 0.3s",
                    }}
                >
                    {props.total}
                </span>
            </div>
            <div className="flex justify-center items-center pb-[6px]">
                <button
                    onClick={props.onCameraClick}
                    className={`flex items-center gap-[5px] px-[8px] py-[4px]
                        rounded-full transition-all active:scale-90
                        ${props.cameraOn
                            ? "bg-white/15 text-white/70 active:bg-white/25"
                            : "bg-white/5  text-white/25 active:bg-white/10"
                        }`}
                >
                    {props.cameraOn
                        ? <CameraI className="w-[13px] h-[13px]" />
                        : <CameraOffI className="w-[13px] h-[13px]" />
                    }
                    <span className="text-[9px] font-semibold tracking-wide uppercase">
                        IVR
                    </span>
                </button>
            </div>

        </div>
    )
}

// ══════════════════════════════════════════════════════════════
// CLOCK PANEL — đồng hồ + label hiệp
// ══════════════════════════════════════════════════════════════

export function getTimeString(ms: number) {
    if (ms < 10000) return (ms / 1000).toFixed(2)
    const min = Math.floor(ms / 60000)
    const sec = Math.floor((ms % 60000) / 1000)

    return `${min}:${sec.toString().padStart(2, "0")}`
}

function ClockPanel(props: {
    roundNo: number
    remainingMs: number
    duration: number
    isRunning: boolean
    mode: AppMode
    onToggle: () => void
}) {
    let timeStr: string

    timeStr = getTimeString(props.remainingMs)

    const borderColor =
        props.mode === "test" ? "#F59E0B" :
            props.mode === "countdown" ? "#F59E0B" :
                props.mode === "break" ? "#60A5FA" : "#FFD700"

    const statusLabel =
        !props.isRunning && props.remainingMs === props.duration ? "BẮT ĐẦU" :
            props.isRunning ? "ĐANG CHẠY" :
                props.remainingMs === 0 ? "HẾT GIỜ" : "TẠM DỪNG"

    const statusBg =
        !props.isRunning && props.remainingMs === props.duration ? "bg-white/20" :
            props.isRunning ? "bg-[#FFD700]" :
                props.remainingMs === 0 ? "bg-red-500" : "bg-white/30"

    const statusText =
        props.isRunning ? "text-black" : "text-white"

    const roundLabel =
        props.mode === "break" ? "GIẢI LAO" :
            props.mode === "countdown" ? "ĐẾM NGƯỢC" :
                props.mode === "test" ? "TEST" :
                    `HIỆP ${props.roundNo}`

    return (
        <button
            onClick={props.onToggle}
            className="grid rounded-[10px] overflow-hidden select-none active:scale-95 transition-transform"
            style={{
                gridTemplateRows: "1fr 2.5fr 1fr",
                border: `2px solid ${props.isRunning ? borderColor : "white"}`,
            }}
        >
            <div className="flex justify-center items-center text-[10px] font-bold text-white/50 tracking-wider pt-[2px]">
                {roundLabel}
            </div>
            <div
                className="flex justify-center items-center font-score font-bold leading-none tabular-nums"
                style={{
                    fontSize: "clamp(1.6rem,9vw,3rem)",
                    color: !props.isRunning && props.mode === "match" ? "white" : borderColor,
                }}
            >
                {timeStr}
            </div>
            <div className={`flex-center text-[9px] font-bold ${statusBg} ${statusText} tracking-wider`}>
                {statusLabel}
            </div>
        </button>
    )
}

export function FullscreenToggle(props: {
    onToggle: () => void
    isFullscreen: boolean
}) {
    return (
        <button
            onClick={props.onToggle}
            className="flex justify-center items-center active:opacity-60 transition-opacity"
            title={props.isFullscreen ? "Thoát toàn màn hình" : "Toàn màn hình"}
        >
            {props.isFullscreen ? (
                <svg className="h-[18px] w-[18px]" fill="none" viewBox="0 0 24 24"
                    stroke="rgba(255,255,255,0.5)" strokeWidth={2}>
                    <path d="M8 3v3a2 2 0 0 1-2 2H3" /><path d="M21 8h-3a2 2 0 0 1-2-2V3" />
                    <path d="M3 16h3a2 2 0 0 1 2 2v3" /><path d="M16 21v-3a2 2 0 0 1 2-2h3" />
                </svg>
            ) : (
                <svg className="h-[18px] w-[18px]" fill="none" viewBox="0 0 24 24"
                    stroke="rgba(255,255,255,0.5)" strokeWidth={2}>
                    <path d="M3 8V5a2 2 0 0 1 2-2h3" /><path d="M16 3h3a2 2 0 0 1 2 2v3" />
                    <path d="M21 16v3a2 2 0 0 1-2 2h-3" /><path d="M8 21H5a2 2 0 0 1-2-2v-3" />
                </svg>
            )}
        </button>
    )
}

function PtgNoticeDialog(props: {
    winner?: Side
    gap: number
    totalBlue: number
    totalRed: number
    onConfirm: () => void   // Xác nhận thắng hiệp theo PTG
    onDismiss: () => void   // Bỏ qua — tiếp tục thi đấu
}) {
    const isBlue = props.winner === "blue"
    const winnerLabel = isBlue ? "XANH" : "ĐỎ"
    const accentCls = isBlue ? "text-blue-400" : "text-red-400"
    const borderCls = isBlue ? "border-blue-500/50" : "border-red-500/50"
    const bgCls = isBlue ? "bg-blue-950/90" : "bg-red-950/90"

    return (
        <motion.div
            className="fixed inset-0 z-[150] flex items-center justify-center px-[20px]"
            style={{ background: "rgba(0,0,0,0.75)" }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
        >
            <motion.div
                className={`w-full max-w-[340px] rounded-[20px] border-2 ${borderCls} ${bgCls}
                    flex flex-col overflow-hidden`}
                initial={{ scale: 0.88, y: 24 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.88, y: 24 }}
                transition={{ type: "spring", stiffness: 340, damping: 28 }}
            >
                {/* Header */}
                <div className={`flex flex-col items-center gap-[4px] px-[20px] pt-[22px] pb-[14px]`}>
                    <span className="text-[11px] font-semibold text-white/40 tracking-widest uppercase">
                        Điểm cách biệt — PTG
                    </span>
                    <span className={`text-[28px] font-black ${accentCls} leading-tight`}>
                        {winnerLabel} dẫn {props.gap} điểm
                    </span>
                    <div className="flex items-baseline gap-[10px] mt-[2px]">
                        <span className="font-score font-bold text-[22px] text-blue-300">
                            {props.totalBlue}
                        </span>
                        <span className="text-white/30 text-[14px]">–</span>
                        <span className="font-score font-bold text-[22px] text-red-300">
                            {props.totalRed}
                        </span>
                    </div>
                </div>

                <div className="h-[1px] bg-white/10 mx-[20px]" />

                <p className="text-[12px] text-white/50 text-center px-[20px] py-[12px] leading-relaxed">
                    Cách biệt đạt ngưỡng PTG. Xác nhận để kết thúc hiệp,
                    hoặc bỏ qua để tiếp tục thi đấu.
                </p>

                {/* Buttons */}
                <div className="grid grid-cols-2 border-t border-white/10">
                    <button
                        onClick={props.onDismiss}
                        className="py-[14px] text-[13px] font-medium text-white/40
                            border-r border-white/10 active:bg-white/5 transition-colors"
                    >
                        Bỏ qua
                    </button>
                    <button
                        onClick={props.onConfirm}
                        className={`py-[14px] text-[14px] font-bold transition-colors
                            active:opacity-80
                            ${isBlue ? "text-blue-400" : "text-red-400"}`}
                    >
                        ✓ Xác nhận PTG
                    </button>
                </div>
            </motion.div>
        </motion.div>
    )
}

// ══════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ══════════════════════════════════════════════════════════════

export default function MobileOperator() {
    // ── State ──────────────────────────────────────────────
    const [courtId, setCourtId] = useState("1")
    const [roundWinner, setRoundWinner] = useState<RoundWinner>({ totalBlue: 0, totalRed: 0, winner: null })
    const [blueScore, setBlueScore] = useState<ScoreBreakdown>(emptyBreakdown())
    const [redScore, setRedScore] = useState<ScoreBreakdown>(emptyBreakdown())

    const [remainingMs, setRemainingMs] = useState(120_000)
    const [roundMs, setRoundMs] = useState(120_000)
    const [timerRunning, setTimerRunning] = useState(false)
    const [roundNo, setRoundNo] = useState(1)
    const [blueWins, setBlueWins] = useState(0)
    const [redWins, setRedWins] = useState(0)
    const [judgeCount, setJudgeCount] = useState(0)
    const [latencyMs, setLatencyMs] = useState<number | null>(null)

    const [pointGap, setPointGap] = useState<number>(15)
    const [pointGapEnabled, setPointGapEnabled] = useState<boolean>(true)

    const [mode, setMode] = useState<AppMode>("match")
    const { isFullscreen, fsAvailable, showGuide, setShowGuide, toggleFullscreen } = useFullscreen()
    const [ivrSide, setIvrSide] = useState<"BLUE" | "RED" | null>(null)
    const [ivrState, setIvrState] = useState<IvrState>(() => createDefaultIvrState(1))
    const [settingVisible, setSettingVisible] = useState(false)
    const [quickAccessVisible, setQuickAccessVisible] = useState(false)
    const [timePickerVisible, setTimePickerVisible] = useState(false)
    const [ptgDialogVisible, setPtgDialogVisible] = useState(false)

    // Sử dụng để cuộn thẻ chứa các Point Editor xuống dưới cùng
    const containerRef = useRef<HTMLDivElement>(null)
    useEffect(() => {
        const handleResize = () => {
            const el = containerRef.current
            if (el) {
                el.scrollTop = el.scrollHeight
            }
        }

        const observer = new ResizeObserver(handleResize)
        if (containerRef.current) observer.observe(containerRef.current)

        return () => { observer.disconnect() }
    }, [])

    useEffect(() => {
        const scoreResult = inferRoundWinner(blueScore, redScore)
        setRoundWinner(scoreResult)

        if (pointGapEnabled && Math.abs(scoreResult.totalBlue - scoreResult.totalRed) >= pointGap) {
            const winner: Side = scoreResult.totalBlue > scoreResult.totalRed ? "blue" : "red"
            const socket = getSingletonSocket()
            if (timerRunning) setPtgDialogVisible(true)
            socket.emit("timer:stop", { courtId }, () => {
                socket.emit("round:winner:set", { courtId, winner, winCode: "PTG" })
            })
        }
    }, [blueScore, redScore, pointGapEnabled, pointGap])

    // ── Socket ──────────────────────────────────────────────
    useEffect(() => {
        const socket = getSingletonSocket()

        const onConnect = () => {
            socket.emit("court:join", { courtId })

            socket.emit("rounds:get", { courtId }, (round?: RoundResult) => {
                if (round) {
                    setBlueScore(round.blueBreakdown)
                    setRedScore(round.redBreakdown)
                    return
                }

                socket.emit("match:create", { courtId }, () => {
                    socket.emit("match:currentRound:get", { courtId }, (currentRound?: any) => {
                        socket.emit("rounds:create", { courtId, roundNo: 1 }, () => {
                            socket.emit("rounds:switch", { courtId, currentRound: 1 })
                        })
                    })
                })
            })

            socket.emit("timer:remainingMs:get", { courtId }, (ms?: number) => {
                if (ms === undefined || ms === null)
                    socket.emit("timer:create", { courtId, roundMs })
                else setRemainingMs(ms)
            })

            socket.emit("timer:isRunning:get", { courtId }, (isRunning?: boolean) => {
                setTimerRunning(Boolean(isRunning))
            })

            socket.emit("test:get", { courtId }, (isTest: boolean) => {
                if (isTest) setMode("test")
            })

            socket.emit("match:config:get", { courtId }, (c: any) => {
                if (!c) {
                    socket.emit("match:config:set", {
                        courtId, config: {
                            pointGap,
                            pointGapEnabled
                        }
                    })
                    return
                }
                if (c.pointGap) setPointGap(c.pointGap)
                if (c.pointGapEnabled !== undefined) setPointGapEnabled(c.pointGapEnabled)
            })

            return
            // Nhận courtId VÀ JWT token từ server
            socket.emit("court:create", (id: string, token: string) => {
                setCourtId(id)
                if (token) setAuthToken(token)
                // Khởi tạo match sau khi có JWT (server cần auth để init)
                socket.emit("match:init")
            })
        }

        if (socket.connected) onConnect()
        else socket.once("connect", onConnect)

        socket.on("score:blue:update", (data: { breakdown: any }) => {
            setBlueScore(data.breakdown)
        })

        socket.on("score:red:update", (data: { breakdown: any }) => {
            setRedScore(data.breakdown)
        })

        socket.on("score:reset", () => {
            setBlueScore(emptyBreakdown())
            setRedScore(emptyBreakdown())
        })

        socket.on("timer:remainingMs:update", (data: { remainingMs: number }) => {
            setRemainingMs(data.remainingMs)
            if (data.remainingMs === 0) setTimerRunning(false)
        })

        socket.on("timer:isRunning:update", (data: { isRunning: boolean }) => {
            setTimerRunning(data.isRunning)
        })

        socket.on("timer:roundMs:update", (data: { roundMs: number }) => {
            setRoundMs(data.roundMs)
        })

        socket.on("score:mode:update", (data: { mode: AppMode }) => {
            setMode(data.mode)
        })

        // socket.on("round:winner:update", (d: { winner: Side }) => {
        //     setRoundWinner(prev => ({ ...prev, winner: d.winner }))
        // })

        // Latency ping
        const pingInterval = setInterval(() => {
            const start = Date.now()
            socket.emit("ping", () => setLatencyMs(Date.now() - start))
        }, 3000)

        return () => {
            socket.off("score:updated")
            socket.off("timer:updated")
            socket.off("timer:running:updated")
            socket.off("timer:duration:updated")
            clearInterval(pingInterval)
        }
    }, [])

    // ── Actions ────────────────────────────────────────────
    const canScore = mode === "match" && !timerRunning || mode === "test"

    function emitScore(side: Side, pointType: PointType, value: "increase" | "decrease") {
        if (!canScore) return

        getSingletonSocket().emit("score:operator:update", {
            courtId,
            side,
            pointType,
            value
        })
    }

    function toggleTimer() {
        const socket = getSingletonSocket()
        if (timerRunning) {
            socket.emit("timer:stop", { courtId })
        } else if (remainingMs > 0) {
            socket.emit("timer:run", { courtId })
        } else {
            socket.emit("timer:remainingMs:update", { courtId, remainingMs: roundMs })
        }
    }

    // ── Test mode overlay ──────────────────────────────────
    // ── IVR helpers ─────────────────────────────────────────────
    function formatRemaining(): string {
        const min = Math.floor(remainingMs / 60000)
        const sec = Math.floor((remainingMs % 60000) / 1000)
        return `${min}:${sec.toString().padStart(2, "0")}`
    }

    // ── Render ──────────────────────────────────────────────────
    const isTest = mode === "test"
    const outerStyle = isTest
        ? { outline: "3px solid #F59E0B", outlineOffset: "-3px", }
        : {}

    // ── Render ─────────────────────────────────────────────
    return (
        <div
            className="relative flex flex-col justify-between gap-[6px] w-screen h-dvh overflow-hidden select-none bg-[#111111]"
            style={{
                // background: `
                //     linear-gradient(180deg, #00000000 0%, #00000050 20%, #000000 100%),
                //     linear-gradient(270deg, #A30000 0%, #57004A 48%, #43005D 52%, #00009F 100%)
                // `,
                color: "white",
                ...outerStyle
            }}
        >
            {/* Test mode banner */}
            {isTest && (
                <div className="absolute top-0 left-0 right-0 flex-center py-[3px]
                    bg-amber-500/30 text-amber-300 text-[10px] font-bold tracking-widest z-10">
                    TEST MODE — điểm không được tính thật
                </div>
            )}

            {ptgDialogVisible &&
                <PtgNoticeDialog
                    winner={roundWinner.winner || undefined}
                    onConfirm={() => setPtgDialogVisible(false)}
                    onDismiss={() => setPtgDialogVisible(false)}
                    totalBlue={roundWinner.totalBlue}
                    totalRed={roundWinner.totalRed}
                    gap={Math.abs(roundWinner.totalBlue - roundWinner.totalRed)}
                />}

            {/* Overlays */}
            {settingVisible && (
                <MobileSetting
                    onClose={() => setSettingVisible(false)}
                    roundMs={roundMs}
                    onRoundMsChanged={setRoundMs}
                    pointGap={pointGap}
                    onPointGapChanged={newPt => {
                        getSingletonSocket().emit("match:config:set", { courtId, config: { pointGap: newPt } })
                        setPointGap(newPt)
                    }}
                    pointGapEnabled={pointGapEnabled}
                    onApplyPTGChanged={v => {
                        getSingletonSocket().emit("match:config:set", { courtId, config: { pointGapEnabled: v } })
                        setPointGapEnabled(v)
                    }}
                />
            )}

            {quickAccessVisible &&
                <QuickAccessSheet
                    courtId={courtId}
                    roundMs={roundMs}
                    onClose={() => setQuickAccessVisible(false)}
                    onClearScore={() => {
                        const socket = getSingletonSocket()
                        socket.emit("score:operator:clear", { courtId })
                        socket.emit("timer:stop", { courtId }, () => {
                            socket.emit("timer:remainingMs:update", {
                                courtId,
                                remainingMs: roundMs,
                            })
                        })
                    }}
                />
            }

            {/* IVR overlay */}
            {ivrSide && (
                <div className="fixed inset-0 z-[60] flex flex-col"
                    style={{ background: "#111" }}>
                    <IvrPanel
                        state={ivrState}
                        roundNo={roundNo}
                        timeLabel={formatRemaining()}
                        onClose={() => setIvrSide(null)}
                        onChange={setIvrState}
                    />
                </div>
            )}

            {showGuide && <FullscreenGuide onClose={() => setShowGuide(false)} />}

            {/* ── HEADER: trạng thái kết nối ── */}
            <div className="flex items-center justify-between px-[12px] py-[6px]
                bg-black/30 text-[11px]">
                <div className="flex items-center gap-[6px] text-white/50">
                    <WifiI className="h-[10px]" />
                    <span>{latencyMs !== null ? `${latencyMs}ms` : "–"}</span>
                    <span className="text-white/30">·</span>
                    <span>Sân {courtId}</span>
                </div>
                <div className="flex items-center gap-[5px]">
                    {Array.from({ length: 3 }).map((_, i) => (
                        <JudgeI
                            key={i}
                            className="h-[10px]"
                            style={{ opacity: i < judgeCount ? 1 : 0.2 }}
                        />
                    ))}
                </div>
                <span className="text-white/30 text-[10px] truncate max-w-[100px]">
                    Chung kết · 58KG
                </span>
            </div>


            {timePickerVisible &&
                <div
                    className="absolute w-full h-full p-[5px] bg-[#000000cb] flex flex-col gap-[50px] justify-center items-center"
                    onClick={e => { if (e.target === e.currentTarget) setTimePickerVisible(false) }}
                >
                    <TimePicker
                        initTimeMs={remainingMs}
                        onSubmit={(ms) => {
                            if (ms !== undefined) getSingletonSocket().emit("timer:remainingMs:update", { courtId, remainingMs: ms })
                            setTimePickerVisible(false)
                        }} />

                    <button
                        className="flex-center px-[20px] py-[14px] rounded-[12px] text-[13px]
                        font-semibold bg-white text-black active:scale-95 transition-transform
                        min-w-[80px] shadow-md"
                        onClick={() => {
                            getSingletonSocket().emit("timer:remainingMs:update", { courtId, remainingMs: roundMs })
                            setTimePickerVisible(false)
                        }}
                    >
                        Đặt lại {`${getTimeString(roundMs)}s`}
                    </button>
                </div>
            }

            <div className="flex flex-col gap-[20px]">
                {/* ── SCORE + CLOCK ── */}
                <div
                    className="grid px-[0px]"
                    style={{
                        gridTemplateColumns: "1fr 96px 1fr",
                        gap: "0 4px",
                    }}
                >
                    {/* Round wins — blue */}
                    <RoundIndicator
                        currentRound={roundNo}
                        blueWins={blueWins}
                        redWins={redWins}
                        side="BLUE"
                    />
                    <div />
                    {/* Round wins — red */}
                    <RoundIndicator
                        currentRound={roundNo}
                        blueWins={blueWins}
                        redWins={redWins}
                        side="RED"
                    />

                    {/* Score blue */}
                    <ScorePanel
                        side="blue"
                        total={roundWinner.totalBlue}
                        isLeading={roundWinner.winner === "blue"}
                        cameraOn={ivrState.blue.remaining > 0}
                        onCameraClick={() => setIvrSide("BLUE")}
                    />

                    {/* Clock */}
                    <ClockPanel
                        roundNo={roundNo}
                        remainingMs={remainingMs}
                        duration={roundMs}
                        isRunning={timerRunning}
                        mode={mode}
                        onToggle={() => {
                            if (timerRunning)
                                getSingletonSocket().emit("timer:stop", { courtId }, () => {
                                    setTimePickerVisible(true)
                                })
                            else
                                setTimePickerVisible(true)
                        }}
                    />

                    {/* Score red */}
                    <ScorePanel
                        side="red"
                        total={roundWinner.totalRed}
                        isLeading={roundWinner.winner === "red"}
                        cameraOn={ivrState.red.remaining > 0}
                        onCameraClick={() => setIvrSide("RED")}
                    />
                </div>

                {/* ── TIMER CONTROLS ── */}
                <div className="grid grid-cols-[1fr_1fr_1fr] px-[10px] py-[15px]
                bg-white/5 rounded-[12px] mx-[8px]">

                    {/* Hiệp indicator */}
                    <div className="flex flex-col gap-[3px]">
                        <span className="text-[9px] font-semibold text-white/30 tracking-wider">HIỆP</span>
                        <div className="flex items-center gap-[4px]">
                            {[1, 2, 3].map(i => (
                                <div
                                    key={i}
                                    className={`flex-center w-[18px] h-[18px] rounded-full text-[9px] font-bold
                                    transition-all
                                    ${i === roundNo
                                            ? "bg-amber-400 text-black"
                                            : i < roundNo
                                                ? "bg-white/25 text-white/60"
                                                : "bg-white/8 text-white/25"
                                        }`}
                                >
                                    {i}
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Play/Stop button */}
                    <button
                        onClick={toggleTimer}
                        className="flex-center px-[20px] py-[18px] rounded-[12px] text-[13px]
                        font-semibold bg-white text-black active:scale-95 transition-transform
                        min-w-[80px] shadow-md"
                    >
                        {timerRunning ? "Dừng lại" :
                            remainingMs === roundMs ? "Bắt đầu" :
                                remainingMs <= 0 ? "Đặt lại" : "Tiếp tục"}
                    </button>

                    {/* Mode selector */}
                    <div className="flex flex-col items-end gap-[3px]">
                        <span className="text-[9px] font-semibold text-white/30 tracking-wider">CHẾ ĐỘ</span>
                        <ModeSelector current={mode} onChange={(m) => {
                            const socket = getSingletonSocket()
                            if (m === "test") socket.emit("test:open", { courtId })
                            else socket.emit("test:close", { courtId })
                        }} />
                    </div>
                </div>
            </div>


            {/* ── POINT EDITORS ── */}
            <div className="flex-1 flex flex-col gap-[10px] px-[8px] min-h-0">

                <div className="grid grid-cols-[1fr_1fr] gap-x-[6px] gap-y-[4px]">
                    <div className="flex items-center px-[14px] rounded-[8px] gap-[10px] min-w-0 bg-white/5">
                        <span className="w-[18px] text-[16px] font-bold text-white/60">
                            GJ
                        </span>
                        <div className="w-[25px]" />
                        <span className="flex-1 text-center font-bold text-amber-300
                            font-variant-numeric tabular-nums"
                            style={{ fontSize: scoreSize, color: blueScore.gamjeom + blueScore.eejeom >= 4 ? "rgba(255,56,59,85)" : undefined }}>
                            {blueScore.gamjeom + blueScore.eejeom}
                        </span>
                        <div className="w-[25px]" />
                    </div>

                    <div className="flex flex-row-reverse items-center px-[14px] rounded-[8px] gap-[10px] min-w-0 bg-white/5">
                        <span className="flex flex-row-reverse w-[18px] text-[16px] font-bold text-white/60">
                            GJ
                        </span>
                        <div className="w-[25px]" />
                        <span className="flex-1 text-center font-bold text-amber-300
                            font-variant-numeric tabular-nums"
                            style={{ fontSize: scoreSize, color: redScore.gamjeom + redScore.eejeom >= 4 ? "rgba(255,56,59,85)" : undefined }}>
                            {redScore.gamjeom + redScore.eejeom}
                        </span>
                        <div className="w-[25px]" />
                    </div>

                    <GjRow
                        label="1"
                        side="BLUE"
                        value={redScore.gamjeom}
                        onPlus={() => emitScore("red", "gamjeom", "increase")}
                        onMinus={() => emitScore("red", "gamjeom", "decrease")}
                        disabled={!canScore}
                    />
                    <GjRow
                        label="1"
                        side="RED"
                        value={blueScore.gamjeom}
                        onPlus={() => emitScore("blue", "gamjeom", "increase")}
                        onMinus={() => emitScore("blue", "gamjeom", "decrease")}
                        disabled={!canScore}
                    />
                    <GjRow
                        label="2"
                        side="BLUE"
                        value={redScore.eejeom}
                        onPlus={() => emitScore("red", "eejeom", "increase")}
                        onMinus={() => emitScore("red", "eejeom", "decrease")}
                        disabled={!canScore}
                    />
                    <GjRow
                        label="2"
                        side="RED"
                        value={blueScore.eejeom}
                        onPlus={() => emitScore("blue", "eejeom", "increase")}
                        onMinus={() => emitScore("blue", "eejeom", "decrease")}
                        disabled={!canScore}
                    />
                </div>

                <div ref={containerRef} className="flex-1 flex gap-[6px] overflow-y-auto">
                    <div className="flex-1 flex flex-col gap-[4px] min-w-0">
                        {POINT_ROWS.map(row => (
                            <ScoreRow
                                key={row.type}
                                side="BLUE"
                                type={row.type}
                                icon={row.icon}
                                label={row.label}
                                value={blueScore[row.type]}
                                onPlus={() => emitScore("blue", row.type, "increase")}
                                onMinus={() => emitScore("blue", row.type, "decrease")}
                                disabled={!canScore}
                            />
                        ))}
                    </div>

                    <div className="flex-1 flex flex-col gap-[4px] min-w-0">
                        {POINT_ROWS.map(row => (
                            <ScoreRow
                                key={row.type}
                                side="RED"
                                type={row.type}
                                icon={row.icon}
                                label={row.label}
                                value={redScore[row.type]}
                                onPlus={() => emitScore("red", row.type, "increase")}
                                onMinus={() => emitScore("red", row.type, "decrease")}
                                disabled={!canScore}
                            />
                        ))}
                    </div>

                </div>

            </div>

            {/* ── BOTTOM TOOLBAR ── */}
            <div className="grid grid-cols-[1fr_1fr_1fr] px-[16px] py-[10px] bg-black/40">
                {/* Fullscreen button */}
                <FullscreenToggle onToggle={toggleFullscreen} isFullscreen={isFullscreen} />

                {/* Quick Access pill */}
                <button
                    className="flex justify-center items-start active:opacity-60 transition-opacity pt-[2px]"
                    onClick={() => setQuickAccessVisible(true)}
                >
                    <div className="rounded-full w-[50px] h-[5px] bg-white/30" />
                </button>

                {/* Settings */}
                <button
                    className="flex justify-center items-center active:opacity-60 transition-opacity"
                    onClick={() => setSettingVisible(true)}
                >
                    <NutI className="h-[18px] text-white/50" />
                </button>
            </div>
        </div>
    )
}

function QuickAccessSheet(props: {
    courtId: string
    roundMs: number
    onClose: () => void
    onClearScore: () => void
}) {
    const dragControls = useDragControls()
    const sheetControls = useAnimation()
    const sheetRef = useRef<HTMLDivElement>(null)

    const SHEET_CLOSE_OFFSET_RATIO = 0.35
    const SHEET_CLOSE_VELOCITY = 600

    useEffect(() => {
        sheetControls.start({
            y: 0,
            transition: { type: "spring", stiffness: 350, damping: 35 },
        })
    }, [])

    function handleDragEnd(
        _: any,
        info: { offset: { y: number }; velocity: { y: number } }
    ) {
        const sheetHeight = sheetRef.current?.offsetHeight ?? 0
        const shouldClose =
            info.offset.y > sheetHeight * SHEET_CLOSE_OFFSET_RATIO ||
            info.velocity.y > SHEET_CLOSE_VELOCITY

        if (shouldClose) {
            props.onClose()
        } else {
            sheetControls.start({
                y: 0,
                transition: { type: "spring", stiffness: 350, damping: 35 },
            })
        }
    }

    return (
        <motion.div
            className="fixed inset-0 z-50 flex flex-col justify-end bg-black/60"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={(e) => {
                if (e.target === e.currentTarget) props.onClose()
            }}
        >
            <motion.div
                ref={sheetRef}
                className="flex flex-col rounded-t-[20px] bg-[#111] overflow-hidden"
                style={{ height: "85dvh", touchAction: "pan-y" }}
                initial={{ y: "100%" }}
                animate={sheetControls}
                exit={{ y: "100%" }}
                drag="y"
                dragControls={dragControls}
                dragListener={false}
                dragConstraints={{ top: 0 }}
                dragElastic={{ top: 0, bottom: 0.3 }}
                onDragEnd={handleDragEnd}
            >
                <div
                    className="flex-center pt-[15px] pb-[20px] cursor-grab active:cursor-grabbing shrink-0"
                    style={{ touchAction: "none" }}
                    onPointerDown={(e) => dragControls.start(e)}
                    onClick={props.onClose}
                >
                    <div className="w-[50px] h-[5px] rounded-full bg-white/20" />
                </div>

                <div className="flex-1 overflow-hidden" style={{ touchAction: "pan-y" }}>
                    <QuickAccess courtId={props.courtId} onClearScore={props.onClearScore} />
                </div>
            </motion.div>
        </motion.div>
    )
}