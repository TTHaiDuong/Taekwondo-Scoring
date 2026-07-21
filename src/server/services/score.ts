import { TIMER_DB, MatchTimer, getRemainingMs, TIMER_HISTORY, pushTimerReset } from "./timer.js"
import { settings } from "./setting.js"
import { getRound, JUDGES_INFO, getJudgeOrder } from "./match.js"
import {
    Side,
    ScoreBreakdown,
    RoundResult,
    PointType,
    emptyBreakdown,
    ScoreEvent,
    inferRoundWinner,
} from "../../scripts/match-types.js"
import { TEST_ROOMS } from "./testmode.js"


// export type OperatorUpdateScoreData = {
//     side: Side
//     pointType: PointType
//     value: number | "increase" | "decrease"
// }

// export type JudgeUpdateScoreData = {
//     side: Side
//     pointType: JudgePointType
// }

export type JudgePointType = Exclude<PointType, "gamjeom" | "eejeom">

export type PressBuffer = {
    presses: JudgePointType[]
    timeout: NodeJS.Timeout
}

export type PendingVote = {
    courtId: string
    side: Side
    pointType: JudgePointType
    voters: Set<string>
    timeout: NodeJS.Timeout
    scoreEvent?: ScoreEvent
}

/**  */
const PRESS_BUFFERS: Map<string, PressBuffer> = new Map()

/** Hàm được kích hoạt sau khi kết thúc thời gian nhấn combo */
function mergeCombos(presses: JudgePointType[]): JudgePointType[] {
    const result: JudgePointType[] = []
    let i = 0

    while (i < presses.length) {
        const current = presses[i]
        const next = presses[i + 1]

        // 2 + 2 => 4
        if (current === "trunkKick" && next === "trunkKick") {
            result.push("spinTrunk")
            i += 2
        }
        // 3 + 3 => 6
        else if (current === "headKick" && next === "headKick") {
            result.push("spinHead")
            i += 2
        }
        // không combo
        else {
            result.push(current)
            i += 1
        }
    }

    return result
}

function finalizePress(
    judgeId: string,
    presses: JudgePointType[]
): JudgePointType[] {
    PRESS_BUFFERS.delete(judgeId)
    return mergeCombos(presses)
}

/**
 * Lưu trạng thái vote của các giám định.
 * @remarks Đối tượng sẽ bị huỷ sau khoảng thời gian chờ vote.
 * @see createVoteKey - Khoá của đối tượng
 */
const PENDING_VOTES: Map<string, PendingVote> = new Map()

function createVoteKey(
    courtId: string,
    side: Side,
    pointType: JudgePointType
) {
    return `${courtId}|${side}|${pointType}`
}

function startVote(
    io: any,
    courtId: string,
    round: RoundResult,
    judgeId: string,
    side: Side,
    pointType: JudgePointType,
    timer: MatchTimer | undefined,
) {
    const voteKey = createVoteKey(courtId, side, pointType)
    const setting = settings.get(courtId)
    let pending = PENDING_VOTES.get(voteKey)

    if (!pending && (!timer || timer.isRunning)) {
        pending = {
            courtId: courtId,
            side: side,
            pointType: pointType,
            voters: new Set<string>([judgeId]),
            timeout: setTimeout(() => {
                const current = PENDING_VOTES.get(voteKey)
                if (!current) return

                if (current.scoreEvent) {
                    current.scoreEvent.judgeNumber =
                        [...current.voters].map(v => getJudgeOrder(courtId, v))

                    io.to(`court-${courtId}`).emit("judge:commit", {
                        side: side,
                        pointType: pointType,
                        votersOrder: current.scoreEvent.judgeNumber,
                        timestamp: current.scoreEvent.timestamp
                    })
                }

                PENDING_VOTES.delete(voteKey)
            },
                setting?.pendingVoteMs || 1000)
        }

        PENDING_VOTES.set(voteKey, pending)
        return
    }

    if (!pending) return
    if (pending.voters.has(judgeId)) return
    pending.voters.add(judgeId)

    if (pending.voters.size >= (setting?.voteThreshold || 2)) {
        if (!PENDING_VOTES.has(voteKey)) return

        if (pending.scoreEvent) return
        pending.scoreEvent = updatedScore(io, courtId,
            round,
            pending.side,
            pending.pointType,
            "increase",
            "judge",
        )
    }
}

export type ScoreHistoryEntry = {
    timestamp: number
    event: ScoreEvent | null
}

/** Key: courtId|roundNo → mảng lịch sử theo thứ tự thời gian */
const SCORE_EVENTS: Map<string, ScoreHistoryEntry[]> = new Map()
/** Key: courtId|roundNo
 * key: real timestamp - Date.now()
 */
const SCORE_EVENTS_BREAK: Map<string, number> = new Map()

function scoreEventKey(courtId: string, roundNo: number) {
    return `${courtId}|${roundNo}`
}

function getOrCreateList(courtId: string, roundNo: number): ScoreHistoryEntry[] {
    const key = scoreEventKey(courtId, roundNo)
    let list = SCORE_EVENTS.get(key)
    if (!list) {
        list = []
        SCORE_EVENTS.set(key, list)
    }
    return list
}

/** MỚI: đẩy 1 MỐC RESET — không xoá gì cả, chỉ đánh dấu ranh giới "điểm
 * đã bị xoá kể từ đây" để tua lại về TRƯỚC mốc này vẫn đúng dữ liệu cũ. */
export function pushScoreReset(courtId: string, roundNo: number): ScoreHistoryEntry {
    const test = TEST_ROOMS.get(courtId)
    const list = getOrCreateList(courtId, roundNo)
    const entry: ScoreHistoryEntry = { timestamp: Date.now(), event: null }
    if (!test) list.push(entry)
    return entry
}

export function addScoreEvent(
    courtId: string,
    roundNo: number,
    event?: ScoreEvent
) {
    const test = TEST_ROOMS.get(courtId)
    if (test) return

    const list = getOrCreateList(courtId, roundNo)
    if (event) list.push({ timestamp: event.timestamp, event })
}

export function updatedScore(
    io: any,
    courtId: string,
    round: RoundResult,
    side: Side,
    pointType: PointType,
    value: number | "increase" | "decrease",
    scoreChangeBy: "operator" | "judge",
) {
    const breakdown = side === "blue" ? "blueBreakdown" : "redBreakdown"
    if (round.blueBreakdown === null) round.blueBreakdown = emptyBreakdown()
    if (round.redBreakdown === null) round.redBreakdown = emptyBreakdown()
    const current = round[breakdown]![pointType]

    let next: number

    if (typeof value === "number") {
        next = value
    } else if (value === "increase") {
        next = current + 1
    } else {
        next = current - 1
        if (round[breakdown]![pointType] === 0) return
    }

    const newValue = Math.max(0, next)
    round[breakdown]![pointType] = newValue

    io.to(`court-${courtId}`).emit(`score:${side}:update`, {
        breakdown: round[breakdown]
    })

    const remainingMs = getRemainingMs(courtId)
    const totalScore = inferRoundWinner(round.blueBreakdown, round.redBreakdown)

    const scoreEvent: ScoreEvent = {
        blueScore: totalScore.totalBlue,
        blueGamjeom: round.blueBreakdown.gamjeom + round.blueBreakdown.eejeom,
        redScore: totalScore.totalRed,
        redGamjeom: round.redBreakdown.gamjeom + round.redBreakdown.eejeom,
        remainingMs: remainingMs,
        pointType: pointType,
        scoreChangeBy: scoreChangeBy,
        action: typeof value === "number" ? "set" : value,
        side: side,
        timestamp: Date.now(),
        leadingSide: totalScore.winner
    }
    addScoreEvent(courtId, 1, scoreEvent)

    io.to(`court-${courtId}`).emit("score:event:add", { timestamp: scoreEvent.timestamp, event: scoreEvent })

    return scoreEvent
}

export function handleJudgeScore(io: any, judgeId: string,
    courtId: string,
    round: RoundResult,
    side: Side,
    pointType: JudgePointType,
    timer?: MatchTimer
) {
    const setting = settings.get(courtId)

    // Judge chỉ bấm được điểm khi đồng hồ chạy
    // Khi thời gian hiệp đấu kết thúc, không cho tạo thêm pending vote nhưng vẫn cho phép
    // bỏ phiếu khi pending vote đã được tạo ngay trước khi hiệp đấu vừa mới hết
    // if (timer && (!timer.isRunning
    //     && (timer.remainingMs !== 0 || !setting?.allowPostTimeVote))) return

    let buffer = PRESS_BUFFERS.get(judgeId)

    if (!buffer) {
        const newBuffer: PressBuffer = {
            presses: [],
            timeout: setTimeout(() => {
                finalizePress(judgeId, newBuffer.presses)
                    .forEach(point => {
                        const judgeOrder = getJudgeOrder(courtId, judgeId)

                        if (judgeOrder !== undefined && point !== pointType)
                            io.to(`court-${courtId}`).emit("judge:press", {
                                judgeOrder: judgeOrder,
                                side: side,
                                pointType: point
                            })

                        startVote(io, courtId, round, judgeId, side, point, timer)
                    })
            },
                setting?.pressBufferMs || 400)
        }
        PRESS_BUFFERS.set(judgeId, newBuffer)
        buffer = newBuffer
    }

    buffer.presses.push(pointType)

    // Dừng sớm khi một giám định bấm combo
    // Bởi vì mỗi combo bấm chỉ có 2 lần bấm và trong combo không có điểm 1
    if (buffer.presses.length >= 2 || pointType === "punch") {
        clearTimeout(buffer.timeout)
        finalizePress(judgeId, buffer.presses)
            .forEach(point => {
                const judgeOrder = getJudgeOrder(courtId, judgeId)

                if (judgeOrder !== undefined && point !== pointType)
                    io.to(`court-${courtId}`).emit("judge:press", {
                        judgeOrder: judgeOrder,
                        side: side,
                        pointType: point
                    })

                startVote(io, courtId, round, judgeId, side, point, timer)
            })
    }
}

export default function initScoreChannel(io: any, socket: any) {
    // Máy điều khiển cập nhật điểm
    // Phải có vai trò là "control", courtId trong payload jwt
    socket.on("score:operator:update", (data: {
        courtId: string,
        side: Side,
        pointType: PointType,
        value: number | "increase" | "decrease"
    }) => {
        // const user = socket.user
        // if (!user || !user.courtId || user.role !== "operator") return
        // console.log(data)
        const round = TEST_ROOMS.get(data.courtId) || getRound(data.courtId)
        // console.log(round)
        if (!round) return

        updatedScore(io, data.courtId, round, data.side, data.pointType, data.value, "operator")
    })

    // Sự kiện tạm
    socket.on("score:operator:clear", (data: { courtId: string }) => {
        const round = getRound(data.courtId)
        if (!round) return
        round.blueBreakdown = null
        round.redBreakdown = null

        const scoreResetEntry = pushScoreReset(data.courtId, 1)
        io.to(`court-${data.courtId}`).emit("score:event:add", scoreResetEntry)

        pushTimerReset(data.courtId)
        io.to(`court-${data.courtId}`).emit("timer:event:add", TIMER_HISTORY.get(data.courtId)!.at(-1))

        io.to(`court-${data.courtId}`).emit("score:reset")

        const scoreKey = scoreEventKey(data.courtId, 1)
        const scoreEvts = SCORE_EVENTS.get(scoreKey)
        if (scoreEvts)
            SCORE_EVENTS_BREAK.set(data.courtId, scoreEvts.length)
    })

    // Máy giám định cập nhật điểm
    // Phải có vai trò là "judge", courtId trong payload jwt
    // Chỉ được cập nhật điểm 1, 2, 3, 4, 5 mỗi lần tăng lên 1
    // Chỉ được cập nhật khi đồng hồ đang chạy
    socket.on("score:judge:update", (data: {
        courtId: string,
        side: Side,
        pointType: JudgePointType
    }) => {
        // const user = socket.user
        // if (!user || !user.courtId || user.role !== "judge") return
        // if (!["blue", "red"].includes(data.side)) return
        // if (!POINT_TYPES.includes(data.pointType) || data.pointType === "gj") return

        const test = TEST_ROOMS.get(data.courtId)
        const round = test || getRound(data.courtId)
        if (!round) return

        const timer = test ? undefined : TIMER_DB.get(data.courtId)

        const judgeOrder = getJudgeOrder(data.courtId, socket.id)
        if (judgeOrder !== undefined)
            io.to(`court-${data.courtId}`).emit("judge:press", {
                judgeOrder: judgeOrder,
                side: data.side,
                pointType: data.pointType
            })

        handleJudgeScore(io, socket.id, data.courtId, round, data.side, data.pointType, timer)
    })

    socket.on("score:events:get", (data: { courtId: string, operator: boolean }, callback: (entries?: ScoreHistoryEntry[]) => void) => {
        const scoreEKey = scoreEventKey(data.courtId, 1)
        const events = SCORE_EVENTS.get(scoreEKey)
        if (!data.operator) {
            callback(events)
            return
        }
        const start = SCORE_EVENTS_BREAK.get(data.courtId) || 0
        const slicedEvents = events?.slice(start) || []
        callback(slicedEvents)
    })
}

export function getScoreEventsInRange(
    courtId: string,
    roundNo: number,
    fromMs: number,
    toMs: number
): ScoreHistoryEntry[] {
    const key = scoreEventKey(courtId, roundNo)
    const all = SCORE_EVENTS.get(key) ?? []
    const result: ScoreHistoryEntry[] = []
    let lastBefore: ScoreHistoryEntry | null = null

    for (const entry of all) {
        if (entry.timestamp < fromMs) {
            lastBefore = entry
        } else if (entry.timestamp <= toMs) {
            result.push(entry)
        } else {
            break
        }
    }

    if (lastBefore) result.unshift(lastBefore)
    return result
}