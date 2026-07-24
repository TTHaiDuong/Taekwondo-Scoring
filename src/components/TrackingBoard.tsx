"use client"

import { getSingletonSocket } from "@/scripts/global-client-io"
import { emptyBreakdown, inferScoreLeader, ScoreLeader, ScoreBreakdown, Side, WinCode } from "@/scripts/match-types"
import { useEffect, useState } from "react"
import { io, Socket } from "socket.io-client"
import useScreenWakeLock from "./UseScreenWakeLock"
import FitText from "./FitText"
import { JudgePressStack } from "./JudgePress"
import useAutoHideCursor from "./AutoHideCursor"
import { useSearchParams } from "next/navigation"

// ============================================================
// SCOREBOARD DISPLAY — Bảng theo dõi điểm số
// Layout theo chuẩn Daedo/WTF: đỏ trái, xanh phải
// Socket events đồng bộ với MobileOperator
// ============================================================

// ── Socket ────────────────────────────────────────────────────

function useScoreboard(courtId: string) {
    const [blueScore, setBlueScore] = useState<ScoreBreakdown>(emptyBreakdown())
    const [redScore, setRedScore] = useState<ScoreBreakdown>(emptyBreakdown())
    const [roundWinner, setRoundWinner] = useState<ScoreLeader>()
    const [remainingMs, setRemainingMs] = useState(120_000)
    const [roundMs, setRoundMs] = useState(120_000)
    const [timerRunning, setTimerRunning] = useState(false)
    const [roundNo, setRoundNo] = useState(1)
    const [blueWins, setBlueWins] = useState(0)
    const [redWins, setRedWins] = useState(0)
    const [matchNo, setMatchNo] = useState(1)
    const [connected, setConnected] = useState(false)

    // Info trận (từ QuickAccess / MatchNav nếu có)
    const [blueName, setBlueName] = useState("VĐV XANH")
    const [redName, setRedName] = useState("VĐV ĐỎ")
    const [blueTeam, setBlueTeam] = useState("")
    const [redTeam, setRedTeam] = useState("")
    const [category, setCategory] = useState("")
    const [weight, setWeight] = useState("")

    useEffect(() => {
        if (!blueScore || !redScore) {
            setRoundWinner(undefined)
            return
        }
        const scoreResult = inferScoreLeader(blueScore, redScore)
        setRoundWinner(scoreResult)
    }, [blueScore, redScore])

    useEffect(() => {
        const socket = getSingletonSocket()

        socket.on("connect", () => {
            setConnected(true)
            socket.emit("court:join", { courtId })

            // Lấy trạng thái hiện tại
            socket.emit("timer:remainingMs:get", { courtId }, (ms?: number) => {
                if (ms != null) setRemainingMs(ms)
            })
            socket.emit("timer:isRunning:get", { courtId }, (v?: boolean) => {
                if (v != null) setTimerRunning(v)
            })
            socket.emit("round:get", { courtId }, (round?: any) => {
                if (!round) return
                if (round.blueBreakdown) setBlueScore(round.blueBreakdown)
                if (round.redBreakdown) setRedScore(round.redBreakdown)
            })
        })
        socket.on("disconnect", () => setConnected(false))

        // Score updates — theo MobileOperator
        socket.on("score:blue:update", (d: { breakdown: ScoreBreakdown }) => setBlueScore(d.breakdown))
        socket.on("score:red:update", (d: { breakdown: ScoreBreakdown }) => setRedScore(d.breakdown))
        socket.on("score:reset", () => {
            setBlueScore(emptyBreakdown())
            setRedScore(emptyBreakdown())
        })
        socket.on("round:winner:update", (d: { winner: Side }) =>
            setRoundWinner(prev => {
                if (!prev) return
                return ({ ...prev, leader: d.winner })
            })
        )

        // Fallback event cũ
        socket.on("score:updated", (d: { blue: any; red: any }) => {
            if (d.blue) setBlueScore(d.blue)
            if (d.red) setRedScore(d.red)
        })

        socket.on("timer:remainingMs:update", (d: { remainingMs: number }) => {
            setRemainingMs(d.remainingMs)
            if (d.remainingMs === 0) setTimerRunning(false)
        })
        socket.on("timer:updated", (d: { remaining: number }) => {
            setRemainingMs(d.remaining)
            if (d.remaining === 0) setTimerRunning(false)
        })
        socket.on("timer:isRunning:update", (d: { isRunning: boolean }) => setTimerRunning(d.isRunning))
        socket.on("timer:running:updated", (d: { isRunning: boolean }) => setTimerRunning(d.isRunning))
        socket.on("timer:roundMs:update", (d: { roundMs: number }) => setRoundMs(d.roundMs))

        // Match info
        socket.on("match:info:update", (d: any) => {
            if (d.blueName) setBlueName(d.blueName)
            if (d.redName) setRedName(d.redName)
            if (d.blueTeam) setBlueTeam(d.blueTeam)
            if (d.redTeam) setRedTeam(d.redTeam)
            if (d.matchNo) setMatchNo(d.matchNo)
            if (d.category) setCategory(d.category)
            if (d.weight) setWeight(d.weight)
            if (d.roundNo) setRoundNo(d.roundNo)
            if (d.blueWins != null) setBlueWins(d.blueWins)
            if (d.redWins != null) setRedWins(d.redWins)
        })

        return () => { socket.disconnect() }
    }, [courtId])

    return {
        blueScore, redScore, roundWinner,
        remainingMs, roundMs, timerRunning,
        roundNo, blueWins, redWins, matchNo,
        blueName, redName, blueTeam, redTeam,
        category, weight, connected,
    }
}

// ── Clock ─────────────────────────────────────────────────────

function formatTime(ms: number, precise = false): string {
    if (precise && ms < 10_000) {
        return (ms / 1000).toFixed(2)
    }
    const min = Math.floor(ms / 60000)
    const sec = Math.floor((ms % 60000) / 1000)
    return `${min}:${sec.toString().padStart(2, "0")}`
}

// ── Win dots ──────────────────────────────────────────────────

function WinDots(props: { wins: number; side: "blue" | "red" }) {
    const isBlue = props.side === "blue"
    return (
        <div className={`flex items-center gap-[20px] ${isBlue && "flex-row-reverse"}`}>
            {[1, 2].map(i => (
                <div key={i} className={`w-[50px] h-[50px] rounded-full border-2 border-white/30
                    ${props.wins >= i
                        ? isBlue ? "bg-[#FFD700]" : "bg-[#FFD700]"
                        : "bg-transparent"
                    }`}
                />
            ))}
        </div>
    )
}

// ── Stat cell ─────────────────────────────────────────────────

function StatCell(props: {
    label: string
    value?: number | string
    highlight?: boolean
    warn?: boolean
    flip?: boolean
}) {
    return (
        <div className={`flex flex-col items-center gap-[2px]
            ${props.flip ? "flex-col-reverse" : ""}`}>
            <span className="text-[clamp(0.5rem,1.2vw,1rem)] font-bold
                text-white/40 tracking-widest uppercase">
                {props.label}
            </span>
            <span className={`font-bold leading-none
                ${props.warn ? "text-red-400" :
                    props.highlight ? "text-green-400" : "text-white/80"}
                text-[clamp(1rem,30vw,4rem)]`}>
                {props.value}
            </span>
        </div>
    )
}

// ── Main ──────────────────────────────────────────────────────

export default function TrackingBoard() {
    const searchParams = useSearchParams();

    const [mode, setMode] = useState<string>()
    const [interruptionMsg, setInterruptionMsg] = useState<WinCode>()
    const [config, setConfig] = useState<any>()

    useAutoHideCursor(2000)
    const courtId = searchParams.get("courtId") ?? "1"
    const s = useScoreboard(courtId)

    const blueGj = s.blueScore && (s.blueScore.eeljeom + s.blueScore.eejeom)
    const redGj = s.redScore && (s.redScore.eeljeom + s.redScore.eejeom)

    const blueLeads = s.roundWinner && s.roundWinner.leader === "blue"
    const redLeads = s.roundWinner && s.roundWinner.leader === "red"

    const blueBg = "rgba(0,0,128,0.3)"
    const redBg = "rgba(128,0,0,0.3)"

    // Thông tin trận header
    const headerText = [s.category, s.weight].filter(Boolean).join(" · ") || "Taekwondo"

    useEffect(() => {
        const socket = getSingletonSocket()
        socket.emit("test:get", { courtId }, (isTest: boolean) => {
            if (isTest) setMode("test")
        })

        socket.emit("match:config:get", { courtId }, (c: any) => {
            setConfig(c)
        })

        socket.on("match:config:update", (c) => {
            setConfig(c)
        })

        socket.on("round:winCode:update", (d: { winCode: WinCode }) =>
            setInterruptionMsg(d.winCode)
        )

        socket.on("score:mode:update", (data: { mode: string }) => {
            setMode(data.mode)
        })
    }, [])

    useEffect(() => {
        if (s.timerRunning) setInterruptionMsg(undefined)
    }, [s.timerRunning])

    useScreenWakeLock()

    const applyPointGap =
        s.roundWinner &&
        (!config ||
            (
                config.pointGapEnabled
                && (Math.abs(s.roundWinner.totalBlue - s.roundWinner.totalRed) >= config.pointGap)
            )
        )
        && !s.timerRunning
        && interruptionMsg

    return (
        <div className="w-screen h-screen bg-black grid overflow-hidden select-none"
            style={{
                fontFamily: "var(--font-ui, sans-serif)",
                gridTemplateAreas: `
                "header   header   header header header   header"
                "l-flag   l-name   l      r      r-name   r-flag"
                "l-side   l-score  middle middle r-score  r-side"
                "l-footer l-footer middle middle r-footer r-footer"
                `,
                gridTemplateColumns: "2fr 10fr 3fr 3fr 10fr 2fr",
                gridTemplateRows: "1fr 1fr 7fr 1fr"
            }}>

            {/* ── HEADER ── */}
            <div className="flex items-center justify-center px-[1.5vw] py-[0.8vh]
                bg-[#111] border-b border-white/10"
                style={{ gridArea: "header" }}>
                {/* Hiệp thắng xanh */}

                {/* Title */}
                <div className="flex flex-col items-center gap-[2px]">
                    <span className="text-white font-bold tracking-widest uppercase
                        text-[clamp(0.7rem,1.8vw,1.1rem)]">
                        {headerText}
                    </span>
                    {!s.connected && (
                        <span className="text-red-400 text-[0.65rem] tracking-wider animate-pulse">
                            MẤT KẾT NỐI
                        </span>
                    )}
                </div>
            </div>

            {/* ── FLAG */}
            <div className="" style={{ gridArea: "l-flag", backgroundColor: blueBg }}>
            </div>

            <div className="" style={{ gridArea: "r-flag", backgroundColor: redBg }}>
            </div>

            {/* ── NAME ── */}
            <div className="font-score font-bold flex-center overflow-hidden"
                style={{
                    gridArea: "l-name",
                    backgroundColor: blueBg,
                    fontSize: interruptionMsg ? "10vh" : "5vh",
                    color: applyPointGap && s.roundWinner?.leader === "blue" ? "#FFD700" : "white",
                }}
            >
                {applyPointGap && s.roundWinner?.leader === "blue" && interruptionMsg}
            </div>
            <div className="font-score font-bold flex-center overflow-hidden"
                style={{
                    gridArea: "r-name",
                    backgroundColor: redBg,
                    fontSize: interruptionMsg ? "10vh" : "5vh",
                    color: applyPointGap && s.roundWinner?.leader === "red" ? "#FFD700" : "white",
                }}
            >
                {applyPointGap && s.roundWinner?.leader === "red" && interruptionMsg}
            </div>

            <div style={{ gridArea: "l", backgroundColor: blueBg }} />
            <div style={{ gridArea: "r", backgroundColor: redBg }} />

            {/* ══ CỘT XANH ══ */}
            <FitText className="overflow-hidden font-score font-semibold leading-none font-variant-numeric tabular-nums"
                useEllipses={false}
                scale={0.9}
                style={{
                    background: "linear-gradient(180deg,#000080,#000055)",
                    gridArea: "l-score",
                    color: blueLeads ? "#FFD700" : "white",
                    textShadow: blueLeads
                        ? "0 0 60px rgba(255,215,0,0.4)"
                        : "0 4px 20px rgba(0,0,0,0.6)",
                    transition: "color 0.3s, text-shadow 0.3s",
                    border: applyPointGap && s.roundWinner?.leader === "blue" ? "8px solid #FFD700" : undefined
                }}>
                {s.roundWinner?.totalBlue}
            </FitText>

            {/* ══ CỘT ĐỎ ══ */}
            <FitText className="overflow-hidden font-score font-semibold leading-none font-variant-numeric tabular-nums"
                useEllipses={false}
                scale={0.9}
                style={{
                    background: "linear-gradient(180deg,#800000,#550000)",
                    gridArea: "r-score",
                    color: redLeads ? "#FFD700" : "white",
                    textShadow: redLeads
                        ? "0 0 60px rgba(255,215,0,0.4)"
                        : "0 4px 20px rgba(0,0,0,0.6)",
                    transition: "color 0.3s, text-shadow 0.3s",
                    border: applyPointGap && s.roundWinner?.leader === "red" ? "8px solid #FFD700" : undefined
                }}>
                {s.roundWinner?.totalRed}
            </FitText>

            {/* ══ CỘT GIỮA ══ */}
            <div className="flex flex-col items-center justify-between py-[1vh] bg-[#111]"
                style={{
                    gridArea: "middle"
                }}>

                {/* Match số */}
                <div className="flex flex-col items-center gap-[2px]">
                    <span className="text-white/40 font-bold tracking-[0.2em] uppercase
                            text-[clamp(0.5rem,1.2vw,0.8rem)]">
                        MATCH
                    </span>
                    <span className="font-bold text-white
                            text-[clamp(1.2rem,3.5vw,2.5rem)] leading-none">
                        {s.matchNo}
                    </span>
                </div>

                {/* Đồng hồ */}
                <div className="flex flex-col items-center gap-[0.5vh] w-full overflow-hidden p-[10px]">
                    <FitText
                        className="font-score font-black leading-none font-variant-numeric tabular-nums 
                        text-center px-[1vw] py-[3vh]
                                rounded-[1vw] border-[3px] w-full transition-colors"
                        style={{
                            fontSize: "clamp(2rem,9vw,9rem)",
                            color: s.timerRunning ? "#FFD700" : "white",
                            borderColor: s.timerRunning ? "#FFD700" : "rgba(255,255,255,0.3)",
                            minWidth: "clamp(100px,16vw,180px)",
                            textAlign: "center",
                        }}
                        useEllipses={false}
                    >
                        {mode === "test" ? "TEST" : formatTime(s.remainingMs, true)}
                    </FitText>

                    {/* Running indicator */}
                    <div className={`w-[8px] h-[8px] rounded-full transition-colors
                            ${s.timerRunning ? "bg-green-400 animate-pulse" : "bg-white/20"}`} />
                </div>

                {/* Round */}
                <div className="flex flex-col items-center gap-[2px]">
                    <span className="text-white/40 font-bold tracking-[0.2em] uppercase
                            text-[clamp(0.5rem,1.2vw,0.8rem)]">
                        ROUND
                    </span>
                    <span className="font-bold text-white
                            text-[clamp(1.2rem,5vw,5rem)] leading-none">
                        {s.roundNo}
                    </span>
                </div>
            </div>

            {/* ── SIDE ── */}
            <div className="" style={{ gridArea: "l-side", backgroundColor: blueBg }}>
                <JudgePressStack
                    side="blue"
                    judgesNum={3}
                    voteThreshold={2}
                    className="h-full"
                />
            </div>

            <div className="" style={{ gridArea: "r-side", backgroundColor: redBg }}>
                <JudgePressStack
                    side="red"
                    judgesNum={3}
                    voteThreshold={2}
                    className="h-full"
                />
            </div>

            {/* ── FOOTER — stats ── */}
            {/* Blue stats */}
            <div className="flex-1 flex items-center justify-between px-[2vw]"
                style={{ gridArea: "l-footer", background: "rgba(0,0,128,0.3)" }}>
                <StatCell label="GAM-JEOM" value={typeof blueGj === "number" ? blueGj : "-"} warn={(blueGj || 0) >= 4} />
                <WinDots wins={s.blueWins} side="blue" />
            </div>

            {/* Red stats */}
            <div className="flex-1 flex items-center justify-between px-[2vw]"
                style={{ gridArea: "r-footer", background: redBg }}>
                <WinDots wins={s.redWins} side="red" />
                <StatCell label="GAM-JEOM" value={typeof redGj === "number" ? redGj : "-"} warn={(redGj || 0) >= 4} />
            </div>
        </div>
    )
}