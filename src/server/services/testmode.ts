import { MatchTimer } from "./timer.js"
import { getRound } from "./match.js"
import {
    RoundResult,
    createEmptyRound,
} from "../../scripts/match-types.js"


export const TEST_ROOMS: Map<string, RoundResult> = new Map()

export const TEST_TIMER_DB: Map<string, MatchTimer> = new Map()

export default function initTestModeChannel(io: any, socket: any) {
    socket.on("test:open", (data: { courtId: string }) => {
        const round = createEmptyRound()
        TEST_ROOMS.set(data.courtId, round)

        io.to(`court-${data.courtId}`).emit(`score:blue:update`, {
            breakdown: round.blueBreakdown
        })

        io.to(`court-${data.courtId}`).emit(`score:red:update`, {
            breakdown: round.redBreakdown
        })

        io.to(`court-${data.courtId}`).emit(`score:mode:update`, {
            mode: "test"
        })
    })

    socket.on("test:close", (data: { courtId: string }) => {
        TEST_ROOMS.delete(data.courtId)

        const round = getRound(data.courtId)
        if (!round) return

        io.to(`court-${data.courtId}`).emit(`score:blue:update`, {
            breakdown: round.blueBreakdown
        })

        io.to(`court-${data.courtId}`).emit(`score:red:update`, {
            breakdown: round.redBreakdown
        })

        io.to(`court-${data.courtId}`).emit(`score:mode:update`, {
            mode: "match"
        })
    })

    socket.on("test:get", (data: { courtId: string }, callback: (isTest: boolean) => void) => {
        const isTest = TEST_ROOMS.has(data.courtId)
        callback(isTest)
    })
}