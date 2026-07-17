export type MatchTimer = {
    remainingMs: number
    interval?: NodeJS.Timeout
    startAt?: number
    roundMs: number
    isRunning: boolean
}

export const TIMER_DB: Map<string, MatchTimer> = new Map()

export type TimerEvent = {
    timestamp: number      // epoch ms — ĐÚNG thời điểm trạng thái đổi
    remainingMs: number    // remainingMs TẠI thời điểm này
    isRunning: boolean     // đồng hồ có đang chạy KỂ TỪ thời điểm này không
}

export const TIMER_HISTORY: Map<string, TimerEvent[]> = new Map()

function pushTimerEvent(courtId: string, remainingMs: number, isRunning: boolean) {
    const list = TIMER_HISTORY.get(courtId) ?? []
    list.push({ timestamp: Date.now(), remainingMs, isRunning })
    TIMER_HISTORY.set(courtId, list)
}

export function initTimer(io: any,
    data: { courtId: string, roundMs: number }
) {
    const timer = TIMER_DB.get(data.courtId)
    if (timer) stopTimer(io, data.courtId, timer)

    const newTimer = TIMER_DB.set(data.courtId, {
        remainingMs: data.roundMs,
        roundMs: data.roundMs,
        isRunning: false
    })

    pushTimerEvent(data.courtId, data.roundMs, false)
    io.to(`court-${data.courtId}`).emit("timer:event:add", TIMER_HISTORY.get(data.courtId)!.at(-1))

    io.to(`court-${data.courtId}`).emit("timer:remainingMs:update", {
        remainingMs: data.roundMs,
    })
    io.to(`court-${data.courtId}`).emit("timer:roundMs:update", {
        roundMs: data.roundMs,
    })
    return newTimer
}

function runTimer(io: any, courtId: string): boolean {
    const timer = TIMER_DB.get(courtId)
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
    const timer = TIMER_DB.get(courtId)
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
    const timer = TIMER_DB.get(courtId)
    if (!timer) return undefined

    if (!timer.isRunning || !timer.startAt) {
        return timer.remainingMs
    }

    return Math.max(
        0,
        timer.remainingMs - (Date.now() - timer.startAt)
    )
}

export default function initTimerChannel(io: any, socket: any) {
    socket.on(
        "timer:create",
        (
            data: { courtId: string, roundMs: number },
            // callback: (respone: any) => void,
        ) => {
            // console.log(data)
            // if (data) console.log("[timer:create] The existence of the courtId: " + TIMER_DB.has(data.courtId))
            if (TIMER_DB.has(data.courtId)) return
            initTimer(io, data)
        })

    socket.on("timer:stop", (data: { courtId: string }, callback: (remainingMs?: number) => void) => {
        // if (data) console.log("[timer:stop] The existence of the courtId: " + TIMER_DB.has(data.courtId))
        const timer = TIMER_DB.get(data.courtId)
        if (!timer) return callback?.(undefined)

        stopTimer(io, data.courtId, timer)
        callback?.(timer.remainingMs)
    })

    socket.on("timer:run", (data: { courtId: string }) => {
        // if (data) console.log("[timer:run] The existence of the courtId: " + TIMER_DB.has(data.courtId))
        runTimer(io, data.courtId)
    })

    socket.on("timer:remainingMs:get", (data: { courtId: string }, callback: (remainingMs?: number) => void) => {
        const t = TIMER_DB.get(data.courtId)
        if (!t) return callback()
        callback(t.remainingMs)
    })

    socket.on("timer:isRunning:get", (data: { courtId: string }, callback: (isRunning?: boolean) => void) => {
        const t = TIMER_DB.get(data.courtId)
        if (!t) return callback()
        callback(t.isRunning)
    })

    socket.on("timer:remainingMs:update", (data: { courtId: string, remainingMs: number }) => {
        setRemaining(io, data.courtId, data.remainingMs)
    })

    socket.on("timer:roundMs:update", (data: { courtId: string, roundMs: number }) => {
        const t = TIMER_DB.get(data.courtId)
        if (!t) return
        t.roundMs = data.roundMs

        socket.to(`court-${data.courtId}`).emit("timer:roundMs:update", {
            roundMs: t.roundMs,
        })
    })

    socket.on("timer:events:get", (data: { courtId: string }, callback: (events: TimerEvent[]) => void) => {
        callback(TIMER_HISTORY.get(data.courtId) ?? [])
    })
}

export function getTimerEventsInRange(
    courtId: string,
    fromMs: number,
    toMs: number
): TimerEvent[] {
    const all = TIMER_HISTORY.get(courtId) ?? []
    const result: TimerEvent[] = []
    let lastBefore: TimerEvent | null = null

    for (const evt of all) {
        if (evt.timestamp < fromMs) {
            lastBefore = evt
        } else if (evt.timestamp <= toMs) {
            result.push(evt)
        } else {
            break
        }
    }

    if (lastBefore) result.unshift(lastBefore)
    return result
}