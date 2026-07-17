export const settings: Map<string, {
    judgeIds: string[]
    numJudge: number
    pressBufferMs: number
    pendingVoteMs: number
    voteThreshold: number
    allowPostTimeVote: boolean
}> = new Map()