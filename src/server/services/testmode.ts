import { MatchTimer } from "./timer.js"
import { getRound } from "./match.js"
import {
    Round,
    createEmptyRound,
} from "../../scripts/match-types.js"


export const TEST_ROOMS: Map<string, Round> = new Map()

export const TEST_TIMER_DB: Map<string, MatchTimer> = new Map()

export default function initTestModeChannel(io: any, socket: any) {
    socket.on("test:open", (data: { courtId: string }, callback?: () => void) => {
        const round = createEmptyRound()
        TEST_ROOMS.set(data.courtId, round)

        io.to(`court-${data.courtId}`).emit(`score:blue:update`, {
            breakdown: round.blueBreakdown
        })

        io.to(`court-${data.courtId}`).emit(`score:red:update`, {
            breakdown: round.redBreakdown
        })

        callback?.()
    })

    socket.on("test:close", (data: { courtId: string }, callback?: () => void) => {
        TEST_ROOMS.delete(data.courtId)

        const round = getRound(data.courtId)
        if (!round) return

        io.to(`court-${data.courtId}`).emit(`score:blue:update`, {
            breakdown: round.blueBreakdown
        })

        io.to(`court-${data.courtId}`).emit(`score:red:update`, {
            breakdown: round.redBreakdown
        })

        callback?.()
    })

    socket.on("test:get", (data: { courtId: string }, callback: (isTest: boolean) => void) => {
        const isTest = TEST_ROOMS.has(data.courtId)
        callback(isTest)
    })
}