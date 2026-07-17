import { forwardRef, ReactNode, useImperativeHandle, useState } from "react"

const PopupOverlay = forwardRef((props: {
    // bgOnClick?: () => void
    children?: ReactNode
    className?: string
    z?: number
    background?: boolean
    visible?: boolean
}, ref) => {
    const [visible, setVisible] = useState<boolean>(Boolean(props.visible))

    useImperativeHandle(ref, () => ({
        setVisible(value: boolean) { setVisible(value) }
    }))

    return (
        visible &&
        <div
            className={"fixed inset-0 w-full h-full " + props.className}
            style={{
                backgroundColor: props.background ? "var(--color-overlay)" : undefined,
                zIndex: props.z ?? 10
            }}
            onClick={(e) => {
                if (e.target !== e.currentTarget) return
                setVisible(false)
            }}
        >
            {props.children}
        </div>
    )
})

export default PopupOverlay