"use client"

import { useContext, useEffect, useState } from "react"
import { useSheet } from "./useSheet"
import {
    MatchInfo, Round, Side, WinCode,
    createEmptyRound, DEFAULT_MATCH_CONFIG, emptyBreakdown
} from "@/scripts/match-types"
import { MOCK_MATCHES } from "@/scripts/mock-data"
import MatchNav from "./MatchNav"
import RoundResults from "./RoundResults"
import ScoreHistory from "./ScoreHistory"
import DeclareWinner from "./DeclareWinner"
import { UIContext } from "./MobileOperator"

// ============================================================
// QUICK ACCESS — Bottom sheet chính
// Kéo lên từ pill bar ở MobileOperator
// ============================================================

type Tab = "match" | "rounds" | "history" | "declare"

const TABS: { key: Tab; label: string }[] = [
    { key: "match", label: "Trận đấu" },
    { key: "rounds", label: "Các hiệp" },
    { key: "history", label: "Lịch sử" },
    { key: "declare", label: "Công bố" },
]

export default function QuickAccess(props: {
    /** Trận đấu đang active trên sân */
    activeCortId?: string
    /** Sheet đã kết nối chưa */
    sheetConnected?: boolean
    onClose?: () => void
    onClearScore?: () => void
    courtId: string
}) {
    const sheet = useSheet()
    const [matches, setMatches] = useState<MatchInfo[]>(MOCK_MATCHES)

    // Khi Sheet load xong → dùng dữ liệu thật
    // (chỉ override khi có ít nhất 1 trận từ Sheet)
    const activeMatches = sheet.matches.length > 0 ? sheet.matches : matches
    const [currentMatchIdx, setIdx] = useState(
        () => Math.max(0, (sheet.matches.length > 0 ? sheet.matches : MOCK_MATCHES).findIndex(m => m.status === "active"))
    )
    const [activeTab, setTab] = useState<Tab>("rounds")
    const [historyRound, setHistoryRound] = useState<1 | 2 | 3 | "golden">(1)
    const [manualRound, setManualRound] = useState<1 | 2 | 3 | "golden" | null>(null)

    // Reset manual round khi đổi trận
    const prevIdxRef = { current: currentMatchIdx }
    const match = activeMatches[currentMatchIdx]
    if (!match) return null

    // Hiệp hiện tại — lấy hiệp chưa có winner
    // const autoRound: 1 | 2 | 3 | "golden" = (() => {
    //     // for (const rNo of [1, 2, 3] as const) {
    //     //     if (!match.rounds?.get(rNo)?.winner) return rNo
    //     // }
    //     return "golden"
    // })()
    const currentRound = manualRound ?? 1

    // --- Cập nhật match trong danh sách ---
    function patchMatch(patch: Partial<MatchInfo>) {
        setMatches(prev => prev.map((m, i) =>
            i === currentMatchIdx ? { ...m, ...patch } : m
        ))
    }

    function patchRound(roundNo: 1 | 2 | 3 | "golden", patch: Partial<Round>) {
        // const existing = match.rounds?.get(roundNo) ?? createEmptyRound()
        const existing = createEmptyRound()
        patchMatch({
            rounds: {
                ...match.rounds,
                [roundNo]: { ...existing, ...patch },
            }
        })
    }

    // Tạo trận mới hoàn toàn — reset thông tin, giữ config hiện tại
    function handleNewMatch() {
        const newId = `manual_${Date.now()}`
        const newMatch: MatchInfo = {
            matchId: newId,
            matchNo: activeMatches.length + 1,
            category: "other",
            weightClass: "",
            gender: "male",
            blueInfo: { name: "" },
            redInfo: { name: "" },
            config: match.config,
            status: "upcoming",
            rounds: new Map(),
        }
        setMatches(prev => [...prev, newMatch])
        setIdx(activeMatches.length)
    }

    // function handleUndo() {
    //     const round = match.rounds.get(historyRound)
    //     if (!round || round.events.length === 0) return
    //     const events = round.events.slice(0, -1)

    //     // Recalculate score từ events
    //     let blue = 0, red = 0
    //     const pts: Record<number | "gj", number> = { 1: 1, 2: 2, 3: 3, 4: 4, 6: 6, gj: 0 }
    //     for (const ev of events) {
    //         if (ev.scoreType === "gj") {
    //             if (ev.side === "blue") red++; else blue++
    //         } else {
    //             const p = pts[ev.scoreType] ?? 0
    //             if (ev.side === "blue") blue += p; else red += p
    //         }
    //     }
    //     patchRound(historyRound, { events, blueScore: blue, redScore: red })
    // }

    // Xoá điểm một hiệp — reset về 0, giữ winner/winCode
    function handleResetRound(roundNo: 1 | 2 | 3 | "golden") {
        patchRound(roundNo, {
            blueBreakdown: emptyBreakdown(),
            redBreakdown: emptyBreakdown(),
        })
    }

    // // Xoá kết quả một hiệp hoàn toàn (kể cả winner/winCode)
    // function handleClearRound(roundNo: 1 | 2 | 3 | "golden") {
    //     patchMatch({
    //         rounds: {
    //             ...match.rounds,
    //             [roundNo]: createEmptyRound(
    //                 roundNo,
    //                 match.config?.roundMs ?? DEFAULT_MATCH_CONFIG.roundMs
    //             ),
    //         }
    //     })
    // }

    // Xoá toàn bộ điểm trận — reset tất cả hiệp, giữ thông tin VĐV
    function handleResetMatch() {
        patchMatch({
            rounds: new Map(),
            matchWinner: undefined,
            matchWinCode: undefined,
            status: "upcoming",
        })
    }

    // Cập nhật thông tin trận (từ edit form)
    function handleMatchUpdate(patch: Partial<MatchInfo>) {
        patchMatch(patch)
    }

    async function handlePushSheet() {
        // Placeholder — thay bằng Google Sheets API call sau
        await new Promise(r => setTimeout(r, 1200))
        patchMatch({ status: "confirmed" })
    }

    const { visible: isOpenClearScore } = useContext(UIContext)

    useEffect(() => {
        if (isOpenClearScore) setTab("rounds")
    }, [isOpenClearScore])

    return (
        <div className="h-full flex flex-col w-full text-white" style={{ background: "#111" }}>

            {/* Tab bar */}
            <div className="flex px-[12px] gap-[4px] pb-[8px]">
                {TABS.map(tab => (
                    <button
                        key={tab.key}
                        onClick={() => setTab(tab.key)}
                        className={`flex-1 py-[7px] rounded-[8px] text-[13px] font-medium transition-colors
                            ${activeTab === tab.key
                                ? "bg-white/15 text-white"
                                : "text-white/40 active:bg-white/10"
                            }`}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* Divider */}
            <div className="h-[1px] bg-white/10 mx-[12px] mb-[12px]" />

            {/* Content */}
            <div
                className="flex-1 overflow-y-auto px-[12px] pb-[16px]"
                style={{ touchAction: "pan-y", overscrollBehavior: "contain" }}
            >
                {/* {activeTab === "match" && (
                    <MatchNav
                        match={match}
                        matches={activeMatches}
                        totalMatches={activeMatches.length}
                        onPrev={() => setIdx(i => Math.max(0, i - 1))}
                        onNext={() => setIdx(i => Math.min(activeMatches.length - 1, i + 1))}
                        onSelectMatch={(idx) => setIdx(idx)}
                        onMatchUpdate={handleMatchUpdate}
                        onNewMatch={handleNewMatch}
                    />
                )} */}

                {activeTab === "rounds" && (
                    <div className="flex flex-col gap-[10px]">
                        {/* Match label + round switcher */}
                        {/* <div className="flex items-center justify-between px-[2px]">
                            <span className="text-[11px] text-white/35">
                                Trận {match.matchNo} · {match.blue?.name || "Xanh"} vs {match.red?.name || "Đỏ"}
                            </span>
                            <div className="flex items-center gap-[4px]">
                                <span className="text-[10px] text-white/30 mr-[2px]">Hiệp hiện tại:</span>
                                {([1, 2, 3, "golden"] as const).map(rNo => {
                                    const label = rNo === "golden" ? "GP" : String(rNo)
                                    const isCur = currentRound === rNo
                                    return (
                                        <button key={rNo}
                                            onClick={() => setManualRound(rNo === 1 ? null : rNo)}
                                            className={`flex-center w-[24px] h-[24px] rounded-full
                                                text-[10px] font-bold transition-all
                                                ${isCur
                                                    ? "bg-amber-400 text-black"
                                                    : "bg-white/10 text-white/40 active:bg-white/20"
                                                }`}>
                                            {label}
                                        </button>
                                    )
                                })}
                            </div>
                        </div> */}
                        <RoundResults
                            match={match}
                            currentRound={currentRound}
                            onRoundUpdate={patchRound}
                            // onResetRound={handleResetRound}
                            // onClearRound={handleClearRound}
                            // onResetMatch={handleResetMatch}
                            onResetMatch={props.onClearScore}
                        />
                    </div>
                )}

                {activeTab === "history" && (
                    <div className="flex flex-col gap-[12px]">
                        {/* <span className="text-[11px] text-white/35 px-[2px]">
                            Trận {match.matchNo} · {match.blue?.name || "Xanh"} vs {match.red?.name || "Đỏ"}
                        </span> */}
                        {/* <div className="flex gap-[6px]">
                            {([1, 2, 3] as const).map(rNo => {
                                const exists = !!match.rounds.get(rNo)
                                return (
                                    <button
                                        key={rNo}
                                        disabled={!exists}
                                        onClick={() => setHistoryRound(rNo)}
                                        className={`flex-1 py-[6px] rounded-[8px] text-[13px] font-medium
                                            transition-colors
                                            ${historyRound === rNo
                                                ? "bg-white/20 text-white"
                                                : exists
                                                    ? "bg-white/5 text-white/50 active:bg-white/10"
                                                    : "bg-white/5 text-white/20 cursor-not-allowed"
                                            }`}
                                    >
                                        Hiệp {rNo}
                                    </button>
                                )
                            })}
                        </div> */}

                        <ScoreHistory
                            courtId={props.courtId}
                            roundNo={historyRound}
                        // onUndo={match.status !== "confirmed" ? handleUndo : undefined}
                        />
                    </div>
                )}

                {/* {activeTab === "declare" && (
                    <DeclareWinner
                        match={match}
                        sheetConnected={sheet.isConnected}
                        onDeclare={(winner, code) =>
                            patchMatch({ matchWinner: winner, matchWinCode: code, status: "finished" })
                        }
                        onPushSheet={sheet.isConnected
                            ? () => sheet.writeResult(match)
                            : handlePushSheet}
                    />
                )} */}
            </div>
        </div>
    )
}