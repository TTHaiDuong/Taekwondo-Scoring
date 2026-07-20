"use client"

import { useEffect, useState } from "react"
import { ScoreEvent, RoundResult, POINT_MAP, Side, PointType } from "../scripts/match-types"
import { getSingletonSocket } from "@/scripts/global-client-io"
import { JudgePointType, ScoreHistoryEntry } from "@/server/services/score"

// ============================================================
// SCORE HISTORY — Timeline điểm từng hiệp + undo
// ============================================================

function formatRemainingTime(ms: number): string {
    if (ms < 10000) return (ms / 1000).toFixed(2)
    const totalSec = Math.floor(ms / 1000)
    const min = Math.floor(totalSec / 60)
    const sec = totalSec % 60
    return `${min}:${sec.toString().padStart(2, "0")}s`
}

function EventItem(props: {
    event: ScoreEvent
    onUndo?: () => void
    isLast: boolean
}) {
    const { event } = props
    const isBlue = event.side === "blue"
    const isGj = event.pointType === "gamjeom" || event.pointType === "eejeom"
    const pts = POINT_MAP[event.pointType]

    // Dấu +/- dựa theo action thực tế, không suy luận từ side nữa
    const actionSign =
        event.action === "decrease" ? "−" :
            event.action === "set" ? "=" : "+"

    const isDecrease = event.action === "decrease"
    const isSet = event.action === "set"

    // Nguồn ghi điểm: operator (bàn điều khiển) hay judge (giám khảo bấm)
    const isJudgeScored = event.scoreChangeBy === "judge"
    const activeJudges = event.judgeNumber?.filter((j): j is number => j !== undefined) ?? []

    return (
        <div className={`flex items-center gap-[10px] py-[8px] px-[4px]
            ${props.isLast ? "" : "border-b border-white/5"}
            ${isDecrease ? "opacity-50" : ""}`}>

            {/* Đồng hồ lúc ghi */}
            <span className="text-[13px] text-white/40 w-[36px] shrink-0 text-right">
                {event.remainingMs !== undefined ? formatRemainingTime(event.remainingMs) : "_"}
            </span>

            {/* Điểm xanh */}
            <span className={`text-[16px] w-[24px] text-center leading-none
                ${isBlue && !isGj ? "text-blue-300 font-bold" : "text-white/20"}`}>
                {isBlue && !isGj ? `${actionSign}${pts}` : ""}
            </span>

            {/* Mô tả sự kiện */}
            <div className="flex-1 flex flex-col gap-[1px] min-w-0">
                <span className={`text-[13px] w-full font-medium truncate
                    ${isGj
                        ? isBlue ? "text-red-300" : "text-blue-300 text-right"  // GJ đội nào bị phạt thì đội kia được điểm
                        : isBlue ? "text-blue-300" : "text-red-300 text-right"
                    }`}>
                    {isBlue ? "Xanh" : "Đỏ"}
                    {isGj && (
                        <span className="text-white/40 font-normal">
                            {" "}
                            {event.pointType === "gamjeom" ? "Gam-jeom" : "Ee-jeom"}
                            {` (${actionSign}${pts} cho ${isBlue ? "Đỏ" : "Xanh"})`}
                        </span>
                    )}
                    {isSet && <span className="text-white/40 font-normal"> (chỉnh tay)</span>}
                </span>

                {/* Nguồn ghi điểm — operator hay judge, kèm số hiệu judge nếu có */}
                <span className={`text-[10px] text-white/30 ${isBlue ? "" : "text-right"}`}>
                    {isJudgeScored
                        ? `Giám khảo${activeJudges.length > 0 ? ` #${activeJudges.map(o => o + 1).join(", #")}` : ""}`
                        : "Bàn điều khiển"}
                </span>
            </div>

            {/* Điểm đỏ */}
            <span className={`text-[16px] w-[24px] text-center leading-none
                ${!isBlue && !isGj ? "text-red-300 font-bold" : "text-white/20"}`}>
                {!isBlue && !isGj ? `${actionSign}${pts}` : ""}
            </span>

            {/* Tổng điểm sau sự kiện này */}
            <div className="text-[12px] text-white/30 w-[40px] text-right shrink-0">
                <span className="text-blue-300">{event.blueScore} </span>
                :
                <span className="text-red-300"> {event.redScore}</span>
            </div>

            {/* Nút undo (chỉ hiện ở event cuối cùng) */}
            {props.isLast && props.onUndo && (
                <button
                    onClick={props.onUndo}
                    className="flex-center px-[8px] py-[3px] rounded-[6px] text-[11px] font-medium
                        bg-amber-500/20 text-amber-400 active:bg-amber-500/40 transition-colors shrink-0"
                >
                    Hoàn tác
                </button>
            )}
        </div>
    )
}
export default function ScoreHistory(props: {
    courtId: string
    roundNo: 1 | 2 | 3 | "golden"
    onUndo?: () => void
}) {
    const [events, setEvents] = useState<ScoreEvent[]>()

    useEffect(() => {
        const socket = getSingletonSocket()

        socket.emit("score:events:get", { courtId: props.courtId, operator: true }, (events: ScoreHistoryEntry[]) => {
            const evts = events
                .filter((e): e is ScoreHistoryEntry & { event: ScoreEvent } => e.event !== null)
                .map(e => e.event)

            setEvents(evts)
        })

        const onAdd = (event: ScoreHistoryEntry | ScoreHistoryEntry[]) => {
            console.log(event)
            if (Array.isArray(event)) {
                const evts = event
                    .filter((e): e is ScoreHistoryEntry & { event: ScoreEvent } => e.event !== null)
                    .map(e => e.event)

                setEvents(evts)
                return
            }
            setEvents(prev => [...(prev ? prev : []), ...(event.event ? [event.event] : [])])
        }

        const onClear = () => {
            setEvents(undefined)
        }

        socket.on("score:event:add", onAdd)
        socket.on("score:reset", onClear)
        socket.on("judge:commit", (data: {
            side: Side,
            pointType: JudgePointType,
            votersOrder: number[],
            timestamp: number
        }) => {
            if (!events) return
            events.forEach(e => {
                if (e.timestamp === data.timestamp
                    && e.pointType === data.pointType
                    && e.side === data.side
                ) {
                    e.judgeNumber = data.votersOrder
                }
            })
            setEvents([...events])
        })

        return () => {
            socket.off("score:event:add", onAdd)
            socket.off("score:reset", onClear)
        }
    }, [props.courtId, events])

    if (!events || events.length === 0) {
        return (
            <div className="flex-center py-[24px] text-[13px] text-white/30">
                {events ? "Chưa có điểm nào trong hiệp này" : "Hiệp này chưa diễn ra"}
            </div>
        )
    }

    const visibleEvents = [...events].reverse()
    // .filter(e => e.delta !== -1)

    const label = props.roundNo === "golden" ? "Golden Point" : `Hiệp ${props.roundNo}`

    return (
        <div className="flex flex-col" style={{ touchAction: "pan-y" }}>
            <div className="flex items-center justify-between px-[4px] pb-[8px]
                border-b border-white/10 mb-[4px]">
                <span className="text-[12px] font-semibold text-white/50 uppercase tracking-wider">
                    {label} — {visibleEvents.length} lần ghi điểm
                </span>
                <div className="flex gap-[16px]">
                    <span className="text-[11px] text-white/30">TG</span>
                    <span className="text-[11px] text-blue-400 w-[24px] text-center">X</span>
                    <span className="text-[11px] text-red-400 w-[24px] text-center">Đ</span>
                    <span className="text-[11px] text-white/30 w-[36px] text-right">Tổng</span>
                </div>
            </div>

            {visibleEvents.map((ev, idx) => (
                <EventItem
                    key={idx}
                    event={ev}
                    isLast={idx === visibleEvents.length - 1}
                    onUndo={idx === visibleEvents.length - 1 ? props.onUndo : undefined}
                />
            ))}
        </div>
    )
}