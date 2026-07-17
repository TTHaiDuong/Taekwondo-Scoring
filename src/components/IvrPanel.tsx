"use client"

import { useState } from "react"
import XSignI from "@/assets/x-sign.svg"
import CameraI from "@/assets/camera.svg"
import CameraOffI from "@/assets/camera-off.svg"

// ============================================================
// IVR PANEL — Quản lý thẻ IVR (Instant Video Replay)
// Chức năng: theo dõi và chỉnh sửa lượt IVR của từng bên
// Không liên quan đến camera/video
// ============================================================

export type IvrRecord = {
    id: string
    roundNo: number
    timeLabel: string
    side: "BLUE" | "RED"
    result: "accepted" | "rejected"
}

export type IvrSideState = {
    remaining: number   // lượt còn lại
    max: number   // tối đa
    history: IvrRecord[]
}

export type IvrState = {
    blue: IvrSideState
    red: IvrSideState
}

export function createDefaultIvrState(max = 1): IvrState {
    return {
        blue: { remaining: max, max, history: [] },
        red: { remaining: max, max, history: [] },
    }
}

// ── Sub-components ────────────────────────────────────────────

function SideTab(props: {
    side: "BLUE" | "RED"
    state: IvrSideState
    active: boolean
    onClick: () => void
}) {
    const isBlue = props.side === "BLUE"
    const hasCards = props.state.remaining > 0

    return (
        <button
            onClick={props.onClick}
            className={`flex-1 flex items-center justify-center gap-[8px]
                py-[10px] rounded-[10px] transition-colors
                ${props.active
                    ? isBlue ? "bg-blue-700/50 text-white" : "bg-red-700/50 text-white"
                    : "bg-white/5 text-white/40 active:bg-white/10"
                }`}
        >
            {/* Camera icon — gạch chéo khi hết thẻ */}
            {hasCards
                ? <CameraI className={`w-[14px] h-[14px] ${isBlue ? "text-blue-300" : "text-red-300"}`} />
                : <CameraOffI className="w-[14px] h-[14px] text-white/30" />
            }
            <span className="text-[13px] font-semibold">
                {isBlue ? "Xanh" : "Đỏ"}
            </span>
            {/* Lượt còn */}
            <span className={`font-score font-bold text-[15px]
                ${hasCards
                    ? isBlue ? "text-blue-300" : "text-red-300"
                    : "text-white/25 line-through"
                }`}>
                {props.state.remaining}/{props.state.max}
            </span>
        </button>
    )
}

function CardDots(props: { state: IvrSideState; side: "BLUE" | "RED" }) {
    const isBlue = props.side === "BLUE"
    return (
        <div className="flex items-center gap-[8px]">
            {Array.from({ length: props.state.max }).map((_, i) => {
                const active = i < props.state.remaining
                return (
                    <div key={i} className={`w-[12px] h-[12px] rounded-full transition-colors
                        ${active
                            ? isBlue ? "bg-blue-400" : "bg-red-400"
                            : "bg-white/15"
                        }`}
                    />
                )
            })}
            <span className="text-[12px] text-white/40 ml-[4px]">
                {props.state.remaining > 0
                    ? `còn ${props.state.remaining} lượt`
                    : "hết lượt IVR"}
            </span>
        </div>
    )
}

function HistoryRow(props: { record: IvrRecord; index: number }) {
    const r = props.record
    const isAccepted = r.result === "accepted"
    const sideColor = r.side === "BLUE" ? "text-blue-400" : "text-red-400"
    const sideLabel = r.side === "BLUE" ? "Xanh" : "Đỏ"
    return (
        <div className="grid grid-cols-[1rem_1fr_1fr_2fr_2fr] place-items-center gap-[8px] py-[7px]
            border-b border-white/5 last:border-0">
            <span className="text-[1rem] text-white/25 text-center">
                {props.index + 1}
            </span>
            <span className={`text-[12px] font-medium ${sideColor}`}>{sideLabel}</span>
            <span className="text-[11px] text-white/35">Hiệp {r.roundNo}</span>
            <span className="text-[2rem] text-white/30">{r.timeLabel}</span>
            <span className="ml-auto text-[11px] font-semibold">
                {isAccepted
                    ? <span className="text-green-400">✓ Chấp nhận</span>
                    : <span className="text-red-400">✗ Bác bỏ</span>
                }
            </span>
        </div>
    )
}

// ── Main component ────────────────────────────────────────────

export default function IvrPanel(props: {
    state: IvrState
    roundNo: number
    timeLabel: string
    onClose: () => void
    onChange: (next: IvrState) => void
}) {
    const [activeSide, setActiveSide] = useState<"BLUE" | "RED">("BLUE")
    const side = props.state[activeSide.toLowerCase() as "blue" | "red"]
    const canUse = side.remaining > 0

    function patch(s: "BLUE" | "RED", p: Partial<IvrSideState>) {
        const key = s.toLowerCase() as "blue" | "red"
        props.onChange({ ...props.state, [key]: { ...props.state[key], ...p } })
    }

    function handleAccept() {
        // Chấp nhận: hoàn lại lượt nếu chưa đầy
        const s = activeSide.toLowerCase() as "blue" | "red"
        const cur = props.state[s]
        const record: IvrRecord = {
            id: `ivr_${Date.now()}`,
            roundNo: props.roundNo,
            timeLabel: props.timeLabel,
            side: activeSide,
            result: "accepted",
        }
        patch(activeSide, {
            history: [...cur.history, record],
        })
    }

    function handleReject() {
        // Bác bỏ: thu thẻ (trừ lượt)
        const s = activeSide.toLowerCase() as "blue" | "red"
        const cur = props.state[s]
        const record: IvrRecord = {
            id: `ivr_${Date.now()}`,
            roundNo: props.roundNo,
            timeLabel: props.timeLabel,
            side: activeSide,
            result: "rejected",
        }
        patch(activeSide, {
            remaining: Math.max(0, cur.remaining - 1),
            history: [...cur.history, record],
        })
    }

    function handleManualAdjust(side: "BLUE" | "RED", delta: 1 | -1) {
        const s = side.toLowerCase() as "blue" | "red"
        const cur = props.state[s]
        patch(side, {
            remaining: Math.min(cur.max, Math.max(0, cur.remaining + delta))
        })
    }

    const allHistory = [
        ...props.state.blue.history,
        ...props.state.red.history,
    ].sort((a, b) => a.id.localeCompare(b.id))

    return (
        <div className="flex flex-col w-full h-full" style={{ background: "#111" }}>

            {/* Header */}
            <div className="flex items-center justify-between px-[16px] py-[12px]
                border-b border-white/10">
                <span className="text-[16px] font-semibold text-white">
                    IVR — Video Replay
                </span>
                <button
                    onClick={props.onClose}
                    className="flex-center w-[28px] h-[28px] rounded-full
                        bg-white/10 active:bg-white/20 transition-colors"
                >
                    <XSignI className="h-[12px] text-white/50" />
                </button>
            </div>

            <div className="flex-1 overflow-y-auto px-[14px] py-[14px] flex flex-col gap-[14px]">

                {/* Tab chọn bên — có thể chuyển ngay dù mở từ bên nào */}
                <div className="flex gap-[8px]">
                    <SideTab side="BLUE" state={props.state.blue}
                        active={activeSide === "BLUE"} onClick={() => setActiveSide("BLUE")} />
                    <SideTab side="RED" state={props.state.red}
                        active={activeSide === "RED"} onClick={() => setActiveSide("RED")} />
                </div>

                {/* Trạng thái thẻ bên đang chọn */}
                <div className={`flex flex-col gap-[12px] px-[14px] py-[12px]
                    rounded-[12px] border
                    ${activeSide === "BLUE"
                        ? "bg-blue-950/30 border-blue-800/40"
                        : "bg-red-950/30 border-red-800/40"
                    }`}>
                    <CardDots state={side} side={activeSide} />

                    {/* Chỉnh sửa thủ công */}
                    <div className="flex items-center gap-[8px]">
                        <span className="text-[12px] text-white/40 flex-1">
                            Chỉnh sửa thủ công
                        </span>
                        <div className="flex items-center rounded-[8px] overflow-hidden bg-white/8">
                            <button
                                onClick={() => handleManualAdjust(activeSide, -1)}
                                disabled={side.remaining === 0}
                                className="px-[12px] py-[6px] text-[16px] text-white/50
                                    active:bg-white/15 transition-colors
                                    disabled:opacity-30 disabled:cursor-not-allowed"
                            >−</button>
                            <span className="font-score font-bold text-[16px] text-white
                                min-w-[32px] text-center">
                                {side.remaining}
                            </span>
                            <button
                                onClick={() => handleManualAdjust(activeSide, 1)}
                                disabled={side.remaining >= side.max}
                                className="px-[12px] py-[6px] text-[16px] text-white/50
                                    active:bg-white/15 transition-colors
                                    disabled:opacity-30 disabled:cursor-not-allowed"
                            >+</button>
                        </div>
                    </div>
                </div>

                {/* Nút hành động chính */}
                <div className="flex flex-col gap-[8px]">
                    <p className="text-[11px] text-white/30 text-center">
                        Hiệp {props.roundNo} · {props.timeLabel}
                    </p>
                    <div className="grid grid-cols-2 gap-[8px]">
                        <button
                            onClick={handleAccept}
                            disabled={!canUse}
                            className="py-[12px] rounded-[12px] text-[14px] font-semibold
                                bg-green-800/50 text-green-300
                                active:bg-green-800/70 transition-colors
                                disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                            ✓ Chấp nhận
                        </button>
                        <button
                            onClick={handleReject}
                            disabled={!canUse}
                            className="py-[12px] rounded-[12px] text-[14px] font-semibold
                                bg-red-800/50 text-red-300
                                active:bg-red-800/70 transition-colors
                                disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                            ✗ Bác bỏ (thu thẻ)
                        </button>
                    </div>
                    <div className="flex items-center justify-between px-[4px]">
                        <span className="text-[10px] text-green-400/60">
                            Chấp nhận → giữ nguyên lượt
                        </span>
                        <span className="text-[10px] text-red-400/60">
                            Bác bỏ → trừ 1 lượt
                        </span>
                    </div>
                </div>

                {/* Lịch sử */}
                {allHistory.length > 0 && (
                    <div className="flex flex-col gap-[6px]">
                        <span className="text-[11px] font-semibold text-white/30
                            uppercase tracking-wider px-[2px]">
                            Lịch sử IVR trận này
                        </span>
                        <div className="px-[12px] py-[4px] bg-white/3
                            border border-white/8 rounded-[10px]">
                            {allHistory.map((r, i) => (
                                <HistoryRow key={r.id} record={r} index={i} />
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}