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
    MatchConfig,
    WIN_CODES_DESCRIPTION,
    WIN_CODES
} from "../../scripts/match-types.js"
import { getWifiIP } from "./get-ip.js"
import { TEST_ROOMS } from "./testmode.js";
import { DefaultEventsMap, Server, Socket } from "socket.io";
import { isPlainObject } from "@/utils/types.js";


/** Dùng để lưu thông tin các id socket của các giám định
 * để hiển thị ai đã bấm điểm.
 * Key: courtId
 * Value: Mảng các id socket của giám định
 */
export const JUDGES_INFO: Map<string, OrderedUniqueList<string>> = new Map()

export function getJudgeOrder(courtId: string, judgeId: string): number | undefined {
    const judgesInfo = JUDGES_INFO.get(courtId)
    if (!judgesInfo) return

    const order = judgesInfo.indexOf(judgeId)
    if (order === -1) return
    return order
}

export const MATCHS: Map<string, MatchInfo> = new Map()
export const MATCHS_CONFIG: Map<string, any> = new Map()

export function getRound(courtId: string): Round | undefined {
    const match = MATCHS.get(courtId)
    if (!match) return
    const currentRound = match.currentRound
    if (!currentRound) return

    return match.rounds.get(currentRound)
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


export default function initMatchChannel(
    io: Server<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any>,
    socket: Socket<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any>
) {
    socket.on("court:join", (data: { courtId: string, isJudge?: boolean }, callback?: () => void) => {
        socket.data.courtId = data.courtId

        if (!data.isJudge) {
            socket.join(`court-${data.courtId}`)
            return typeof callback === "function" && callback()
        }

        let judgesInfo = JUDGES_INFO.get(data.courtId)

        if (!judgesInfo) {
            judgesInfo = new OrderedUniqueList()
            JUDGES_INFO.set(data.courtId, judgesInfo)
        }

        judgesInfo.add(socket.id)
        broadcastJudgeOrders(io, data.courtId)
        if (typeof callback === "function") callback()
    })

    socket.on("judge:order:get", (_, callback?: (num?: number) => void) => {
        const courtId = socket.data.courtId
        const judgeOrder = getJudgeOrder(courtId, socket.id)
        if (typeof callback === "function")
            callback(judgeOrder)
    })

    socket.on("match:create", (_, callback?: (data: { message: "created" | "existed" }) => void) => {
        const courtId = socket.data.courtId

        if (MATCHS.has(courtId))
            return typeof callback === "function"
                && callback({ message: "existed" })

        const match: MatchInfo = {
            config: { ...DEFAULT_MATCH_CONFIG },
            status: "upcoming",
            rounds: new Map(),
        }
        MATCHS.set(courtId, match)

        if (typeof callback === "function")
            callback({ message: "created" })
    })

    socket.on("currentRoundNo:get", (_, callback?: (currentRound?: RoundNo) => void) => {
        const courtId = socket.data.courtId

        const match = MATCHS.get(courtId)
        if (typeof callback === "function")
            callback(match?.currentRound)
    })

    socket.on("round:create", (
        data: { roundNo: RoundNo },
        callback?: (data: { message: "created" | "the match does not exist" }) => void
    ) => {
        if (!isPlainObject(data)) return
        if (typeof data.roundNo !== "number") return

        const courtId = socket.data.courtId

        const match = MATCHS.get(courtId)
        if (!match) return typeof callback === "function"
            && callback({ message: "the match does not exist" })

        const newRound = createEmptyRound(data.roundNo)
        match.rounds.set(data.roundNo, newRound)
        if (typeof callback === "function")
            callback({ message: "created" })
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

    socket.on("round:get", (_, callback?: (round?: Round) => void) => {
        const courtId = socket.data.courtId

        const round = TEST_ROOMS.get(courtId) || getRound(courtId)
        if (typeof callback === "function")
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

    socket.on("match:config:set", (data: { config: any }) => {
        const courtId = socket.data.courtId

        const config = MATCHS_CONFIG.get(courtId)
        const newC = {
            ...(config ?? {}),
            ...(data.config ?? {})
        }
        MATCHS_CONFIG.set(courtId, newC)

        io.to(`court-${courtId}`).emit("match:config:update", newC)
    })

    socket.on("match:config:get", (_, callback?: (config?: any) => void) => {
        const courtId = socket.data.courtId

        if (typeof callback === "function")
            callback(MATCHS_CONFIG.get(courtId))
    })

    socket.on("currentRound:switch", (
        data: { currentRound: RoundNo },
        callback?: (data: { message: "success" | "fail" }) => void
    ) => {
        if (!isPlainObject(data)) return
        if (typeof data.currentRound !== "number") return

        const courtId = socket.data.courtId

        const match = MATCHS.get(courtId)
        if (!match) return typeof callback === "function"
            && callback({ message: "fail" })

        match.currentRound = data.currentRound
        if (typeof callback === "function")
            callback({ message: "success" })
    })

    socket.on("round:winner:set", (data: { winner: Side, winCode?: WinCode }) => {
        if (!isPlainObject(data)) return
        if (!SIDE.includes(data.winner)) return
        if (data.winCode && !WIN_CODES.includes(data.winCode)) return

        const courtId = socket.data.courtId

        const test = TEST_ROOMS.get(courtId)
        if (test) return
        const round = getRound(courtId)
        if (!round) return

        round.winner = data.winner
        round.winCode = data.winCode

        io.to(`court-${courtId}`).emit("round:winner:update", {
            winner: round.winner,
            winCode: round.winCode
        })
    })

    socket.on("disconnect", () => {
        const courtId = socket.data.courtId

        const judgesInfo = JUDGES_INFO.get(courtId)
        if (!judgesInfo) return

        judgesInfo.remove(socket.id)
        if (judgesInfo.size === 0) JUDGES_INFO.delete(courtId)
        else broadcastJudgeOrders(io, courtId)
    })

    /** @deprecated */
    socket.on("localIp:get", (callback?: (ip: string | null) => void) => {
        const ip = getWifiIP()
        callback?.(ip)
    })
}