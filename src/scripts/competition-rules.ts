type PairCount = {
    countA: number
    countB: number
}

export const pairCountDefault: PairCount = {
    countA: 0,
    countB: 0,
}

export type Round = {
    punch: PairCount
    trunkKick: PairCount
    headKick: PairCount
    turningTrunkKick: PairCount
    turningHeadKick: PairCount
    gamJeom: PairCount
}

export const roundDefault: Round = {
    punch: pairCountDefault,
    trunkKick: pairCountDefault,
    headKick: pairCountDefault,
    turningTrunkKick: pairCountDefault,
    turningHeadKick: pairCountDefault,
    gamJeom: pairCountDefault
}

export class Rule1vs1 {
    private static weights: Record<keyof Round, number> = {
        punch: 1,
        trunkKick: 2,
        headKick: 3,
        turningTrunkKick: 4,
        turningHeadKick: 5,
        gamJeom: 0 // gamJeom xử lý riêng
    }

    static getTotal(round: Round): { totalA: number, totalB: number } {
        // cộng các loại đòn trừ gamJeom
        return (Object.entries(round) as [keyof Round, PairCount][])
            .reduce(
                ({ totalA, totalB }, [key, { countA, countB }]) => {
                    if (key === "gamJeom") {
                        return {
                            totalA: totalA + countB,
                            totalB: totalB + countA
                        }
                    }

                    const w = this.weights[key]
                    return {
                        totalA: totalA + countA * w,
                        totalB: totalB + countB * w
                    }
                },
                { totalA: 0, totalB: 0 }
            )
    }
}

import { POINT_TYPES, Score, Side } from "./types"

export function calcScore(score: Score, rivalGJ: number) {
    return POINT_TYPES.reduce((total, v) =>
        v === "gj" ? total : total + score[v]
        , 0) + rivalGJ
}

export function defineLeading(blue: Score, red: Score): Side | null {
    const totalBlue = calcScore(blue, red.gj)
    const totalRed = calcScore(red, blue.gj)

    if (totalBlue > totalRed) return "blue"
    if (totalRed > totalBlue) return "red"

    if (blue[6] > red[6]) return "blue"
    if (red[6] > blue[6]) return "red"

    if (blue[4] > red[4]) return "blue"
    if (red[4] > blue[4]) return "red"

    if (blue[3] > red[3]) return "blue"
    if (red[3] > blue[3]) return "red"

    if (blue.gj > red.gj) return "blue"
    if (red.gj > blue.gj) return "red"

    return null
}