import { DefaultEventsMap, Server, Socket } from "socket.io"
import { getRound } from "./match"
import { addScoreEvent } from "./score"
import { isPlainObject } from "@/utils/types"

export type MatchTimer = {
    remainingMs: number
    interval?: NodeJS.Timeout
    startAt?: number
    roundMs: number
    isRunning: boolean
}

export const TIMERS: Map<string, MatchTimer> = new Map()

export type TimerEvent = {
    timestamp: number      // epoch ms — ĐÚNG thời điểm trạng thái đổi
    remainingMs: number    // remainingMs TẠI thời điểm này
    isRunning: boolean     // đồng hồ có đang chạy KỂ TỪ thời điểm này không
}

// MỚI: mỗi phần tử trong lịch sử là 1 "mốc thời gian" — event có thể null,
// nghĩa là "tại đây, đồng hồ đã bị reset, CHƯA có trạng thái chạy/dừng thật
// nào kể từ mốc này". Nhờ vẫn giữ timestamp riêng ở ngoài, binary search vẫn
// hoạt động bình thường dù event bên trong là null.
export type TimerHistoryEntry = {
    timestamp: number
    event: TimerEvent | null
}

export const TIMER_HISTORY: Map<string, TimerHistoryEntry[]> = new Map()

function pushTimerEvent(courtId: string, remainingMs: number, isRunning: boolean) {
    const list = TIMER_HISTORY.get(courtId) ?? []
    const ts = Date.now()
    list.push({ timestamp: ts, event: { timestamp: ts, remainingMs, isRunning } })
    TIMER_HISTORY.set(courtId, list)
}

// MỚI: đẩy một MỐC RESET — không phải TimerEvent thật, chỉ đánh dấu ranh
// giới "đồng hồ vừa bị khởi tạo lại, chưa từng chạy kể từ đây".
export function pushTimerReset(courtId: string) {
    const timeEvent = { timestamp: Date.now(), event: null }
    let list = TIMER_HISTORY.get(courtId)
    if (!list) {
        list = []
        TIMER_HISTORY.set(courtId, list)
    }
    list.push(timeEvent)
    return timeEvent
}

export function initTimer(io: any,
    courtId: string,
    roundMs: number
) {
    const timer = TIMERS.get(courtId)
    if (timer) stopTimer(io, courtId, timer)

    const newTimer = TIMERS.set(courtId, {
        remainingMs: roundMs,
        roundMs: roundMs,
        isRunning: false
    })

    pushTimerReset(courtId)
    io.to(`court-${courtId}`).emit("timer:event:add", TIMER_HISTORY.get(courtId)!.at(-1))

    io.to(`court-${courtId}`).emit("timer:remainingMs:update", {
        remainingMs: roundMs,
    })
    io.to(`court-${courtId}`).emit("timer:roundMs:update", {
        roundMs: roundMs,
    })
    return newTimer
}

function runTimer(io: any, courtId: string): boolean {
    const timer = TIMERS.get(courtId)
    if (!timer || timer.interval || timer.remainingMs <= 0) return false

    timer.startAt = Date.now()
    pushTimerEvent(courtId, timer.remainingMs, true)
    io.to(`court-${courtId}`).emit("timer:event:add", TIMER_HISTORY.get(courtId)!.at(-1))

    timer.interval = setInterval(() => {
        const now = Date.now()
        const elapsed = now - timer.startAt!
        const remaining = Math.max(0, timer.remainingMs - elapsed)

        io.to(`court-${courtId}`).emit("timer:remainingMs:update", {
            remainingMs: remaining,
        })

        if (remaining <= 0) {
            clearInterval(timer.interval)
            timer.interval = undefined
            timer.remainingMs = 0
            timer.startAt = undefined
            timer.isRunning = false
        }
    }, 50)

    timer.isRunning = true

    io.to(`court-${courtId}`).emit("timer:isRunning:update", {
        isRunning: timer.isRunning,
    })
    return true
}

function stopTimer(io: any, courtId: string, timer: MatchTimer) {
    if (timer.interval) {
        clearInterval(timer.interval)
        timer.interval = undefined
    }

    if (timer.startAt) {
        timer.remainingMs -= Date.now() - timer.startAt
        timer.startAt = undefined
    }

    timer.isRunning = false
    pushTimerEvent(courtId, timer.remainingMs, false)
    io.to(`court-${courtId}`).emit("timer:event:add", TIMER_HISTORY.get(courtId)!.at(-1))

    io.to(`court-${courtId}`).emit("timer:isRunning:update", {
        isRunning: timer.isRunning,
    })

    io.to(`court-${courtId}`).emit(
        "timer:remainingMs:update",
        {
            remainingMs: timer.remainingMs,
        }
    )
}

function setRemaining(io: any, courtId: string, remainingMs: number): boolean {
    const timer = TIMERS.get(courtId)
    if (!timer || timer.isRunning || timer.interval) return false

    timer.startAt = undefined
    timer.remainingMs = Math.max(0, remainingMs)
    timer.isRunning = false

    pushTimerEvent(courtId, timer.remainingMs, false)
    io.to(`court-${courtId}`).emit("timer:event:add", TIMER_HISTORY.get(courtId)!.at(-1))

    io.to(`court-${courtId}`).emit(
        "timer:remainingMs:update",
        {
            remainingMs: timer.remainingMs,
        }
    )

    io.to(`court-${courtId}`).emit(
        "timer:isRunning:update",
        {
            isRunning: false,
        }
    )
    return true
}

export function getRemainingMs(courtId: string): number | undefined {
    const timer = TIMERS.get(courtId)
    if (!timer) return

    if (!timer.isRunning || !timer.startAt) {
        return timer.remainingMs
    }

    return Math.max(
        0,
        timer.remainingMs - (Date.now() - timer.startAt)
    )
}

export default function initTimerChannel(
    io: Server<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any>,
    socket: Socket<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any>
) {
    socket.on("timer:create", (
        data: { roundMs: number },
        // callback: (respone: any) => void,
    ) => {
        if (!isPlainObject(data)) return
        if (typeof data.roundMs !== "number") return

        const courtId = socket.data.courtId

        if (TIMERS.has(courtId)) return
        initTimer(io, courtId, data.roundMs)
    })

    socket.on("timer:stop", (_, callback?: (remainingMs?: number) => void) => {
        const courtId = socket.data.courtId

        const timer = TIMERS.get(courtId)
        if (!timer) return typeof callback === "function"
            && callback(undefined)

        stopTimer(io, courtId, timer)
        if (typeof callback === "function")
            callback(timer.remainingMs)
    })

    socket.on("timer:run", () => {
        const courtId = socket.data.courtId

        runTimer(io, courtId)
    })

    socket.on("timer:remainingMs:get", (_, callback?: (remainingMs?: number) => void) => {
        const courtId = socket.data.courtId

        const t = TIMERS.get(courtId)
        if (!t) return typeof callback === "function"
            && callback()

        if (typeof callback === "function")
            callback(t.remainingMs)
    })

    socket.on("timer:isRunning:get", (_, callback?: (isRunning?: boolean) => void) => {
        const courtId = socket.data.courtId

        const t = TIMERS.get(courtId)
        if (!t) return typeof callback === "function"
            && callback()

        if (typeof callback === "function")
            callback(t.isRunning)
    })

    socket.on("timer:remainingMs:update", (data: { remainingMs: number }, callback?: () => void) => {
        const courtId = socket.data.courtId

        setRemaining(io, courtId, data.remainingMs)

        if (typeof callback === "function")
            callback()
    })

    socket.on("timer:roundMs:update", (data: { roundMs: number }) => {
        const courtId = socket.data.courtId

        const t = TIMERS.get(courtId)
        if (!t) return
        t.roundMs = data.roundMs

        socket.to(`court-${courtId}`).emit("timer:roundMs:update", {
            roundMs: t.roundMs,
        })
    })

    socket.on("timer:events:get", (_, callback?: (entries?: TimerHistoryEntry[]) => void) => {
        const courtId = socket.data.courtId

        if (typeof callback === "function")
            callback(TIMER_HISTORY.get(courtId))
    })
}

export function getTimerEventsInRange(
    courtId: string,
    fromMs: number,
    toMs: number
): TimerHistoryEntry[] {
    const all = TIMER_HISTORY.get(courtId) ?? []
    const result: TimerHistoryEntry[] = []
    let lastBefore: TimerHistoryEntry | null = null

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