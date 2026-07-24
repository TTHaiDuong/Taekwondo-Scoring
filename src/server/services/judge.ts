// import { sendScoreToClient } from "./score.js"
import { OrderedUniqueList } from "@/utils/collections.js";
import {
    SIDE,
    Side,
    Round,
    createEmptyRound,
    MatchInfo,
    calcTotalFromBreakdown,
    DEFAULT_MATCH_CONFIG,
    RoundNo,
    WinCode,
    MatchConfig
} from "../../scripts/match-types.js"
import { getWifiIP } from "./get-ip.js"
import { TEST_ROOMS } from "./testmode.js";


/** 
 * Dùng để lưu thông tin các id socket của các giám định
 * để hiển thị ai đã bấm điểm.
 * @param Key courtId
 * @param Value Mảng các id socket của giám định
 */
export const JUDGES_INFO: Map<string, OrderedUniqueList<string>> = new Map()

export function getJudgeOrder(courtId: string, judgeId: string): number | undefined {
    const judgesInfo = JUDGES_INFO.get(courtId)
    if (!judgesInfo) return

    const order = judgesInfo.indexOf(judgeId)
    if (order === -1) return
    return order
}

function broadcastJudgeOrders(io: any, courtId: string) {
    const judgesInfo = JUDGES_INFO.get(courtId)
    if (!judgesInfo) return

    // Gửi cho từng socket order riêng của chính nó
    const sockets = io.sockets.sockets
    judgesInfo.values().forEach((judgeSocketId, idx) => {
        const judgeSocket = sockets.get(judgeSocketId)
        judgeSocket?.emit("judge:order:update", { order: idx })
    })
}

export default function initJudgeChannel(io: any, socket: any) {
    socket.on("court:join", (data: { courtId: string, isJudge?: boolean }, callback?: () => void) => {
        socket.data.courtId = data.courtId

        if (!data.isJudge)
            return socket.join(`court-${data.courtId}`)

        let judgesInfo = JUDGES_INFO.get(data.courtId)

        if (!judgesInfo) {
            judgesInfo = new OrderedUniqueList()
            JUDGES_INFO.set(data.courtId, judgesInfo)
        }

        judgesInfo.add(socket.id)
        callback?.()
        broadcastJudgeOrders(io, data.courtId)
    })

    socket.on("judge:order:get", (data: { courtId: string }, callback?: (num?: number) => void) => {
        const judgeOrder = getJudgeOrder(data.courtId, socket.id)
        callback?.(judgeOrder)
    })

    socket.on("match:currentRound:get", (data: { courtId: string }, callback: (currentRound?: RoundNo) => void) => {
        const match = MATCHS.get(data.courtId)
        callback(match?.currentRound)
    })

    socket.on("rounds:create", (data: { courtId: string, roundNo: RoundNo }, callback: () => void) => {
        // const user = socket.user
        // if (!user || !user.courtId || user.role !== "operator") return

        const match = MATCHS.get(data.courtId)
        if (!match) return

        const newRound = createEmptyRound()
        match.rounds.set(data.roundNo, newRound)
        // sendScoreToClient(io, user.courtId, newRound)
        callback()
    })

    // socket.on("match:rounds:delete", (data: { roundIdx: number }, ack: any) => {
    //     const user = socket.user
    //     if (!user || !user.courtId || user.role !== "operator") return

    //     const match = MATCH_DB.get(user.courtId)
    //     if (!match) return

    //     if (match.rounds.size <= 1) return
    //     const result = match.rounds.delete(data.roundIdx)
    //     if (typeof ack === "function") ack(result)

    //     if (data.roundIdx === match.currentRoundIdx) {
    //         const firstEntry = match.rounds.entries().next().value
    //         if (!firstEntry) return

    //         match.currentRoundIdx = firstEntry[0]
    //         sendScoreToClient(io, user.courtId, firstEntry[1])
    //         sendRoundNoToClient(io, user.courtId, match.currentRoundIdx)
    //     }
    // })

    socket.on("rounds:get", (data: { courtId: string }, callback: (round?: Round) => void) => {
        const round = TEST_ROOMS.get(data.courtId) || getRound(data.courtId)
        if (!round) {
            callback()
            return
        }
        callback(round)
    })

    socket.on("match:rounds:win", (data: { side: Side, roundIdx: number }) => {
        // const user = socket.user
        // if (!user || !user.courtId || user.role !== "operator") return
        // if (!SIDE.includes(data.side)) return

        // const match = MATCH_DB.get(user.courtId)
        // if (!match) return
        // const round = match.rounds.get(data.roundIdx)
        // if (!round) return
        // round.win = data.side
    })

    socket.on("match:total", (data: { courtId: string }, ack: any) => {
        // if (typeof ack !== "function") return
        // const match = MATCH_DB.get(data.courtId)
        // if (!match) return

        // const matchResult: MatchResult = {}
        // match.rounds.forEach((r, roundIdx) => {
        //     const roundResult = {
        //         blue: calcScore(r.blue, r.red.gj),
        //         red: calcScore(r.red, r.blue.gj)
        //     }
        //     matchResult[roundIdx] = roundResult
        // })

        // ack(matchResult)
    })

    socket.on("match:config:set", (data: { courtId: string, config: any }) => {
        const config = MATCH_CONFIG.get(data.courtId)
        const newC = {
            ...(config ?? {}),
            ...(data.config ?? {})
        }
        MATCH_CONFIG.set(data.courtId, newC)

        io.to(`court-${data.courtId}`).emit("match:config:update", newC)
    })

    socket.on("match:config:get", (data: { courtId: string }, callback: (config: any) => void) => {
        callback?.(MATCH_CONFIG.get(data.courtId))
    })

    socket.on("rounds:switch", (data: { courtId: string, currentRound: RoundNo }) => {
        // const user = socket.user
        // if (!user || !user.courtId || user.role !== "operator") return

        const match = MATCHS.get(data.courtId)
        if (!match) return
        match.currentRound = data.currentRound
    })

    socket.on("round:winner:set", (data: { courtId: string, winner: Side, winCode: WinCode }) => {
        const test = TEST_ROOMS.get(data.courtId)
        if (test) return
        const round = getRound(data.courtId)
        if (!round) return

        round.winner = data.winner
        round.winCode = data.winCode

        io.to(`court-${data.courtId}`).emit("round:winner:update", { winner: round.winner })
        io.to(`court-${data.courtId}`).emit("round:winCode:update", { winCode: round.winCode })
    })

    socket.on("disconnect", () => {
        const courtId = socket.data.courtId

        if (!courtId) return

        const judgesInfo = JUDGES_INFO.get(courtId)
        if (!judgesInfo) return

        judgesInfo.remove(socket.id)
        if (judgesInfo.size === 0) JUDGES_INFO.delete(courtId)
        else broadcastJudgeOrders(io, courtId)
    })

    socket.on("localIp:get", (callback?: (ip: string | null) => void) => {
        const ip = getWifiIP()
        callback?.(ip)
    })
}