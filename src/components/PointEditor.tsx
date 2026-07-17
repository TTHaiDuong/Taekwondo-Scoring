import "@/styles/global.css"
import Plus from "@/assets/plus.svg"
import Minus from "@/assets/minus.svg"
import { ReactNode } from "react"

export default function PointEditor(props: {
    icon?: any
    iconColor?: string
    children?: ReactNode
    onPlusClick?: () => void
    onMinusClick?: () => void
    className?: string
}) {
    return (
        <div className={"flex items-stretch p-[2px] pill select-none " + props.className}>
            <div
                className="center pill aspect-square bg-white drop-shadow"
                style={{ color: props.iconColor }}
            >
                <div className="center h-[60%] aspect-square">
                    {typeof props.icon === "function"
                        ? <props.icon className="h-[100%] drop-shadow" />
                        : <span className="center text-[150%] font-bold">{props.icon}</span>}
                </div>
            </div>
            <div className="flex flex-1 [flex-direction:inherit] justify-around items-center">
                <div
                    className="center h-[1.5rem] aspect-square pill bg-white drop-shadow active"
                    onClick={props.onPlusClick}
                >
                    <Plus className="w-[60%] icon_default" />
                </div>
                <div>{props.children}</div>
                <div
                    className="center h-[1.5rem] aspect-square pill bg-white drop-shadow active"
                    onClick={props.onMinusClick}
                >
                    <Minus className="w-[60%] icon_default" />
                </div>
            </div>
        </div>
    )
}