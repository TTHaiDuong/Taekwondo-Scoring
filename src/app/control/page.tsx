"use client"

import "@/styles/main.css"
import { useRouter } from "next/navigation"
import SplitButton from "@/old/SplitButton"
import sBlueHelmet from "@/assets/solid-blue-helmet.png"
import sBlueArmor from "@/assets/solid-blue-armor.png"
import sBluePunch from "@/assets/solid-blue-punch.png"
import sRedHelmet from "@/assets/solid-red-helmet.png"
import sRedArmor from "@/assets/solid-red-armor.png"
import sRedPunch from "@/assets/solid-red-punch.png"
import { getSingletonSocket } from "@/scripts/global-client-io"
import { useState, useEffect, useRef } from "react"
import { formatTime } from "@/components/Timer"
import TimePicker from "@/components/TimePicker"
import EditIcon from "@/assets/edit.svg"
import FitText from "@/components/FitText"
import { whoAdvantage } from "@/scripts/business"
import { useIsMobile } from "@/components/UseStates"

export type Score = {
    1: number,
    2: number,
    3: number,
    4: number,
    5: number,
    gj: number
}

export function createDefaultCourt(): Score {
    return {
        1: 0,
        2: 0,
        3: 0,
        4: 0,
        5: 0,
        gj: 0
    }
}

function cal(score: Score, gjRival: number) {
    return score[1] + score[2] * 2 + score[3] * 3 + score[4] * 4 + score[5] * 5 + gjRival
}

export default function Home() {
    const [courtId, setCourtId] = useState<string>("1")
    const [scoreBoard, setScoreBoard] = useState<{ blue: Score, red: Score }>({
        blue: createDefaultCourt(),
        red: createDefaultCourt()
    })
    const [minEditing, setMinEditing] = useState<boolean>()
    const [secEditing, setSecEditing] = useState<boolean>()
    const [cSecEditing, setCSecEditing] = useState<boolean>()
    const [draft, setDraft] = useState("")
    const [advantage, setAdvantage] = useState<"blue" | "red" | null>()
    const [currentRound, setCurrentRound] = useState<number>(1)
    const [durationEditor, setDurationEditor] = useState<boolean>()
    const [testMode, setTestMode] = useState<boolean>()
    const isMobile = useIsMobile()
    const [fullScrReq, setFullScrReq] = useState<boolean>(true)
    const durPickerRef = useRef<HTMLDivElement>(null)
    const remainPickerRef = useRef<HTMLDivElement>(null)
    const [remainingEditor, setRemainingEditor] = useState<boolean>()

    useEffect(() => {
        if (!durationEditor) return

        function handleClickOutside(e: MouseEvent) {
            if (
                durPickerRef.current &&
                !durPickerRef.current.contains(e.target as Node)
            ) {
                setDurationEditor(false)
            }
        }

        document.addEventListener("mousedown", handleClickOutside)
        return () => {
            document.removeEventListener("mousedown", handleClickOutside)
        }
    }, [durationEditor])

    useEffect(() => {
        if (!remainingEditor) return

        function handleClickOutside(e: MouseEvent) {
            if (
                remainPickerRef.current &&
                !remainPickerRef.current.contains(e.target as Node)
            ) {
                setRemainingEditor(false)
            }
        }

        document.addEventListener("mousedown", handleClickOutside)
        return () => {
            document.removeEventListener("mousedown", handleClickOutside)
        }
    }, [remainingEditor])

    useEffect(() => {
        function handleFullscreenChange() {
            setFullScrReq(!document.fullscreenElement)
        }

        document.addEventListener('fullscreenchange', handleFullscreenChange)
        return () => { document.removeEventListener('fullscreenchange', handleFullscreenChange) }
    }, [])

    useEffect(() => {
        setAdvantage(whoAdvantage(scoreBoard.blue, scoreBoard.red))
    }, [scoreBoard])

    useEffect(() => {
        const socket = getSingletonSocket()

        const requestCourtId = () => {
            socket.emit("court:create", (res: string) => {
                console.log(res)
                setCourtId(res)
            })
        }

        if (socket.connected) {
            requestCourtId()
        } else {
            socket.once("connect", requestCourtId)
        }

        return () => {
            socket.off("connect", requestCourtId)
        }
    }, [])

    useEffect(() => {
        const socket = getSingletonSocket()
        socket.emit("court:join", courtId)

        return () => {
            socket.emit("court:leave", courtId)
        }
    }, [courtId])

    useEffect(() => {
        const socket = getSingletonSocket()

        const handler = (data: {
            courtId: number
            blue: Score
            red: Score
        }) => {
            setScoreBoard({
                blue: data.blue,
                red: data.red
            })
        }

        socket.on("score:update", handler)

        return () => {
            socket.off("score:update", handler)
        }
    }, [])

    const [durationMs, setDurationMs] = useState(1 * 60 * 1000)
    const [remaining, setRemaining] = useState<number>(0)
    const [isRunning, setRunning] = useState<boolean>()

    useEffect(() => {
        function handleDurationUpdate(data: { duration: number }) {
            setDurationMs(data.duration)
        }

        const socket = getSingletonSocket()
        socket.on("duration:update", handleDurationUpdate)

        return () => { socket.off("duration:update", handleDurationUpdate) }
    }, [])

    useEffect(() => {
        const socket = getSingletonSocket()

        resetTimer()

        function handleUpdate(data: { remaining: number }) {
            if (data.remaining === 0) {
                setRunning(false)
            }
            setRemaining(data.remaining)
        }

        socket.on("timer:update", handleUpdate)

        return () => {
            socket.off("timer:update", handleUpdate)
        }
    }, [courtId])

    function resetTimer() {
        getSingletonSocket().emit("timer:reset", { courtId, durationMs })
        setRemaining(durationMs)
        setRunning(false)
    }

    function playTimer() {
        if (navigator.vibrate) {
            navigator.vibrate(80)
        }
        if (isRunning) {
            getSingletonSocket().emit("timer:stop", { courtId })
            setRunning(false)
        }
        else if (remaining !== 0) {
            getSingletonSocket().emit("timer:run", { courtId })
            setRunning(true)
        }
    }

    const fullscreenRequest = async () => {
        const el = document.documentElement

        if (el.requestFullscreen) {
            await el.requestFullscreen()
        } else if ((el as any).webkitRequestFullscreen) {
            (el as any).webkitRequestFullscreen()
        } else {
            alert("API toàn màn hình không được hỗ trợ trên trình duyệt này.")
        }

        if ('orientation' in screen && 'lock' in screen.orientation) {
            try {
                await (screen.orientation as any).lock("landscape")
            }
            catch (err) {
                console.warn("Không thể khóa xoay màn hình:", err)
                // alert("Không thể khóa xoay màn hình.")
            }
        } else {
            alert("Thiết bị hoặc trình duyệt không hỗ trợ Orientation Lock API.")
        }

        setFullScrReq(false)
    }

    function handleMinWheel(e: React.WheelEvent<HTMLInputElement>) {
        e.preventDefault() // ngăn scroll page khi hover input
        let delta = e.deltaY < 0 ? 1 : -1 // lăn lên → tăng, lăn xuống → giảm

        let newMinutes = Math.floor(Math.floor(remaining / 1000) / 60) + delta

        // Giới hạn 0 - 99 phút
        if (newMinutes < 0) newMinutes = 99
        if (newMinutes > 99) newMinutes = 0

        updateMinute(newMinutes)
    }

    function handleSecWheel(e: React.WheelEvent<HTMLInputElement>) {
        e.preventDefault() // ngăn scroll page khi hover input
        let delta = e.deltaY < 0 ? 1 : -1 // lăn lên → tăng, lăn xuống → giảm

        let newMinutes = Math.floor(remaining / 1000) % 60 + delta

        // Giới hạn 0 - 99 phút
        if (newMinutes < 0) newMinutes = 59
        if (newMinutes > 59) newMinutes = 0

        updateSecond(newMinutes)
    }

    function handleCSecWheel(e: React.WheelEvent<HTMLInputElement>) {
        e.preventDefault() // ngăn scroll page khi hover input
        let delta = e.deltaY < 0 ? 1 : -1 // lăn lên → tăng, lăn xuống → giảm

        let newMinutes = Math.floor((remaining % 1000) / 10) + delta

        // Giới hạn 0 - 99 phút
        if (newMinutes < 0) newMinutes = 99
        if (newMinutes > 99) newMinutes = 0

        updateCentiSecond(newMinutes)
    }

    function updateMinute(newMinutes: number) {
        const oldM = Math.floor(Math.floor(remaining / 1000) / 60)
        const deltaM = newMinutes - oldM
        return remaining + deltaM * 60 * 1000
    }

    function updateSecond(newSec: number) {
        // 59 + 60 * 99
        if (newSec > 5999) newSec = 5999
        const oldM = Math.floor(Math.floor(remaining / 1000) / 60)
        const oldS = Math.floor(remaining / 1000)
        const deltaS = newSec - oldS
        if (newSec >= 60) return remaining + deltaS * 1000
        return oldM * 60 * 1000 + remaining + deltaS * 1000
    }

    function updateCentiSecond(newCSec: number) {
        if (newCSec >= 100) newCSec = 99
        const oldCS = Math.floor((remaining % 1000) / 10)
        const deltaCS = newCSec - oldCS
        return remaining + deltaCS * 10
    }

    function commitRemaining(newRemaining: number) {

        setRemaining(newRemaining)

        getSingletonSocket().emit("timer:reset", {
            courtId,
            durationMs: newRemaining
        })

        setRunning(false)
    }

    function handleScoreClick(blueOrRed: "blue" | "red", score: number | "gj", action?: "subtract") {
        getSingletonSocket().emit("update-score", { isControl: true, courtId: courtId, blueOrRed, score, action })
    }

    return (
        <div className="root">
            {isMobile && fullScrReq && <div className="req-fullscreen" onClick={() => fullscreenRequest()}>
                Nhấn vào để mở toàn màn hình
            </div>}
            {durationEditor &&
                <div className="overlay">
                    <div ref={durPickerRef}>
                        <TimePicker
                            title="Thời gian hiệp đấu"
                            initTimeMs={durationMs}
                            onSubmit={(v) => {
                                if (v) {
                                    setDurationMs(v)
                                    getSingletonSocket().emit("timer:duration", { courtId, duration: v })
                                }
                                setDurationEditor(false)
                            }}
                        />
                    </div>
                </div>
            }
            {remainingEditor &&
                <div className="overlay">
                    <div ref={remainPickerRef}>
                        <TimePicker
                            title="Thời gian hiện tại"
                            initTimeMs={remaining}
                            onSubmit={(v) => {
                                if (v) commitRemaining(v)
                                setRemainingEditor(false)
                            }}
                        />
                    </div>
                </div>
            }
            {/* <div className="header">
                <div className="back-btn" onClick={() => router.back()}>Back</div>
                <span onClick={fullscreenRequest} className="title">Full Screen</span>
            </div> */}
            <div className="body">
                <div className="athlete blue">CHONG</div>
                <div className="athlete red">HONG</div>
                <div className="team blue"></div>
                <div className="team red"></div>
                <div className="side blue"></div>
                <div className="side red"></div>
                <FitText style={{ color: advantage === "blue" ? "gold" : "white" }} className="point blue">{cal(scoreBoard["blue"], scoreBoard["red"]["gj"])}</FitText>
                <FitText style={{ color: advantage === "red" ? "gold" : "white" }} className="point red">{cal(scoreBoard["red"], scoreBoard["blue"]["gj"])}</FitText>
                <div className="middle top">
                    {/* <div className="label-number">
                        <span>MATCH</span>
                        <span>_</span>
                    </div> */}
                    <div className="stopwatch">
                        <div className="settings">
                            <div
                                className="btn reset"
                                style={{ opacity: isRunning ? 0.5 : 1 }}
                                onClick={() => { if (!isRunning) resetTimer() }}
                            >↺</div>
                            <div className="duration">
                                <div>Hiệp</div>
                                <div>{formatTime(durationMs)}</div>
                            </div>
                            <EditIcon
                                onClick={() => { if (!isRunning) setDurationEditor(true) }}
                                className="icon"
                                style={{ opacity: isRunning ? 0.5 : 1 }}
                            ></EditIcon>
                        </div>
                        {isMobile ?
                            <FitText
                                style={{ color: isRunning ? "gold" : "white" }}
                                onClick={() => {
                                    if (isRunning) return
                                    getSingletonSocket().emit("timer:stop", { courtId })
                                    setRunning(false)
                                    setRemainingEditor(true)
                                }}
                                className="mobile"
                            >{formatTime(remaining)}</FitText> :
                            <div className="content">
                                <input type="number"
                                    min={0}
                                    max={99}
                                    value={minEditing
                                        ? draft
                                        : Math.floor(remaining / 1000 / 60)}
                                    onWheel={handleMinWheel}
                                    onFocus={() => {
                                        setDraft(String(Math.floor(remaining / 1000 / 60)))
                                        setMinEditing(true)
                                    }}
                                    onChange={(e) => {
                                        setDraft(e.target.value)
                                    }}
                                    onBlur={(e) => {
                                        let newM = Number(e.target.value)
                                        if (isNaN(newM)) newM = 0
                                        commitRemaining(updateMinute(newM))
                                        setMinEditing(false)
                                    }}
                                />
                                <div className="unit">:</div>
                                <input type="number"
                                    min={0}
                                    max={59}
                                    value={secEditing
                                        ? draft
                                        : (Math.floor(remaining / 1000) % 60).toString().padStart(2, "0")}
                                    onFocus={() => {
                                        setDraft(String(Math.floor(remaining / 1000) % 60))
                                        setSecEditing(true)
                                    }}
                                    onChange={(e) => {
                                        setDraft(e.target.value)
                                    }}
                                    onBlur={(e) => {
                                        let newS = Number(e.target.value)
                                        if (isNaN(newS)) newS = 0
                                        commitRemaining(updateSecond(newS))
                                        setSecEditing(false)
                                    }}
                                    onWheel={handleSecWheel}
                                />
                                <div className="unit">s</div>
                                <input type="number"
                                    min={0}
                                    max={99}
                                    value={cSecEditing
                                        ? draft
                                        : (Math.floor((remaining % 1000) / 10)).toString().padStart(2, "0")}
                                    onFocus={() => {
                                        setDraft(String(Math.floor((remaining % 1000) / 10)))
                                        setCSecEditing(true)
                                    }}
                                    onChange={(e) => {
                                        setDraft(e.target.value)
                                    }}
                                    onBlur={(e) => {
                                        let newCS = Number(e.target.value)
                                        if (isNaN(newCS)) newCS = 0
                                        commitRemaining(updateCentiSecond(newCS))
                                        setCSecEditing(false)
                                    }}
                                    onWheel={handleCSecWheel}
                                />
                            </div>}
                        <div className="btn play" onClick={playTimer}>{isRunning ? "Dừng" : remaining === durationMs ? "Bắt đầu" : "Tiếp tục"}</div>
                    </div>
                </div>
                <div className="middle bottom">
                    {/* <div className="round">
                        <div className="title">ROUND</div>
                        <div className="blue won">_</div>
                        <div className="current">{currentRound}</div>
                        <div className="red won">_</div>
                        <div className="btn blue">Xanh</div>
                        <div className="result">Result</div>
                        <div className="btn red">Đỏ</div>
                    </div>
                    <div className="round-control">
                        <div style={{ background: currentRound === 1 ? "gray" : undefined }}>Hiệp trước</div>
                        <div style={{ background: currentRound === 3 ? "gray" : undefined }}>Hiệp sau</div>
                    </div>
                    <div>Công bố thắng trận đấu</div>
                    <div className="won-control match">
                        <div className="blue">Xanh</div>
                        <div className="red">Đỏ</div>
                    </div> */}
                    <div className="test">
                        {/* <div>Test Mode</div>
                        <Switch.Root className="switch">
                            <Switch.Thumb className="thumb" />
                        </Switch.Root> */}
                    </div>
                    <div
                        className="clear"
                        style={{ opacity: isRunning ? 0.2 : 1 }}
                        onClick={() => { if (!isRunning) getSingletonSocket().emit("court:clear", { courtId, durationMs }) }}
                    >Đặt lại</div>
                </div>
                <div className="control blue">
                    <div className="num-point"><span>{scoreBoard["blue"][1]}</span><SplitButton styles={{ opacity: isRunning ? 0.5 : 1 }} color="#187bcd" topOnClick={() => handleScoreClick("blue", 1)} bottomOnClick={() => handleScoreClick("blue", 1, "subtract")} icon={sBluePunch}></SplitButton></div>
                    <div className="num-point"><span>{scoreBoard["blue"][2]}</span><SplitButton styles={{ opacity: isRunning ? 0.5 : 1 }} color="#187bcd" topOnClick={() => handleScoreClick("blue", 2)} bottomOnClick={() => handleScoreClick("blue", 2, "subtract")} icon={sBlueArmor}></SplitButton></div>
                    <div className="num-point"><span>{scoreBoard["blue"][3]}</span><SplitButton styles={{ opacity: isRunning ? 0.5 : 1 }} color="#187bcd" topOnClick={() => handleScoreClick("blue", 3)} bottomOnClick={() => handleScoreClick("blue", 3, "subtract")} icon={sBlueHelmet}></SplitButton></div>
                    <div className="num-point"><span>{scoreBoard["blue"][4]}</span><SplitButton styles={{ opacity: isRunning ? 0.5 : 1 }} color="#187bcd" topOnClick={() => handleScoreClick("blue", 4)} bottomOnClick={() => handleScoreClick("blue", 4, "subtract")}>4</SplitButton></div>
                    <div className="num-point"><span>{scoreBoard["blue"][5]}</span><SplitButton styles={{ opacity: isRunning ? 0.5 : 1 }} color="#187bcd" topOnClick={() => handleScoreClick("blue", 5)} bottomOnClick={() => handleScoreClick("blue", 5, "subtract")}>5</SplitButton></div>
                    <div className="num-point gamjeom"><span>{scoreBoard["blue"]["gj"]}</span><SplitButton styles={{ opacity: isRunning ? 0.5 : 1 }} color="#187bcd" topOnClick={() => handleScoreClick("blue", "gj")} bottomOnClick={() => handleScoreClick("blue", "gj", "subtract")}>GJ</SplitButton></div>
                </div>
                <div className="control red">
                    <div className="num-point"><span>{scoreBoard["red"][1]}</span><SplitButton styles={{ opacity: isRunning ? 0.5 : 1 }} color="#fe3939" topOnClick={() => handleScoreClick("red", 1)} bottomOnClick={() => handleScoreClick("red", 1, "subtract")} icon={sRedPunch}></SplitButton></div>
                    <div className="num-point"><span>{scoreBoard["red"][2]}</span><SplitButton styles={{ opacity: isRunning ? 0.5 : 1 }} color="#fe3939" topOnClick={() => handleScoreClick("red", 2)} bottomOnClick={() => handleScoreClick("red", 2, "subtract")} icon={sRedArmor}></SplitButton></div>
                    <div className="num-point"><span>{scoreBoard["red"][3]}</span><SplitButton styles={{ opacity: isRunning ? 0.5 : 1 }} color="#fe3939" topOnClick={() => handleScoreClick("red", 3)} bottomOnClick={() => handleScoreClick("red", 3, "subtract")} icon={sRedHelmet}></SplitButton></div>
                    <div className="num-point"><span>{scoreBoard["red"][4]}</span><SplitButton styles={{ opacity: isRunning ? 0.5 : 1 }} color="#fe3939" topOnClick={() => handleScoreClick("red", 4)} bottomOnClick={() => handleScoreClick("red", 4, "subtract")}>4</SplitButton></div>
                    <div className="num-point"><span>{scoreBoard["red"][5]}</span><SplitButton styles={{ opacity: isRunning ? 0.5 : 1 }} color="#fe3939" topOnClick={() => handleScoreClick("red", 5)} bottomOnClick={() => handleScoreClick("red", 5, "subtract")}>5</SplitButton></div>
                    <div className="num-point gamjeom"><span>{scoreBoard["red"]["gj"]}</span><SplitButton styles={{ opacity: isRunning ? 0.5 : 1 }} color="#fe3939" topOnClick={() => handleScoreClick("red", "gj")} bottomOnClick={() => handleScoreClick("red", "gj", "subtract")}>GJ</SplitButton></div>
                </div>
            </div>
            {/* <div className="footer"></div> */}
        </div>
    )
}