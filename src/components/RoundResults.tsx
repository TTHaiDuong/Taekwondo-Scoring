"use client"

import { useRef, useState, useCallback, useContext } from "react"
import {
    MatchInfo, RoundResult, Side, WinCode, WIN_CODES,
    ScoreBreakdown, emptyBreakdown, calcTotalFromBreakdown,
    countRoundWins, inferMatchWinner,
    RoundWinner,
} from "@/scripts/match-types"
import Selector from "@/components/Selector"
import PopupOverlay from "@/components/PopupOverlay"
import ArmorI from "@/assets/solid-armor.svg"
import HelmetI from "@/assets/solid-helmet.svg"
import PunchI from "@/assets/solid-punch.svg"
import { UIContext } from "./MobileOperator"

const SIDE_LABEL = { blue: "Xanh", red: "Đỏ" }

// ── Confirm dialog ────────────────────────────────────────────

function ConfirmDialog(props: {
    message: string
    onConfirm: () => void
    onCancel: () => void
    danger?: boolean
}) {
    return (
        <div className="fixed inset-0 z-[300] flex items-end justify-center pb-[20px] px-[16px]"
            style={{ background: "rgba(0,0,0,0.7)" }}
            onClick={e => { if (e.target === e.currentTarget) props.onCancel() }}
        >
            <div className="w-full max-w-[420px] bg-[#1a1a1a] rounded-[16px]
                border border-white/10 overflow-hidden">
                <div className="px-[20px] py-[16px] border-b border-white/8">
                    <p className="text-[14px] text-white/80 leading-relaxed">{props.message}</p>
                </div>
                <div className="grid grid-cols-2">
                    <button
                        onClick={props.onCancel}
                        className="py-[14px] text-[14px] font-medium text-white/50
                            border-r border-white/8 active:bg-white/5 transition-colors"
                    >
                        Huỷ
                    </button>
                    <button
                        onClick={props.onConfirm}
                        className={`py-[14px] text-[14px] font-semibold transition-colors
                            ${props.danger
                                ? "text-red-400 active:bg-red-900/30"
                                : "text-blue-400 active:bg-blue-900/30"
                            }`}
                    >
                        Xác nhận
                    </button>
                </div>
            </div>
        </div>
    )
}

type BreakdownKey = keyof ScoreBreakdown

const BREAKDOWN_ROWS: {
    key: BreakdownKey
    label: string
    pts: number
    icon?: any
    isGj?: boolean
}[] = [
        { key: "punch", label: "Đấm", pts: 1, icon: PunchI },
        { key: "trunkKick", label: "Đá thân", pts: 2, icon: ArmorI },
        { key: "headKick", label: "Đá đầu", pts: 3, icon: HelmetI },
        { key: "spinTrunk", label: "Xoay thân", pts: 4 },
        { key: "spinHead", label: "Xoay đầu", pts: 6 },
        { key: "gamjeom", label: "Gam-jeom", pts: 0, isGj: true },
    ]

function WinnerToggle(props: {
    winner?: Side
    onChange: (side: Side) => void
    onClear?: () => void
    disabled?: boolean
}) {
    return (
        <div className="flex items-center gap-[6px]">
            <div className="flex items-center rounded-[8px] overflow-hidden text-[12px] font-medium">
                {(["blue", "red"] as Side[]).map(side => (
                    <button key={side} disabled={props.disabled}
                        onClick={() => props.onChange(side)}
                        className={`px-[8px] py-[3px] transition-colors
                            ${props.winner === side
                                ? side === "blue" ? "bg-blue-600 text-white" : "bg-red-600 text-white"
                                : "bg-white/10 text-white/40 active:bg-white/20"}`}>
                        {SIDE_LABEL[side]}
                    </button>
                ))}
            </div>
            {props.winner && props.onClear && !props.disabled && (
                <button onClick={props.onClear} title="Hoàn tác kết quả hiệp này"
                    className="flex-center w-[22px] h-[22px] rounded-full bg-white/10
                        text-white/40 text-[10px] active:bg-red-500/30 active:text-red-300 transition-colors">
                    ✕
                </button>
            )}
        </div>
    )
}

function BreakdownStepper(props: {
    value: number
    onChange: (v: number) => void
    isGj?: boolean
    side: "blue" | "red"
}) {
    const cls = props.isGj
        ? "bg-amber-500/20 text-amber-300"
        : props.side === "blue" ? "bg-blue-500/20 text-blue-300" : "bg-red-500/20 text-red-300"
    return (
        <div className={`flex items-center rounded-[6px] overflow-hidden text-[13px] font-semibold ${cls}`}>
            <button onClick={() => props.onChange(Math.max(0, props.value - 1))}
                className="px-[6px] py-[2px] active:opacity-60 transition-opacity">−</button>
            <span className="min-w-[22px] text-center text-[2rem]">{props.value}</span>
            <button onClick={() => props.onChange(props.value + 1)}
                className="px-[6px] py-[2px] active:opacity-60 transition-opacity">+</button>
        </div>
    )
}

function BreakdownPanel(props: {
    roundLabel: string
    result: RoundResult
    onUpdate: (patch: Partial<RoundResult>) => void
}) {
    const r = props.result
    const blueB = r.blueBreakdown ?? emptyBreakdown()
    const redB = r.redBreakdown ?? emptyBreakdown()

    function updateBlue(key: BreakdownKey, val: number) {
        const next = { ...blueB, [key]: val }
        const total = calcTotalFromBreakdown(next, redB.gamjeom)
        props.onUpdate({ blueBreakdown: next, blueScore: total })
    }
    function updateRed(key: BreakdownKey, val: number) {
        const next = { ...redB, [key]: val }
        const total = calcTotalFromBreakdown(next, blueB.gamjeom)
        props.onUpdate({ redBreakdown: next, redScore: total })
    }

    return (
        <div className="flex flex-col mt-[4px] mb-[6px]
            bg-white/3 rounded-[10px] overflow-hidden border border-white/8">
            {/* Header */}
            <div className="grid grid-cols-[1fr_76px_40px_76px] items-center
                px-[10px] py-[6px] border-b border-white/8">
                <span className="text-[10px] font-semibold text-white/30 uppercase tracking-wider">
                    Chi tiết điểm — Hiệp {props.roundLabel}
                </span>
                <span className="text-[10px] font-semibold text-blue-400 text-center">XANH</span>
                <span className="text-[10px] text-white/20 text-center">×</span>
                <span className="text-[10px] font-semibold text-red-400 text-center">ĐỎ</span>
            </div>

            {BREAKDOWN_ROWS.map(row => {
                const bv = blueB[row.key]
                const rv = redB[row.key]
                return (
                    <div key={row.key}
                        className="grid grid-cols-[1fr_76px_40px_76px] items-center
                            px-[10px] py-[6px] border-b border-white/5 last:border-0">
                        {/* Label */}
                        <div className="flex items-center gap-[15px]">
                            {row.icon
                                ? <row.icon className="w-[13px] h-[13px] text-white/35 shrink-0" />
                                : <span className="w-[13px] text-center text-[15px] font-bold text-white/35">
                                    {row.pts || "GJ"}
                                </span>
                            }
                            <div className="flex flex-col">
                                <span className={`text-[12px] font-medium leading-tight
                                    ${row.isGj ? "text-amber-300" : "text-white/70"}`}>
                                    {row.label}
                                </span>
                                <span className="text-[9px] text-white/25 leading-tight">
                                    {row.isGj ? "cộng cho đối thủ" : `${row.pts}đ / lần`}
                                </span>
                            </div>
                        </div>
                        {/* Blue */}
                        <div className="flex flex-col items-center gap-[1px]">
                            <BreakdownStepper value={bv} onChange={v => updateBlue(row.key, v)}
                                isGj={row.isGj} side="blue" />
                            <span className="text-[9px] text-white/20">
                                {row.isGj ? `+${rv}đ đối thủ` : `= ${bv * row.pts}đ`}
                            </span>
                        </div>
                        {/* Multiplier */}
                        <span className={`text-center text-[${row.isGj ? "1rem" : "1.5rem"}] text-white/20`}>
                            {row.isGj ? "phạt" : `×${row.pts}`}
                        </span>
                        {/* Red */}
                        <div className="flex flex-col items-center gap-[1px]">
                            <BreakdownStepper value={rv} onChange={v => updateRed(row.key, v)}
                                isGj={row.isGj} side="red" />
                            <span className="text-[9px] text-white/20">
                                {row.isGj ? `+${bv}đ đối thủ` : `= ${rv * row.pts}đ`}
                            </span>
                        </div>
                    </div>
                )
            })}

            {/* Total row */}
            <div className="grid grid-cols-[1fr_76px_40px_76px] items-center
                px-[10px] py-[7px] bg-white/5">
                <span className="text-[11px] font-semibold text-white/50">Tổng điểm</span>
                <span className="text-center font-score font-bold text-[17px] text-blue-300">
                    {r.blueScore}
                </span>
                <span className="text-center text-[9px] text-white/20">điểm</span>
                <span className="text-center font-score font-bold text-[17px] text-red-300">
                    {r.redScore}
                </span>
            </div>
        </div>
    )
}

function RoundRow(props: {
    roundNo: 1 | 2 | 3 | "golden"
    result?: RoundResult
    isCurrent: boolean
    onWinnerChange: (side: Side) => void
    onWinnerClear: () => void
    onWinCodeChange: (code: WinCode) => void
    onRoundUpdate: (patch: Partial<RoundResult>) => void
    onResetRound?: () => void
    onClearRound?: () => void
}) {
    const [expanded, setExpanded] = useState(false)
    const [confirmDel, setConfirmDel] = useState(false)
    const winCodeRef = useRef<any>(null)
    const label = props.roundNo === "golden" ? "GP" : `H${props.roundNo}`
    const r = props.result

    return (
        <>
            <div className={`flex flex-col rounded-[10px] transition-colors
                ${props.isCurrent ? "bg-white/5" : ""}`}>
                {/* Summary row */}
                <div className="grid grid-cols-[28px_28px_12px_28px_1fr_52px] justify-items-center items-center min-h-[44px] px-[4px] gap-[8px]">
                    {/* Badge — nhấn để expand */}
                    <button disabled={!r} onClick={() => r && setExpanded(e => !e)}
                        className={`flex-center w-[28px] h-[28px] rounded-full text-[12px]
                            font-bold shrink-0 transition-all select-none
                            ${props.isCurrent ? "bg-amber-400 text-black"
                                : r?.winner ? "bg-white/20 text-white/60"
                                    : "bg-white/10 text-white/30"}
                            ${r ? "active:scale-90" : ""}`}>
                        {r ? (expanded ? "▲" : label) : label}
                    </button>

                    <span className={`w-[28px] text-center text-[18px] leading-none
                        ${r ? "text-blue-300" : "text-white/20"}`}>
                        {r?.blueScore ?? "–"}
                    </span>
                    <span className="text-white/30 text-[12px]">:</span>
                    <span className={`w-[28px] text-center text-[18px] leading-none
                        ${r ? "text-red-300" : "text-white/20"}`}>
                        {r?.redScore ?? "–"}
                    </span>

                    <div className="flex-1 flex justify-center">
                        {r ? (
                            <WinnerToggle winner={r.winner}
                                onChange={props.onWinnerChange}
                                onClear={props.onWinnerClear} />
                        ) : (
                            <span className="text-[12px] text-white/20">–</span>
                        )}
                    </div>

                    <button disabled={!r} onClick={() => winCodeRef.current?.setVisible(true)}
                        className={`flex items-center gap-[4px] min-w-[52px] px-[6px] py-[3px]
                            rounded-[8px] text-[12px] font-mono font-bold transition-colors
                            ${r ? "bg-white/10 text-white/70 active:bg-white/20"
                                : "text-white/20 cursor-default"}`}>
                        {r?.winCode ?? "–"}
                        {r && <span className="text-[9px] text-white/40">▼</span>}
                    </button>
                </div>

                {/* Bottom actions: expand hint + delete */}
                {r && !expanded && !confirmDel && (
                    <div className="flex items-center justify-between px-[10px] pb-[5px]">
                        <button onClick={() => setExpanded(true)}
                            className="flex items-center gap-[3px]
                                text-[10px] text-white/20 active:text-white/40 transition-colors">
                            <span>▾</span>
                            <span>chi tiết điểm</span>
                        </button>
                        <button
                            onClick={() => setConfirmDel(true)}
                            className="text-[10px] text-white/15 active:text-red-400/60
                                transition-colors px-[4px] py-[2px]"
                        >
                            xoá hiệp
                        </button>
                    </div>
                )}

                {/* Confirm delete inline */}
                {r && confirmDel && (
                    <div className="flex flex-col gap-[6px] mx-[4px] mb-[6px] px-[10px] py-[8px]
                        bg-red-950/40 border border-red-800/40 rounded-[10px]">
                        <span className="text-[12px] text-red-300 font-medium">
                            Xoá hiệp {label}?
                        </span>
                        <div className="flex gap-[6px]">
                            <button
                                onClick={() => {
                                    props.onResetRound?.()
                                    setConfirmDel(false)
                                    setExpanded(false)
                                }}
                                className="flex-1 py-[6px] rounded-[8px] text-[12px] font-medium
                                    bg-amber-900/50 text-amber-300 active:bg-amber-900/70 transition-colors"
                            >
                                Chỉ xoá điểm số
                            </button>
                            <button
                                onClick={() => {
                                    props.onClearRound?.()
                                    setConfirmDel(false)
                                    setExpanded(false)
                                }}
                                className="flex-1 py-[6px] rounded-[8px] text-[12px] font-medium
                                    bg-red-900/50 text-red-300 active:bg-red-900/70 transition-colors"
                            >
                                Xoá cả kết quả
                            </button>
                            <button
                                onClick={() => setConfirmDel(false)}
                                className="px-[12px] py-[6px] rounded-[8px] text-[12px]
                                    text-white/40 bg-white/5 active:bg-white/10 transition-colors"
                            >
                                Huỷ
                            </button>
                        </div>
                        <div className="text-[10px] text-white/30 leading-relaxed">
                            <span className="text-amber-400">Chỉ xoá điểm số</span>
                            {" "}→ giữ kết quả thắng/thua và mã win code{" "}
                            <span className="text-red-400">Xoá cả kết quả</span>
                            {" "}→ xoá hoàn toàn, hiệp trở về trạng thái chưa đấu
                        </div>
                    </div>
                )}

                {/* Breakdown */}
                {r && expanded && (
                    <div className="px-[4px] pb-[4px]">
                        {/* <BreakdownPanel
                            roundLabel={label}
                            result={r}
                            onUpdate={props.onRoundUpdate}
                        /> */}
                    </div>
                )}
            </div>

            <PopupOverlay ref={winCodeRef} className="flex flex-col justify-end">
                <Selector
                    title={`Win Code — Hiệp ${label}`}
                    data={WIN_CODES.map(w => ({ key: w.key, description: w.description }))}
                    value={r?.winCode}
                    onValueChanged={(v) => {
                        props.onWinCodeChange(v as WinCode)
                        winCodeRef.current?.setVisible(false)
                    }}
                />
            </PopupOverlay>
        </>
    )
}

// ── Reset match button ───────────────────────────────────────

function ResetMatchButton(props: { onReset: () => void }) {
    const [confirm, setConfirm] = useState(false)
    const { visible: isOpenClearScore, setVisible: setIsOpenClearScore } = useContext(UIContext)

    if (!confirm && !isOpenClearScore) return (
        <button
            onClick={() => setConfirm(true)}
            className="w-full mt-[4px] py-[8px] rounded-[10px] text-[12px] text-white/90
                bg-white/3 border border-white/8 active:bg-white/8 transition-colors"
        >
            Xoá toàn bộ điểm trận
        </button>
    )

    return (
        <div className="flex flex-col gap-[8px] mt-[4px] px-[12px] py-[10px]
            bg-red-950/40 border border-red-800/40 rounded-[10px]">
            <span className="text-[13px] text-red-300 font-medium">
                Xoá toàn bộ điểm trận đấu?
            </span>
            <p className="text-[11px] text-white/30 leading-relaxed">
                Tất cả điểm số, kết quả các hiệp và kết quả trận sẽ bị xoá.
                Thông tin VĐV và cài đặt sẽ được giữ lại.
            </p>
            <div className="flex gap-[8px]">
                <button
                    onClick={() => { props.onReset(); setConfirm(false) }}
                    className="flex-1 py-[8px] rounded-[10px] text-[13px] font-semibold
                        bg-red-700/60 text-red-200 active:bg-red-700/80 transition-colors"
                >
                    Xác nhận xoá
                </button>
                <button
                    onClick={() => {
                        setConfirm(false)
                        setIsOpenClearScore(false)
                    }}
                    className="flex-1 py-[8px] rounded-[10px] text-[13px]
                        text-white/50 bg-white/8 active:bg-white/15 transition-colors"
                >
                    Huỷ
                </button>
            </div>
        </div>
    )
}

export default function RoundResults(props: {
    match: MatchInfo
    currentRound: 1 | 2 | 3 | "golden"
    onRoundUpdate: (roundNo: 1 | 2 | 3 | "golden", patch: Partial<RoundResult>) => void
    onResetRound?: (roundNo: 1 | 2 | 3 | "golden") => void
    onClearRound?: (roundNo: 1 | 2 | 3 | "golden") => void
    onResetMatch?: () => void
}) {
    const [confirmMatch, setConfirmMatch] = useState(false)
    const { match } = props
    // const wins = countRoundWins(match)
    const wins = { blue: 0, red: 0 }
    // const inferred = inferMatchWinner(match)
    const inferred = null
    const rounds: (1 | 2 | 3 | "golden")[] = [1, 2, 3]
    if (wins.blue === 1 && wins.red === 1) rounds.push("golden")

    return (
        <div className="flex flex-col gap-[4px]">
            {/* Header */}
            <div className="grid grid-cols-[28px_28px_12px_28px_1fr_52px] px-[4px] gap-[8px] pb-[4px] border-b border-white/10">
                <div />
                <span className="text-center text-[11px] font-semibold text-blue-400">XANH</span>
                <span />
                <span className="text-center text-[11px] font-semibold text-red-400">ĐỎ</span>
                <span className="flex-1 text-center text-[11px] text-white/40">THẮNG</span>
                <span className="min-w-[52px] text-center text-[11px] text-white/40">MÃ</span>
            </div>
            {/* 
            {rounds.map(rNo => (
                <RoundRow
                    key={rNo}
                    roundNo={rNo}
                    result={match.rounds.get(rNo)}
                    isCurrent={props.currentRound === rNo}
                    onWinnerChange={(side) => props.onRoundUpdate(rNo, { winner: side })}
                    onWinnerClear={() => props.onRoundUpdate(rNo, { winner: undefined, winCode: undefined })}
                    onWinCodeChange={(code) => props.onRoundUpdate(rNo, { winCode: code })}
                    onRoundUpdate={(patch) => props.onRoundUpdate(rNo, patch)}
                    onResetRound={props.onResetRound ? () => props.onResetRound!(rNo) : undefined}
                    onClearRound={props.onClearRound ? () => props.onClearRound!(rNo) : undefined}
                />
            ))} */}

            <div className="h-[1px] bg-white/10 my-[4px]" />

            {/* Match total */}
            <div className="flex items-center px-[4px] gap-[8px]">
                <div className="w-[28px]" />
                <span className="w-[28px] text-center font-score text-[20px] text-blue-300 font-bold leading-none">
                    {wins.blue}
                </span>
                <span className="w-[12px] text-center text-white/30 text-[12px]">:</span>
                <span className="w-[28px] text-center font-score text-[20px] text-red-300 font-bold leading-none">
                    {wins.red}
                </span>
                <div className="flex-1 flex justify-center">
                    {inferred && (
                        <span className={`px-[10px] py-[2px] rounded-full text-[12px] font-bold
                            ${inferred === "blue"
                                ? "bg-blue-600/30 text-blue-300"
                                : "bg-red-600/30 text-red-300"}`}>
                            {SIDE_LABEL[inferred]} thắng trận
                        </span>
                    )}
                </div>
                <div className="min-w-[52px]" />
            </div>

            {/* Reset toàn bộ trận */}
            {props.onResetMatch && (
                <ResetMatchButton onReset={props.onResetMatch} />
            )}
        </div>
    )
}