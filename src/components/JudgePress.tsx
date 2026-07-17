import { getSingletonSocket } from "@/scripts/global-client-io"
import { Side, POINT_MAP } from "@/scripts/match-types"
import { JudgePointType } from "@/server/services/score"
import { forwardRef, useCallback, useEffect, useImperativeHandle, useState } from "react"
import FitText from "./FitText"

export type JudgePress = {
    timeOut?: NodeJS.Timeout
    pointType?: JudgePointType
    isCommit?: boolean
}

export const JudgePressStack = forwardRef((props: {
    side: Side
    judgesNum: number
    voteThreshold: number
    className?: string
}, ref) => {
    const [judges, setJudges] = useState<JudgePress[]>(Array.from({ length: props.judgesNum }, () => ({})))

    const handleJudgePress = useCallback((judgeOrder: number, pointType: JudgePointType, isCommit: boolean, timeout: number = 1000) => {
        const judge = judges[judgeOrder]
        if (!judge) return
        if (judge.isCommit && judge.pointType) return

        judge.pointType = pointType
        judge.isCommit = isCommit

        clearTimeout(judge.timeOut)

        judge.timeOut = setTimeout(() => {
            judge.pointType = undefined
            judge.isCommit = false
            setJudges([...judges])
        }, timeout)

        setJudges([...judges])
    }, [judges])

    const findSimilar = useCallback((pointType: JudgePointType) => {
        const foundIdx: number[] = []

        judges.forEach((v, i) => {
            if (v.pointType === pointType) foundIdx.push(i)
        })

        return foundIdx
    }, [judges])

    useImperativeHandle(ref, () => ({
        judgePress(judgeOrder: number, pointType: JudgePointType) {
            handleJudgePress(judgeOrder, pointType, false)
        }
    }), [judges])

    useEffect(() => {
        setJudges(Array.from({ length: props.judgesNum }, () => ({})))

        const socket = getSingletonSocket()

        const handlePress = (data: { judgeOrder: number, side: Side, pointType: JudgePointType }) => {
            if (props.side !== data.side) return
            handleJudgePress(data.judgeOrder, data.pointType, false, 1000)
        }

        const handleCommit = (data: { side: Side, pointType: JudgePointType, votersOrder: number[] }) => {
            if (props.side !== data.side) return

            // const idxs = findSimilar(data.pointType)
            // if (idxs.length < props.voteThreshold) return

            // idxs.forEach(i => handleJudgePress(i, data.pointType, true, 1000))
            data.votersOrder.forEach(i => handleJudgePress(i, data.pointType, true, 1000))
        }

        socket.on("judge:press", handlePress)
        socket.on("judge:commit", handleCommit)

        return () => {
            judges.forEach(a => clearTimeout(a.timeOut))
            socket.off("judge:press", handlePress)
            socket.off("judge:commit", handleCommit)
        }
    }, [props.judgesNum, props.side, props.voteThreshold])

    return (
        <div className={`${props.className}
        flex flex-col justify-evenly items-center w-full`}
        >
            {Array.from({ length: props.judgesNum }, (_, k) => (
                <div key={k}
                    className="
                    rounded-full 
                    w-[clamp(18px,100%,4rem)] aspect-square 
                    flex justify-center items-center text-center
                    text-black
                    font-nunito font-bold
                    overflow-hidden"
                    style={{
                        opacity: judges[k].pointType ? "1" : "0",
                        backgroundColor: judges[k].isCommit ? "rgb(136, 255, 160)" : "rgb(255, 242, 168)"
                    }}
                >
                    <FitText className="w-full h-full" scale={0.9}>
                        {judges[k].pointType ? POINT_MAP[judges[k].pointType] : ""}
                    </FitText>
                </div>
            ))}
        </div>
    )
})