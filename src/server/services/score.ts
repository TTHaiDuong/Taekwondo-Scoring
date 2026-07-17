import { TIMER_DB, MatchTimer, getRemainingMs } from "./timer.js"
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

                if (current.voters.size >= (setting?.voteThreshold || 2)) {
                    if (!PENDING_VOTES.has(voteKey)) return

                    const judgeOrders = [...current.voters].map((id) => getJudgeOrder(courtId, id))
                    updatedScore(io, courtId,
                        round,
                        current.side,
                        current.pointType,
                        "increase",
                        "judge",
                        judgeOrders
                    )

                    io.to(`court-${courtId}`).emit("judge:commit", {
                        side: side,
                        pointType: pointType,
                        votersOrder: [...current.voters].map(v => getJudgeOrder(courtId, v))
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

    // if (pending.voters.size >= (setting?.voteThreshold || 2)) {
    // if (!PENDING_VOTES.has(voteKey)) return
    // clearTimeout(pending.timeout)

    // const judgeOrders = [...pending.voters].map((id) => getJudgeOrder(courtId, id))
    // updatedScore(io, courtId,
    //     round,
    //     pending.side,
    //     pending.pointType,
    //     "increase",
    //     "judge",
    //     judgeOrders
    // )

    // io.to(`court-${courtId}`).emit("judge:commit", {
    //     side: side,
    //     pointType: pointType,
    //     votersOrder: [...pending.voters].map(v => getJudgeOrder(courtId, v))
    // })

    // PENDING_VOTES.delete(voteKey)
    // }
}

/** Key: courtId|roundNo
 * key: real timestamp - Date.now()
 */
const SCORE_EVENTS: Map<string, Map<number, ScoreEvent>> = new Map()

function scoreEventKey(courtId: string, roundNo: number) {
    return `${courtId}|${roundNo}`
}

function addScoreEvent(
    courtId: string,
    roundNo: number,
    event: ScoreEvent
) {
    const test = TEST_ROOMS.get(courtId)
    if (test) return

    const key = scoreEventKey(courtId, roundNo)
    let round = SCORE_EVENTS.get(key)

    if (!round) {
        round = new Map()
        SCORE_EVENTS.set(key, round)
    }
    round.set(Date.now(), event)
}

export function updatedScore(
    io: any,
    courtId: string,
    round: RoundResult,
    side: Side,
    pointType: PointType,
    value: number | "increase" | "decrease",
    scoreChangeBy: "operator" | "judge",
    judgeNumber?: (number | undefined)[]
) {
    const breakdown = side === "blue" ? "blueBreakdown" : "redBreakdown"
    const current = round[breakdown][pointType]

    let next: number

    if (typeof value === "number") {
        next = value
    } else if (value === "increase") {
        next = current + 1
    } else {
        next = current - 1
        if (round[breakdown][pointType] === 0) return
    }

    const newValue = Math.max(0, next)
    round[breakdown][pointType] = newValue

    io.to(`court-${courtId}`).emit(`score:${side}:update`, {
        breakdown: round[breakdown]
    })

    const remainingMs = getRemainingMs(courtId)
    const totalScore = inferRoundWinner(round.blueBreakdown, round.redBreakdown)

    const scoreEvent: ScoreEvent = {
        blueScore: totalScore.totalBlue,
        redScore: totalScore.totalRed,
        remainingMs: remainingMs,
        pointType: pointType,
        scoreChangeBy: scoreChangeBy,
        judgeNumber: judgeNumber,
        action: typeof value === "number" ? "set" : value,
        side: side,
        timestamp: Date.now()
    }
    addScoreEvent(courtId, 1, scoreEvent)

    io.to(`court-${courtId}`).emit("score:event:add", scoreEvent)
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
        round.blueBreakdown = emptyBreakdown()
        round.redBreakdown = emptyBreakdown()

        const scoreEKey = scoreEventKey(data.courtId, 1)
        SCORE_EVENTS.delete(scoreEKey)

        io.to(`court-${data.courtId}`).emit("score:reset")
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

    socket.on("score:events:get", (data: { courtId: string }, callback: (events?: ScoreEvent[]) => void) => {
        const scoreEKey = scoreEventKey(data.courtId, 1)
        const events = SCORE_EVENTS.get(scoreEKey)
        callback(events ? [...events.values()] : undefined)
    })
}

export function getScoreEventsInRange(
    courtId: string,
    roundNo: number,
    fromMs: number,
    toMs: number
): ScoreEvent[] {
    const key = scoreEventKey(courtId, roundNo)
    const round = SCORE_EVENTS.get(key)
    if (!round) return []

    // Lấy sự kiện NGAY TRƯỚC fromMs (để biết trạng thái điểm tại đầu clip,
    // không phải chỉ những sự kiện xảy ra bên trong khoảng) + toàn bộ sự
    // kiện bên trong [fromMs, toMs].
    const all = [...round.entries()].sort((a, b) => a[0] - b[0])
    const result: ScoreEvent[] = []
    let lastBefore: ScoreEvent | null = null

    for (const [ts, evt] of all) {
        if (ts < fromMs) {
            lastBefore = evt
        } else if (ts <= toMs) {
            result.push(evt)
        } else {
            break
        }
    }

    if (lastBefore) result.unshift(lastBefore)
    return result
}