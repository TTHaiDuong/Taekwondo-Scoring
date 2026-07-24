import { useState, useEffect } from "react"
import { getSingletonSocket } from "@/scripts/global-client-io"
import {
    emptyBreakdown,
    inferScoreLeader,
    ScoreLeader,
    ScoreBreakdown,
} from "@/scripts/match-types"

/** Sử dụng để nhận điểm số, kết quả của hiệp hiện tại từ server.
 * @todo Trong tương lai cần xoá tham số courtId, server sẽ gắn courtId cho đối tượng client.
 */
export default function useScore(courtId: string) {
    const [roundResult, setRoundResult] = useState<ScoreLeader>({ totalBlue: 0, totalRed: 0, leader: null })
    const [blueBreakdown, setBlueBreakdown] = useState<ScoreBreakdown>(emptyBreakdown())
    const [redBreakdown, setRedBreakdown] = useState<ScoreBreakdown>(emptyBreakdown())

    useEffect(() => {
        const scoreResult = inferScoreLeader(blueBreakdown, redBreakdown)
        setRoundResult(scoreResult)
    }, [blueBreakdown, redBreakdown])

    useEffect(() => {
        const socket = getSingletonSocket()

        const onConnect = () => {
            socket.emit("court:join", { courtId })
        }
        const onBlueUpdate = (data: { breakdown: any }) => {
            setBlueBreakdown(data.breakdown)
        }
        const onRedUpdate = (data: { breakdown: any }) => {
            setRedBreakdown(data.breakdown)
        }
        const onReset = () => {
            setBlueBreakdown(emptyBreakdown())
            setRedBreakdown(emptyBreakdown())
        }

        socket.once("connect", onConnect)
        socket.on("score:blue:update", onBlueUpdate)
        socket.on("score:red:update", onRedUpdate)
        socket.on("score:reset", onReset)

        return () => {
            socket.off("connect", onConnect)
            socket.off("score:blue:update", onBlueUpdate)
            socket.off("score:red:update", onRedUpdate)
            socket.off("score:reset", onReset)
        }
    }, [])

    return {
        blueScore: blueBreakdown,
        redScore: redBreakdown,
        roundWinner: roundResult,
    }
}
