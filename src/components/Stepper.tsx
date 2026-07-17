export default function Stepper(props: {
    value: number
    onChange?: (v: number) => void
    min?: number
    max?: number
    suffix?: string
    /** Mờ và không tương tác được */
    disabled?: boolean
    /** Class bổ sung cho wrapper */
    className?: string
}) {
    const min = props.min ?? 0
    const max = props.max ?? 99

    function dec() {
        if (!props.disabled) props.onChange?.(Math.max(min, props.value - 1))
    }
    function inc() {
        if (!props.disabled) props.onChange?.(Math.min(max, props.value + 1))
    }

    return (
        <div className={`
            flex items-center bg-gray-100 rounded-[10px] overflow-hidden shrink-0
            transition-opacity select-none text-black
            ${props.disabled ? "opacity-40 pointer-events-none" : ""}
            ${props.className ?? ""}
        `}>
            <button
                className="flex-center w-[36px] h-[36px] text-[20px]
                    text-[rgb(var(--color-text-secondary))]
                    active:bg-black/10 transition-colors"
                onClick={dec}
            >−</button>

            <span className="min-w-[32px] text-center text-[15px] font-semibold
                text-[rgb(var(--color-text-primary))]">
                {props.value}{props.suffix ?? ""}
            </span>

            <button
                className="flex-center w-[36px] h-[36px] text-[20px]
                    text-[rgb(var(--color-text-secondary))]
                    active:bg-black/10 transition-colors"
                onClick={inc}
            >+</button>
        </div>
    )
}