import { TIMERS, MatchTimer, getRemainingMs, TIMER_HISTORY, pushTimerReset } from "./timer.js"
import { settings as MATCHS_CONFIG } from "./setting.js"
import { getRound, getJudgeOrder } from "./match.js"
import {
    Side,
    Round,
    PointType,
    emptyBreakdown,
    ScoreEvent,
    inferScoreLeader,
    SIDE,
    POINT_TYPE,
} from "../../scripts/match-types.js"
import { TEST_ROOMS } from "./testmode.js"
import { isPlainObject } from "@/utils/types.js"
import { DefaultEventsMap, Server, Socket } from "socket.io"

/** Giám định có thể tác động tới các điểm số ngoại trừ các điểm Gam-jeom. */
export type JudgePointType = Exclude<PointType, "eeljeom" | "eejeom">

export type PressBuffer = {
    presses: JudgePointType[]
    timeout: NodeJS.Timeout
}
/**  */
const PRESS_BUFFERS: Map<string, PressBuffer> = new Map()

/** 
 * Hàm được kích hoạt sau khi kết thúc thời gian nhấn combo.
 * @param presses Danh sách các điểm mà giám định bấm trong cửa sổ thời gian nhấn combo.
 * @returns Danh sách các điểm sau khi được hợp nhất.
 * @example 
 * const merged = mergeCombos(["trunkKick", "trunkKick"])
 * console.log(merged) // ["spinTrunk"] 
 */
function mergeCombos(presses: JudgePointType[]): JudgePointType[] {
    const result: JudgePointType[] = []
    let i = 0

    while (i < presses.length) {
        const current = presses[i]
        const next = presses[i + 1]

        if (current === "trunkKick" && next === "trunkKick") {
            result.push("spinTrunk")
            i += 2
        }
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

export type PendingVote = {
    courtId: string
    side: Side
    pointType: JudgePointType
    voters: Set<string>
    timeout: NodeJS.Timeout
    scoreEvent?: ScoreEvent
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
    round: Round,
    judgeId: string,
    side: Side,
    pointType: JudgePointType,
    timer?: MatchTimer,
) {
    const voteKey = createVoteKey(courtId, side, pointType)
    const config = MATCHS_CONFIG.get(courtId)
    let pending = PENDING_VOTES.get(voteKey)

    if (!pending && (!timer || timer.isRunning)) {
        const timeout = setTimeout(() => {
            const current = PENDING_VOTES.get(voteKey)
            if (!current) return

            if (current.scoreEvent) {
                current.scoreEvent.voters = [...current.voters]
                    .map(judgeId => getJudgeOrder(courtId, judgeId))
                    .filter(judgeOrder => judgeOrder !== undefined)

                io.to(`court-${courtId}`).emit("judge:commit", {
                    side: side,
                    pointType: pointType,
                    votersOrder: current.scoreEvent.voters,
                    timestamp: current.scoreEvent.timestamp
                })
            }

            PENDING_VOTES.delete(voteKey)
        }, config?.pendingVoteMs || 1000)

        pending = {
            courtId: courtId,
            side: side,
            pointType: pointType,
            voters: new Set<string>([judgeId]),
            timeout: timeout
        }

        PENDING_VOTES.set(voteKey, pending)
        return
    }

    if (!pending) return
    if (pending.voters.has(judgeId)) return
    pending.voters.add(judgeId)

    if (pending.voters.size >= (config?.voteThreshold || 2)
        && !pending.scoreEvent) {
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


function getOrCreateList(courtId: string): ScoreHistoryEntry[] {
    let list = SCORE_EVENTS.get(courtId)
    if (!list) {
        list = []
        SCORE_EVENTS.set(courtId, list)
    }
    return list
}

/** MỚI: đẩy 1 MỐC RESET — không xoá gì cả, chỉ đánh dấu ranh giới "điểm
 * đã bị xoá kể từ đây" để tua lại về TRƯỚC mốc này vẫn đúng dữ liệu cũ. */
export function pushScoreReset(courtId: string): ScoreHistoryEntry {
    const test = TEST_ROOMS.get(courtId)
    const list = getOrCreateList(courtId)
    const entry: ScoreHistoryEntry = { timestamp: Date.now(), event: null }
    if (!test) list.push(entry)
    return entry
}

export function addScoreEvent(
    courtId: string,
    event?: ScoreEvent
) {
    const test = TEST_ROOMS.get(courtId)
    if (test) return

    const list = getOrCreateList(courtId)
    if (event) list.push({ timestamp: event.timestamp, event })
}

export function updatedScore(
    io: any,
    courtId: string,
    round: Round,
    side: Side,
    pointType: PointType,
    value: number | "increase" | "decrease",
    scoreChangedBy: "operator" | "judge",
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
    const totalScore = inferScoreLeader(round.blueBreakdown, round.redBreakdown)

    const scoreEvent: ScoreEvent = {
        blueScore: totalScore.totalBlue,
        redScore: totalScore.totalRed,
        blueGamjeom: round.blueBreakdown.eeljeom + round.blueBreakdown.eejeom,
        redGamjeom: round.redBreakdown.eeljeom + round.redBreakdown.eejeom,
        leadingSide: totalScore.leader,
        remainingMs: remainingMs,
        timestamp: Date.now(),
        side: side,
        pointType: pointType,
        scoreChangedBy: scoreChangedBy,
        action: typeof value === "number" ? "set" : value,
    }
    addScoreEvent(courtId, scoreEvent)

    io.to(`court-${courtId}`).emit("score:event:add", {
        timestamp: scoreEvent.timestamp,
        event: scoreEvent
    })

    return scoreEvent
}

export function handleJudgeScore(io: any, judgeId: string,
    courtId: string,
    round: Round,
    side: Side,
    pointType: JudgePointType,
    timer?: MatchTimer
) {
    const config = MATCHS_CONFIG.get(courtId)

    let buffer = PRESS_BUFFERS.get(judgeId)

    if (!buffer) {
        const timeout = setTimeout(() => {
            let buffer = PRESS_BUFFERS.get(judgeId)
            if (!buffer) return

            const megedCombo = mergeCombos(buffer.presses)
            megedCombo.forEach(point => {
                // Thông báo cho các client về combo điểm mới
                const judgeOrder = getJudgeOrder(courtId, judgeId)
                if (judgeOrder !== undefined && point !== pointType)
                    io.to(`court-${courtId}`).emit("judge:press", {
                        judgeOrder: judgeOrder,
                        side: side,
                        pointType: point
                    })

                startVote(io, courtId, round, judgeId, side, point, timer)
            })

            PRESS_BUFFERS.delete(judgeId)
        }, config?.pressBufferMs || 400)

        const newBuffer: PressBuffer = {
            presses: [],
            timeout: timeout
        }
        PRESS_BUFFERS.set(judgeId, newBuffer)
        buffer = newBuffer
    }

    buffer.presses.push(pointType)

    // Dừng sớm khi một giám định bấm combo
    // Bởi vì mỗi combo bấm chỉ có 2 lần bấm và trong combo không có điểm 1
    if (buffer.presses.length >= 2 || pointType === "punch") {
        clearTimeout(buffer.timeout)

        const megedCombo = mergeCombos(buffer.presses)
        megedCombo.forEach(point => {
            // Thông báo cho các client về combo điểm mới
            const judgeOrder = getJudgeOrder(courtId, judgeId)
            if (judgeOrder !== undefined && point !== pointType)
                io.to(`court-${courtId}`).emit("judge:press", {
                    judgeOrder: judgeOrder,
                    side: side,
                    pointType: point
                })

            startVote(io, courtId, round, judgeId, side, point, timer)
        })

        PRESS_BUFFERS.delete(judgeId)
    }
}

export default function initScoreChannel(
    io: Server<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any>,
    socket: Socket<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any>
) {
    socket.on("score:operator:update", (
        data: {
            side: Side,
            pointType: PointType,
            value: number | "increase" | "decrease"
        },
        // callback?: () => void
    ) => {
        if (!isPlainObject(data)) return
        if (!SIDE.includes(data.side)) return
        if (!POINT_TYPE.includes(data.pointType)) return
        if (typeof data.value !== "number"
            && data.value !== "increase"
            && data.value !== "decrease") return

        const courtId = socket.data.courtId

        const round = TEST_ROOMS.get(courtId) || getRound(courtId)
        if (!round) return

        updatedScore(io, courtId, round, data.side, data.pointType, data.value, "operator")
    })

    socket.on("currentRound:score:clear", () => {
        const courtId = socket.data.courtId

        const round = getRound(courtId)
        if (!round) return
        round.blueBreakdown = emptyBreakdown()
        round.redBreakdown = emptyBreakdown()

        const scoreResetEntry = pushScoreReset(courtId)
        io.to(`court-${courtId}`).emit("score:event:add", scoreResetEntry)

        const timerResetEntry = pushTimerReset(courtId)
        io.to(`court-${courtId}`).emit("timer:event:add", timerResetEntry)

        io.to(`court-${courtId}`).emit("score:reset")

        const scoreEvts = SCORE_EVENTS.get(courtId)
        if (scoreEvts) SCORE_EVENTS_BREAK.set(courtId, scoreEvts.length)
    })

    socket.on("score:judge:update", (data: {
        side: Side,
        pointType: JudgePointType
    }) => {
        if (!isPlainObject(data)) return
        if (!SIDE.includes(data.side)) return
        if (!POINT_TYPE.includes(data.pointType)) return

        const courtId = socket.data.courtId

        const test = TEST_ROOMS.get(courtId)
        const round = test || getRound(courtId)
        if (!round) return

        const timer = test ? undefined : TIMERS.get(courtId)

        // Thông báo cho các client khác biết là giám định đã nhấn.
        // Nhưng các phím điểm này chưa được hợp nhất.
        const judgeOrder = getJudgeOrder(courtId, socket.id)
        if (judgeOrder !== undefined)
            io.to(`court-${courtId}`).emit("judge:press", {
                judgeOrder: judgeOrder,
                side: data.side,
                pointType: data.pointType
            })

        handleJudgeScore(io, socket.id, courtId, round, data.side, data.pointType, timer)
    })

    socket.on("score:events:get", (_, callback?: (entries?: ScoreHistoryEntry[]) => void) => {
        const courtId = socket.data.courtId

        const events = SCORE_EVENTS.get(courtId)
        if (typeof callback === "function") callback(events)
    })

    socket.on("score:events:short:get", (_, callback?: (entries?: ScoreHistoryEntry[]) => void) => {
        const courtId = socket.data.courtId

        const events = SCORE_EVENTS.get(courtId)
        const start = SCORE_EVENTS_BREAK.get(courtId) || 0
        const slicedEvents = events?.slice(start) || []
        if (typeof callback === "function") callback(slicedEvents)
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