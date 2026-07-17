import { Swiper, SwiperSlide } from "swiper/react"
import { useRef, useState, forwardRef, useImperativeHandle, useEffect, useMemo, ReactNode } from "react"
import { FreeMode, Mousewheel } from 'swiper/modules'
import { useIsMobile } from "./UseStates"

type TimeUnit = "minutesTens" | "minutesUnits" | "secondsTens" | "secondsUnits" | "millisHundreds" | "millisTens"
type TimeParts = { [K in TimeUnit]: number }

const DIGITS_0_9_DESC = Array.from({ length: 10 }, (_, i) => 9 - i)
const DIGITS_0_5_DESC = Array.from({ length: 6 }, (_, i) => 5 - i)

const TIME_UNIT_ORDER: TimeUnit[] = [
    "minutesTens",
    "minutesUnits",
    "secondsTens",
    "secondsUnits",
    "millisHundreds",
    "millisTens",
]

export default function TimePicker(props: {
    title?: string
    initTimeMs: number
    onSubmit?: (ms?: number) => void
}) {
    const [timeParts, setTimeParts] = useState<TimeParts>(splitTime(props.initTimeMs))
    const numberPickerRefs = useRef<Record<TimeUnit, NumberPickerRef | null>>({
        minutesTens: null,
        minutesUnits: null,
        secondsTens: null,
        secondsUnits: null,
        millisHundreds: null,
        millisTens: null,
    })
    const [focusedUnit, setFocusedUnit] = useState<TimeUnit | null>(null)
    const inputRef = useRef<HTMLInputElement>(null)
    const isMobile = useIsMobile()

    useEffect(() => {
        setTimeParts(splitTime(props.initTimeMs))
    }, [props.initTimeMs])

    function splitTime(ms: number): TimeParts {
        const totalMinutes = Math.floor(ms / 60000)
        const totalSeconds = Math.floor(ms / 1000) % 60
        const milli = ms % 1000

        return {
            minutesTens: Math.floor(totalMinutes / 10),
            minutesUnits: totalMinutes % 10,
            secondsTens: Math.floor(totalSeconds / 10),
            secondsUnits: totalSeconds % 10,
            millisHundreds: Math.floor(milli / 100),
            millisTens: Math.floor(milli / 10) % 10
        }
    }

    function joinTime(d: TimeParts) {
        return (
            (d.minutesTens * 10 + d.minutesUnits) * 60000 +
            (d.secondsTens * 10 + d.secondsUnits) * 1000 +
            d.millisHundreds * 100 +
            d.millisTens * 10 +
            props.initTimeMs % 10
        )
    }

    useEffect(() => {
        if (focusedUnit && inputRef.current !== document.activeElement) {
            inputRef.current?.focus()
        }
    }, [focusedUnit])

    function focusNextUnit(current: TimeUnit) {
        const idx = TIME_UNIT_ORDER.indexOf(current)
        if (idx === -1) return null
        return TIME_UNIT_ORDER[idx + 1] || current
    }

    function focusPrevUnit(current: TimeUnit) {
        const idx = TIME_UNIT_ORDER.indexOf(current)
        if (idx <= 0) return null

        return TIME_UNIT_ORDER[idx - 1]
    }

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const raw = e.target.value
        e.target.value = "" // reset để lần sau tiếp tục nhập

        if (!raw) return

        const digit = Number(raw.slice(-1)) // lấy chữ số cuối cùng

        if (!isNaN(digit) && focusedUnit) {
            numberPickerRefs.current[focusedUnit]?.setValue(digit)
            const next = focusNextUnit(focusedUnit)
            setFocusedUnit(next)
        }
    }

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (!focusedUnit) return

        switch (e.key) {
            case "Backspace": {
                e.preventDefault()

                numberPickerRefs.current[focusedUnit]?.setValue(0)

                const prev = focusPrevUnit(focusedUnit)
                if (prev) setFocusedUnit(prev)
                break
            }

            case "Enter": {
                e.preventDefault()
                inputRef.current?.blur() // đóng keyboard
                setFocusedUnit(null)
                break
            }

            case " ": // Space
            case "Spacebar": { // legacy
                e.preventDefault() // không tạo dấu cách trong input

                const next = focusNextUnit(focusedUnit)
                if (next) setFocusedUnit(next)
                break
            }

            default:
                break
        }
    }

    return (
        <div className="
        grid 
        grid-cols-[2fr_1fr_2fr_1fr_2fr] 
        grid-rows-[6fr_2fr_3fr_16fr_3fr_2fr_6fr]
        items-center 
        
        max-w-[400px] max-h-[350px] 
        w-full h-full
        px-[30px] py-[10px]

        text-black
        bg-white
        rounded-[10px]
        z-[100]
        select-none"

        // style={{ transform: focusedUnit && isMobile ? "translateY(calc(40px - 50%))" : "translateY(0%)" }}
        >
            <div className="col-[1/-1] flex justify-center items-start h-full">{props.title}</div>

            {/* Các nút chuyển swiper */}
            <div className="justify-self-center flex justify-around items-center w-[70%] overflow-hidden">
                <Stepper onClick={() => numberPickerRefs.current.minutesTens?.prev()}>▴</Stepper>
                <Stepper onClick={() => numberPickerRefs.current.minutesUnits?.prev()}>▴</Stepper>
            </div>
            <div></div>
            <div className="justify-self-center flex justify-around items-center w-[70%] overflow-hidden">
                <Stepper onClick={() => numberPickerRefs.current.secondsTens?.prev()}>▴</Stepper>
                <Stepper onClick={() => numberPickerRefs.current.secondsUnits?.prev()}>▴</Stepper>
            </div>
            <div></div>
            <div className="justify-self-center flex justify-around items-center w-[70%] overflow-hidden">
                <Stepper onClick={() => numberPickerRefs.current.millisHundreds?.prev()}>▴</Stepper>
                <Stepper onClick={() => numberPickerRefs.current.millisTens?.prev()}>▴</Stepper>
            </div>

            <div className="col-[1/-1] justify-self-center self-center w-full h-[1px] bg-black opacity-[0.2]" />

            {/* Các swiper */}
            <div className="justify-self-center flex justify-around items-center w-[70%] overflow-hidden">
                <NumberPicker
                    ref={(el) => { numberPickerRefs.current.minutesTens = el }}
                    numbers={DIGITS_0_9_DESC}
                    value={timeParts.minutesTens}
                    onValueChanged={(v) => setTimeParts(prev => ({ ...prev, minutesTens: v }))}
                    isFocused={focusedUnit === "minutesTens"}
                    onClick={() => {
                        if (focusedUnit === "minutesTens") setFocusedUnit(null)
                        else setFocusedUnit("minutesTens")
                    }}
                />
                <NumberPicker
                    ref={(el) => { numberPickerRefs.current.minutesUnits = el }}
                    numbers={DIGITS_0_9_DESC}
                    value={timeParts.minutesUnits}
                    onValueChanged={(v) => setTimeParts(prev => ({ ...prev, minutesUnits: v }))}
                    isFocused={focusedUnit === "minutesUnits"}
                    onClick={() => {
                        if (focusedUnit === "minutesUnits") setFocusedUnit(null)
                        else setFocusedUnit("minutesUnits")
                    }}
                />
            </div>
            <span className="opacity-[0.3]">phút</span>
            <div className="justify-self-center flex justify-around items-center w-[70%] overflow-hidden">
                <NumberPicker
                    ref={(el) => { numberPickerRefs.current.secondsTens = el }}
                    numbers={DIGITS_0_5_DESC}
                    value={timeParts.secondsTens}
                    onValueChanged={(v) => setTimeParts(prev => ({ ...prev, secondsTens: v }))}
                    isFocused={focusedUnit === "secondsTens"}
                    onClick={() => {
                        if (focusedUnit === "secondsTens") setFocusedUnit(null)
                        else setFocusedUnit("secondsTens")
                    }}
                />
                <NumberPicker
                    ref={(el) => { numberPickerRefs.current.secondsUnits = el }}
                    numbers={DIGITS_0_9_DESC}
                    value={timeParts.secondsUnits}
                    onValueChanged={(v) => setTimeParts(prev => ({ ...prev, secondsUnits: v }))}
                    isFocused={focusedUnit === "secondsUnits"}
                    onClick={() => {
                        if (focusedUnit === "secondsUnits") setFocusedUnit(null)
                        else setFocusedUnit("secondsUnits")
                    }}
                />
            </div>
            <span className="opacity-[0.3]">giây</span>
            <div className="justify-self-center flex justify-around items-center w-[70%] overflow-hidden">
                <NumberPicker
                    ref={(el) => { numberPickerRefs.current.millisHundreds = el }}
                    numbers={DIGITS_0_9_DESC}
                    value={timeParts.millisHundreds}
                    onValueChanged={(v) => setTimeParts(prev => ({ ...prev, millisHundreds: v }))}
                    isFocused={focusedUnit === "millisHundreds"}
                    onClick={() => {
                        if (focusedUnit === "millisHundreds") setFocusedUnit(null)
                        else setFocusedUnit("millisHundreds")
                    }}
                />
                <NumberPicker
                    ref={(el) => { numberPickerRefs.current.millisTens = el }}
                    numbers={DIGITS_0_9_DESC}
                    value={timeParts.millisTens}
                    onValueChanged={(v) => setTimeParts(prev => ({ ...prev, millisTens: v }))}
                    isFocused={focusedUnit === "millisTens"}
                    onClick={() => {
                        if (focusedUnit === "millisTens") setFocusedUnit(null)
                        else setFocusedUnit("millisTens")
                    }}
                />
            </div>

            <div className="col-[1/-1] justify-self-center self-center w-full h-[1px] bg-black opacity-[0.2]" />

            {/* Các nút chuyển swiper */}
            <div className="justify-self-center flex justify-around items-center w-[70%] overflow-hidden">
                <Stepper onClick={() => numberPickerRefs.current.minutesTens?.next()}>▾</Stepper>
                <Stepper onClick={() => numberPickerRefs.current.minutesUnits?.next()}>▾</Stepper>
            </div>
            <div></div>
            <div className="justify-self-center flex justify-around items-center w-[70%] overflow-hidden">
                <Stepper onClick={() => numberPickerRefs.current.secondsTens?.next()}>▾</Stepper>
                <Stepper onClick={() => numberPickerRefs.current.secondsUnits?.next()}>▾</Stepper>
            </div>
            <div></div>
            <div className="justify-self-center flex justify-around items-center w-[70%] overflow-hidden">
                <Stepper onClick={() => numberPickerRefs.current.millisHundreds?.next()}>▾</Stepper>
                <Stepper onClick={() => numberPickerRefs.current.millisTens?.next()}>▾</Stepper>
            </div>

            <div className="col-[1/-1] flex justify-center items-end w-full h-full gap-[10px]">
                <div
                    className="flex-1 flex-center h-[30px] rounded-[10px] active:scale-90 active:bg-[#00000020] transition"
                    onClick={() => props.onSubmit?.(joinTime(timeParts))}
                >✓</div>
                <div className="w-[1px] h-[30%] bg-black opacity-[0.2]" />
                <div
                    className="flex-1 flex-center h-[30px] rounded-[10px] active:scale-90 active:bg-[#00000020] transition"
                    onClick={() => props.onSubmit?.()}
                >✕</div>
            </div>

            <input
                ref={inputRef}
                type="text"
                inputMode="numeric"
                className="fixed opacity-0 pointer-events-none"
                onChange={handleChange}
                onBlur={() => setFocusedUnit(null)}
                onKeyDown={handleKeyDown}
            />
        </div >
    )
}

function Stepper(props: {
    children: ReactNode
    onClick?: () => void
}) {
    return (
        <div className="
        flex-center 
        w-[25px] h-[25px] 
        text-[20px] 
        border-[1px] border-[black] rounded-[7px] 
        opacity-[0.2] 
        active:scale-90 active:opacity-[1] 
        transition"
            onClick={props.onClick}
        >
            {props.children}
        </div>
    )
}

type NumberPickerProps = {
    numbers: number[]
    value?: number
    onValueChanged?: (value: number) => void
    isFocused?: boolean
    onClick?: () => void
}

type NumberPickerRef = {
    next(): void
    prev(): void
    setValue(value: number): void
}

function createWheelData(base: number[], repeat = 20) {
    return Array.from({ length: repeat }, () => base).flat()
}

const NumberPicker = forwardRef<NumberPickerRef, NumberPickerProps>((props, ref) => {
    const repeat = 7
    const swiperRef = useRef<any>(null)
    const dataClone = useMemo(
        () => createWheelData(props.numbers, repeat),
        [props.numbers])

    useEffect(() => {
        setValue(props.value ?? props.numbers[0])
    }, [props.value, props.numbers])

    function setValue(value: number) {
        const baseIndex = props.numbers.indexOf(value)
        if (baseIndex === -1) return

        const len = props.numbers.length
        const middleSegment = Math.floor(repeat / 2)
        const normalized = middleSegment * len + baseIndex

        if (swiperRef.current.activeIndex !== normalized) {
            swiperRef.current.slideTo(normalized, 0)
        }
    }

    useImperativeHandle(ref, () => ({
        next(speed = 120) {
            swiperRef.current.slideTo(
                swiperRef.current.activeIndex + 1,
                speed
            )
        },
        prev(speed = 120) {
            swiperRef.current.slideTo(
                swiperRef.current.activeIndex - 1,
                speed
            )
        },
        setValue
    }), [props.numbers, props.value])

    // function handleMouseDown() {
    //     if (!swiperRef.current) return
    //     swiperRef.current.mousewheel = {
    //         forceToAxis: true,
    //         sensitivity: 1,
    //         thresholdDelta: 1,
    //         thresholdTime: 0,
    //     }
    // }

    // function handleMouseUp() {

    // }

    return (
        <Swiper
            onSwiper={(swiper) => { swiperRef.current = swiper }}
            direction="vertical"
            centeredSlides
            // initialSlide={Math.floor(dataClone.length / 2)}
            slidesPerView={3}
            spaceBetween={10}
            freeMode={{
                // enabled: true,
                // momentum: true,
                // momentumRatio: 0.25,
                momentumVelocityRatio: 0.25,
                // momentumBounce: false,
                sticky: true
            }}
            pagination={{
                clickable: true,
            }}
            mousewheel={{
                releaseOnEdges: true,
                sensitivity: 0.35,
            }}

            preventClicks={false}
            preventClicksPropagation={false}

            modules={[FreeMode, Mousewheel]}

            onTransitionEnd={(swiper) => {
                const len = props.numbers.length
                const index = swiper.activeIndex
                const middleSegment = Math.floor(repeat / 2)
                const normalizedOffset = ((index % len) + len) % len
                const normalized = middleSegment * len + normalizedOffset

                if (Math.abs(index - normalized) >= len) {
                    swiper.slideTo(normalized, 0)
                }

                const value = props.numbers[normalizedOffset]

                if (value !== props.value) {
                    props.onValueChanged?.(value)
                }
            }}

            className="w-1/2 h-[160px]"
        >
            {dataClone.map((n, idx) => (
                <SwiperSlide key={`${idx}-${n}`}>
                    <div
                        className={
                            "picker-item flex-center h-[40px] " +
                            (props.isFocused ? "caret" : "")
                        }
                        onClick={props.onClick}
                    >
                        {n}
                    </div>
                </SwiperSlide>
            ))}
        </Swiper>
    )
})