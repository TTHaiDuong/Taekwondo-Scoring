"use client"

import { useEffect, useState } from "react"
import ArrowI from "@/assets/arrow.svg"
import XSignI from "@/assets/x-sign.svg"
import JudgeI from "@/assets/judge.svg"
import Stepper from "@/components/Stepper"

// ============================================================
// JUDGE SETTINGS — Sub-page quản lý kết nối giám định
// Mở từ NavRow "Kết nối Giám định" trong MobileSetting
// ============================================================

// ── Types ─────────────────────────────────────────────────────

export type JudgeConfig = {
    /** Số máy giám định tối đa cho phép kết nối */
    maxJudges: number
    /** Số máy đồng thuận tối thiểu để điểm được công nhận */
    voteThreshold: number
    /** Thời gian chờ nhấn tổ hợp phím (ms) — VD: 2+2=4, 2+3=6 */
    pressBufferMs: number
    /** Thời gian chờ bình chọn (ms) — khoảng thời gian các giám định còn lại bình chọn */
    pendingVoteMs: number
    /** Cho phép bình chọn ngay sau khi hết giờ hiệp */
    allowPostTimeVote: boolean
}

export const DEFAULT_JUDGE_CONFIG: JudgeConfig = {
    maxJudges: 3,
    voteThreshold: 2,
    pressBufferMs: 400,
    pendingVoteMs: 1000,
    allowPostTimeVote: true,
}

export type ConnectedJudge = {
    socketId: string
    connectedAt: number   // timestamp
    label?: string   // "Giám định 1", "Giám định 2"...
}

// ── Sub-components ─────────────────────────────────────────────

function SectionLabel(props: { children: React.ReactNode }) {
    return (
        <span className="px-[2px] text-[11px] font-semibold uppercase tracking-wider text-white/35">
            {props.children}
        </span>
    )
}

function RowDivider() {
    return <div className="h-[1px] bg-white/8 mx-[2px]" />
}

function ConfigRow(props: {
    label: string
    description?: string
    children: React.ReactNode
}) {
    return (
        <div className="flex items-center w-full min-h-[52px] px-[4px] gap-[10px]">
            <div className="flex-1 flex flex-col gap-[2px] min-w-0">
                <span className="text-[15px] font-medium text-white/80">{props.label}</span>
                {props.description && (
                    <span className="text-[12px] text-white/40 leading-snug">{props.description}</span>
                )}
            </div>
            {props.children}
        </div>
    )
}

function ToggleRow(props: {
    label: string
    description?: string
    value: boolean
    onChange: (v: boolean) => void
}) {
    return (
        <ConfigRow label={props.label} description={props.description}>
            <button
                onClick={() => props.onChange(!props.value)}
                className={`relative flex-shrink-0 w-[42px] h-[24px] rounded-full transition-colors
                    ${props.value ? "bg-blue-500" : "bg-white/20"}`}
            >
                <div className={`absolute top-[3px] w-[18px] h-[18px] rounded-full bg-white
                    transition-transform ${props.value ? "left-[21px]" : "left-[3px]"}`} />
            </button>
        </ConfigRow>
    )
}

// ── Judge card ──────────────────────────────────────────────

function JudgeCard(props: {
    judge: ConnectedJudge
    index: number
    onKick: (socketId: string) => void
}) {
    const elapsed = Math.floor((Date.now() - props.judge.connectedAt) / 1000)
    const elapsedStr = elapsed < 60
        ? `${elapsed}s trước`
        : `${Math.floor(elapsed / 60)}p trước`

    return (
        <div className="flex items-center gap-[10px] px-[12px] py-[10px]
            bg-white/5 rounded-[10px] border border-white/8">
            {/* Avatar */}
            <div className="flex-center w-[36px] h-[36px] rounded-full bg-green-900/50
                border border-green-700/50 shrink-0">
                <JudgeI className="w-[16px] text-green-400" />
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
                <span className="text-[14px] font-medium text-white/80">
                    {props.judge.label ?? `Giám định ${props.index + 1}`}
                </span>
                <div className="flex items-center gap-[6px] mt-[1px]">
                    <div className="w-[6px] h-[6px] rounded-full bg-green-400" />
                    <span className="text-[11px] text-white/35">Đã kết nối · {elapsedStr}</span>
                </div>
                <span className="font-mono text-[10px] text-white/20 truncate block">
                    {props.judge.socketId}
                </span>
            </div>

            {/* Kick button */}
            <button
                onClick={() => props.onKick(props.judge.socketId)}
                className="flex-center w-[32px] h-[32px] rounded-full
                    bg-white/8 text-white/30 active:bg-red-900/50 active:text-red-400
                    transition-colors shrink-0"
                title="Ngắt kết nối máy giám định này"
            >
                <XSignI className="h-[11px]" />
            </button>
        </div>
    )
}

// ── Combo guide ──────────────────────────────────────────────

function ComboGuide() {
    const combos = [
        { press: "2 + 2", result: "4 điểm", desc: "Đá xoay thân" },
        { press: "2 + 3", result: "6 điểm", desc: "Đá xoay đầu" },
        { press: "3 + 2", result: "6 điểm", desc: "Đá xoay đầu" },
    ]
    return (
        <div className="flex flex-col gap-[6px] px-[12px] py-[10px]
            bg-white/3 rounded-[10px] border border-white/8">
            <span className="text-[11px] font-semibold text-white/40 uppercase tracking-wider">
                Tổ hợp điểm
            </span>
            {combos.map((c, i) => (
                <div key={i} className="flex items-center gap-[8px]">
                    <span className="font-mono text-[13px] font-bold text-blue-300 min-w-[44px]">
                        {c.press}
                    </span>
                    <span className="text-white/30 text-[11px]">→</span>
                    <span className="font-score font-bold text-[14px] text-amber-300 min-w-[50px]">
                        {c.result}
                    </span>
                    <span className="text-[11px] text-white/35">{c.desc}</span>
                </div>
            ))}
            <p className="text-[11px] text-white/25 mt-[2px] leading-relaxed">
                Nhấn trong vòng thời gian chờ tổ hợp để kết hợp điểm.
                Sau khi hết thời gian, các lần nhấn được xử lý riêng lẻ.
            </p>
        </div>
    )
}

// ── Main component ────────────────────────────────────────────

export default function JudgeSettings(props: {
    onBack: () => void
    config: JudgeConfig
    onConfigChange: (patch: Partial<JudgeConfig>) => void
    connectedJudges: ConnectedJudge[]
    onKickJudge: (socketId: string) => void
}) {
    const { config } = props
    const connected = props.connectedJudges.length
    const [now, setNow] = useState(Date.now())

    // Refresh elapsed time mỗi 5s
    useEffect(() => {
        const t = setInterval(() => setNow(Date.now()), 5000)
        return () => clearInterval(t)
    }, [])

    return (
        <div className="flex flex-col gap-[20px]">

            {/* Header */}
            <div className="flex items-center gap-[10px]">
                <button
                    onClick={props.onBack}
                    className="flex-center w-[32px] h-[32px] rounded-full
                        bg-white/10 active:bg-white/20 transition-colors shrink-0"
                >
                    <ArrowI className="h-[10px] rotate-90 text-white/60" />
                </button>
                <span className="text-[17px] font-semibold text-white">Kết nối Giám định</span>
                <div className="ml-auto flex items-center gap-[6px]">
                    <div className={`w-[8px] h-[8px] rounded-full
                        ${connected > 0 ? "bg-green-400" : "bg-white/20"}`} />
                    <span className={`text-[13px] font-semibold
                        ${connected >= config.maxJudges
                            ? "text-green-400"
                            : connected > 0 ? "text-amber-400" : "text-white/40"}`}>
                        {connected} / {config.maxJudges}
                    </span>
                </div>
            </div>

            {/* Danh sách máy đã kết nối */}
            <div className="flex flex-col gap-[6px]">
                <SectionLabel>Máy đang kết nối</SectionLabel>
                {connected === 0 ? (
                    <div className="flex-center flex-col gap-[8px] py-[20px]
                        bg-white/3 rounded-[10px] border border-white/8">
                        <JudgeI className="w-[24px] text-white/20" />
                        <span className="text-[13px] text-white/30">Chưa có máy giám định nào kết nối</span>
                    </div>
                ) : (
                    props.connectedJudges.map((j, i) => (
                        <JudgeCard
                            key={j.socketId}
                            judge={j}
                            index={i}
                            onKick={props.onKickJudge}
                        />
                    ))
                )}
            </div>

            {/* Cài đặt số lượng */}
            <div className="flex flex-col gap-[6px]">
                <SectionLabel>Số lượng</SectionLabel>
                <div className="flex flex-col px-[16px] bg-white/5 border border-white/8 rounded-[16px]">
                    <ConfigRow
                        label="Máy giám định tối đa"
                        description="Số máy được phép kết nối vào bảng điểm"
                    >
                        <Stepper
                            value={config.maxJudges}
                            onChange={v => props.onConfigChange({ maxJudges: v })}
                            min={1} max={5}
                        />
                    </ConfigRow>
                    <RowDivider />
                    <ConfigRow
                        label="Ngưỡng bình chọn"
                        description={`${config.voteThreshold}/${config.maxJudges} máy đồng thuận → điểm được công nhận`}
                    >
                        <Stepper
                            value={config.voteThreshold}
                            onChange={v => props.onConfigChange({
                                voteThreshold: Math.min(v, config.maxJudges)
                            })}
                            min={1} max={config.maxJudges}
                        />
                    </ConfigRow>
                </div>
            </div>

            {/* Cài đặt thời gian */}
            <div className="flex flex-col gap-[6px]">
                <SectionLabel>Thời gian chờ</SectionLabel>
                <div className="flex flex-col px-[16px] bg-white/5 border border-white/8 rounded-[16px]">
                    <ConfigRow
                        label="Chờ nhấn tổ hợp"
                        description="Khoảng thời gian để nhấn thêm phím tạo tổ hợp điểm"
                    >
                        <div className="flex items-center gap-[8px] shrink-0">
                            <Stepper
                                value={config.pressBufferMs}
                                onChange={v => props.onConfigChange({ pressBufferMs: v })}
                                min={100} max={2000}
                                suffix="ms"
                                className="w-[120px]"
                            />
                        </div>
                    </ConfigRow>
                    <RowDivider />
                    <ConfigRow
                        label="Chờ bình chọn"
                        description="Khoảng thời gian để các giám định còn lại bình chọn sau lần bấm đầu tiên"
                    >
                        <Stepper
                            value={config.pendingVoteMs}
                            onChange={v => props.onConfigChange({ pendingVoteMs: v })}
                            min={200} max={3000}
                            suffix="ms"
                            className="w-[120px]"
                        />
                    </ConfigRow>
                    <RowDivider />
                    <ToggleRow
                        label="Bình chọn sau hết giờ"
                        description="Cho phép xác nhận điểm đã bấm ngay trước khi hết giờ hiệp"
                        value={config.allowPostTimeVote}
                        onChange={v => props.onConfigChange({ allowPostTimeVote: v })}
                    />
                </div>
            </div>

            {/* Hướng dẫn tổ hợp */}
            <div className="flex flex-col gap-[6px]">
                <SectionLabel>Tổ hợp điểm</SectionLabel>
                <ComboGuide />
            </div>

            {/* Preset nhanh */}
            <div className="flex flex-col gap-[6px]">
                <SectionLabel>Cài đặt nhanh</SectionLabel>
                <div className="grid grid-cols-2 gap-[8px]">
                    {[
                        {
                            label: "1 giám định",
                            desc: "Tập luyện / test",
                            cfg: { maxJudges: 1, voteThreshold: 1 } as Partial<JudgeConfig>,
                        },
                        {
                            label: "3 giám định",
                            desc: "Tiêu chuẩn thi đấu",
                            cfg: { maxJudges: 3, voteThreshold: 2 } as Partial<JudgeConfig>,
                        },
                        {
                            label: "Tổ hợp nhanh",
                            desc: "Buffer 200ms",
                            cfg: { pressBufferMs: 200 } as Partial<JudgeConfig>,
                        },
                        {
                            label: "Tổ hợp chậm",
                            desc: "Buffer 600ms",
                            cfg: { pressBufferMs: 600 } as Partial<JudgeConfig>,
                        },
                    ].map((preset, i) => (
                        <button
                            key={i}
                            onClick={() => props.onConfigChange(preset.cfg)}
                            className="flex flex-col items-start gap-[2px] px-[12px] py-[10px]
                                bg-white/5 border border-white/8 rounded-[12px]
                                active:bg-white/10 transition-colors text-left"
                        >
                            <span className="text-[13px] font-medium text-white/70">{preset.label}</span>
                            <span className="text-[11px] text-white/35">{preset.desc}</span>
                        </button>
                    ))}
                </div>
            </div>

        </div>
    )
}