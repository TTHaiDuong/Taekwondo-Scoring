import { useState, useRef, useLayoutEffect } from "react"

type SwitchState = {
    track: string
    thumb: string
}

export const SWITCH_COLORS = {
    on: {
        track: "#1976D2",
        thumb: "#FFFFFF",
    },
    off: {
        track: "#BDBDBD",
        thumb: "#FFFFFF",
    },
    disabled: {
        track: "#E0E0E0",
        thumb: "#F5F5F5",
    },
}

export default function Switch(props: {
    className?: string
    value?: boolean
    disable?: boolean
    onValueChanged?: (value: boolean) => void
    variant?: {
        on?: SwitchState
        off?: SwitchState
        disable?: SwitchState
    }
}) {
    // const [checked, setValue] = useState<boolean>(props.value || false)
    const ref = useRef<HTMLButtonElement>(null)
    const [offset, setOffset] = useState(0)

    function toggle() {
        props.onValueChanged?.(!props.value)
        // setValue(prev => {
        //     const newValue = !prev
        //     props.onValueChanged?.(newValue)
        //     return newValue
        // })
    }

    useLayoutEffect(() => {
        const el = ref.current
        if (!el) return

        const observer = new ResizeObserver(() => {
            const { width, height } = el.getBoundingClientRect()
            setOffset(width - height)
        })

        observer.observe(el)
        return () => observer.disconnect()
    }, [])

    const theme = { ...SWITCH_COLORS, ...props.variant }
    const color = props.disable
        ? theme.disable
        : props.value
            ? theme.on
            : theme.off

    return (
        <button
            ref={ref}
            disabled={props.disable}
            className={"pill flex w-[35px] h-[20px] p-[3px] " + props.className}
            style={{
                backgroundColor: color?.track,
                cursor: props.disable ? "not-allowed" : "pointer"
            }}
            onClick={toggle}
        >
            <div
                className="circle button transition-transform duration-300 ease-out drop-shadow"
                style={{
                    backgroundColor: color?.thumb,
                    transform: `translateX(${props.value ? offset : 0}px)`
                    // transform: `translateX(${checked ? offset : 0}px)`
                }}
            >
            </div>
        </button>
    )
}