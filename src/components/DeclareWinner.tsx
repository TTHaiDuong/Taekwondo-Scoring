"use client"

import { useRef, useState } from "react"
import { MatchInfo, Side, WinCode, WIN_CODES, inferMatchWinner, countRoundWins } from "../scripts/match-types"
import Selector from "@/components/Selector"
import PopupOverlay from "@/components/PopupOverlay"

// ============================================================
// DECLARE WINNER — Công bố thắng trận + push Google Sheet
// ============================================================

type PushState = "idle" | "confirming" | "pushing" | "done" | "error"

function WinnerCard(props: {
    side: Side
    name: string
    winCode?: WinCode
    isSelected: boolean
    onClick: () => void
}) {
    const isBlue = props.side === "blue"
    return (
        <button
            onClick={props.onClick}
            className={`flex-1 flex flex-col items-center gap-[6px] p-[14px] rounded-[12px]
                border-[2px] transition-all
                ${props.isSelected
                    ? isBlue
                        ? "border-blue-500 bg-blue-900/40"
                        : "border-red-500 bg-red-900/40"
                    : "border-white/10 bg-white/5 active:bg-white/10"
                }`}
        >
            <div className={`flex-center w-[40px] h-[40px] rounded-full text-[22px] font-bold
                ${isBlue ? "bg-blue-600 text-white" : "bg-red-600 text-white"}`}>
                {isBlue ? "X" : "Đ"}
            </div>
            <span className="text-[14px] font-semibold text-white text-center leading-tight">
                {props.name}
            </span>
            <span className={`text-[11px] ${isBlue ? "text-blue-400" : "text-red-400"}`}>
                {isBlue ? "XANH" : "ĐỎ"}
            </span>
        </button>
    )
}

export default function DeclareWinner(props: {
    match: MatchInfo
    onDeclare: (winner: Side, winCode: WinCode) => void
    onPushSheet: () => Promise<void>
    sheetConnected: boolean
}) {
    const { match } = props

    const inferred = inferMatchWinner(match)
    const wins = countRoundWins(match)

    const [selectedWinner, setSelectedWinner] = useState<Side | undefined>(
        match.matchWinner ?? inferred ?? undefined
    )
    const [selectedCode, setSelectedCode] = useState<WinCode>(
        match.matchWinCode ?? (inferred ? "WIN" : "WIN")
    )
    const [pushState, setPushState] = useState<PushState>(
        match.status === "confirmed" ? "done" : "idle"
    )
    const [errorMsg, setErrorMsg] = useState("")

    const winCodeRef = useRef<any>(null)

    async function handlePush() {
        if (!selectedWinner) return
        if (pushState === "confirming") {
            setPushState("pushing")
            try {
                props.onDeclare(selectedWinner, selectedCode)
                await props.onPushSheet()
                setPushState("done")
            } catch (e: any) {
                setErrorMsg(e?.message ?? "Lỗi không xác định")
                setPushState("error")
            }
        } else {
            setPushState("confirming")
        }
    }

    const canDeclare = !!selectedWinner && wins.blue !== wins.red
    const isDone = pushState === "done"
    const isAlreadyDeclared = match.status === "confirmed"

    return (
        <div className="flex flex-col gap-[16px]">

            {/* Tổng hiệp thắng */}
            <div className="flex items-center justify-center gap-[16px]">
                <span className="font-score text-[28px] font-bold text-blue-300 leading-none">
                    {wins.blue}
                </span>
                <span className="text-[14px] text-white/40">hiệp thắng</span>
                <span className="font-score text-[28px] font-bold text-red-300 leading-none">
                    {wins.red}
                </span>
            </div>

            {/* Chọn người thắng */}
            <div className="flex gap-[10px]">
                <WinnerCard
                    side="blue"
                    name={match.blue.name}
                    isSelected={selectedWinner === "blue"}
                    onClick={() => pushState !== "pushing" && setSelectedWinner("blue")}
                />
                <WinnerCard
                    side="red"
                    name={match.red.name}
                    isSelected={selectedWinner === "red"}
                    onClick={() => pushState !== "pushing" && setSelectedWinner("red")}
                />
            </div>

            {/* Win code */}
            <button
                disabled={pushState === "pushing"}
                onClick={() => winCodeRef.current?.setVisible(true)}
                className="flex items-center justify-between px-[16px] py-[12px]
                    bg-white/5 rounded-[12px] active:bg-white/10 transition-colors"
            >
                <span className="text-[14px] text-white/60">Mã kết quả</span>
                <div className="flex items-center gap-[8px]">
                    <span className="font-mono font-bold text-[14px] text-amber-400">
                        {selectedCode}
                    </span>
                    <span className="text-[10px] text-white/30">
                        {WIN_CODES.find(w => w.key === selectedCode)?.description}
                    </span>
                    {!isDone && <span className="text-[10px] text-white/40">▼</span>}
                </div>
            </button>

            {/* Nút công bố / push */}
            {(pushState === "idle" || pushState === "confirming" || pushState === "error" || pushState === "pushing") && !isDone && (
                <div className="flex flex-col gap-[8px]">
                    {pushState === "confirming" && (
                        <div className="flex items-center gap-[8px] px-[14px] py-[10px]
                            bg-amber-500/10 border border-amber-500/30 rounded-[10px]">
                            <span className="text-[12px] text-amber-300">
                                Xác nhận công bố{" "}
                                <span className={selectedWinner === "blue" ? "text-blue-300 font-bold" : "text-red-300 font-bold"}>
                                    {selectedWinner === "blue" ? match.blue.name : match.red.name}
                                </span>
                                {" "}thắng với mã{" "}
                                <span className="font-mono font-bold">{selectedCode}</span>?
                                {props.sheetConnected && " Kết quả sẽ được ghi vào Google Sheet."}
                            </span>
                        </div>
                    )}

                    {pushState === "error" && (
                        <div className="px-[14px] py-[10px] bg-red-500/10 border border-red-500/30 rounded-[10px]">
                            <span className="text-[12px] text-red-300">{errorMsg}</span>
                        </div>
                    )}

                    <div className="flex gap-[8px]">
                        {pushState === "confirming" && (
                            <button
                                onClick={() => setPushState("idle")}
                                className="flex-1 py-[12px] rounded-[12px] text-[14px] font-medium
                                    bg-white/10 text-white/60 active:bg-white/20 transition-colors"
                            >
                                Huỷ
                            </button>
                        )}

                        <button
                            disabled={!canDeclare || pushState === "pushing"}
                            onClick={handlePush}
                            className={`flex-1 py-[12px] rounded-[12px] text-[14px] font-semibold
                                transition-colors
                                ${!canDeclare
                                    ? "bg-white/5 text-white/20 cursor-not-allowed"
                                    : pushState === "pushing"
                                        ? "bg-green-700/50 text-white/60 cursor-wait"
                                        : pushState === "confirming"
                                            ? "bg-green-600 text-white active:bg-green-700"
                                            : "bg-white/10 text-white active:bg-white/20"
                                }`}
                        >
                            {pushState === "pushing" ? "Đang ghi..." :
                                pushState === "confirming" ? "Xác nhận & Ghi Sheet" :
                                    props.sheetConnected ? "Công bố & Ghi Sheet" : "Công bố kết quả"}
                        </button>
                    </div>
                </div>
            )}

            {/* Đã hoàn thành — có thể ghi đè */}
            {isDone && (
                <div className="flex flex-col gap-[8px]">
                    <div className="flex items-center justify-center gap-[8px] py-[12px]
                        bg-green-500/10 border border-green-500/30 rounded-[12px]">
                        <span className="text-[13px] text-green-400 font-medium">
                            ✓ Đã ghi kết quả{props.sheetConnected ? " vào Google Sheet" : ""}
                        </span>
                    </div>
                    <button
                        onClick={() => setPushState("idle")}
                        className="w-full py-[10px] rounded-[10px] text-[12px] text-white/30
                            border border-white/8 bg-white/3 active:bg-white/8 transition-colors"
                    >
                        Ghi đè kết quả
                    </button>
                </div>
            )}

            {/* Win code picker */}
            <PopupOverlay ref={winCodeRef} className="flex flex-col justify-end">
                <Selector
                    title="Chọn mã kết quả trận đấu"
                    data={WIN_CODES.map(w => ({ key: w.key, description: w.description }))}
                    value={selectedCode}
                    onValueChanged={(v) => {
                        setSelectedCode(v as WinCode)
                        winCodeRef.current?.setVisible(false)
                    }}
                />
            </PopupOverlay>
        </div>
    )
}