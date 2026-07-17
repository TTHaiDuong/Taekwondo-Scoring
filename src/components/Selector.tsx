"use client"

import { useEffect, useRef } from "react"

type SelectorRecord = string | { key: string; description: string }

export default function Selector(props: {
    title?: string
    data: SelectorRecord[]
    value?: SelectorRecord
    onHeaderClick?: () => void
    onValueChanged?: (value: string) => void
}) {
    const selectedRef = useRef<HTMLButtonElement | null>(null)

    useEffect(() => {
        selectedRef.current?.scrollIntoView({ block: "center", behavior: "instant" })
    }, [props.value])

    return (
        <div className="flex flex-col w-full max-h-[60dvh] rounded-t-[20px] overflow-hidden"
            style={{ background: "#f2f2f7", borderTop: "1px solid rgba(0,0,0,0.08)" }}>

            {/* Handle bar */}
            <div className="flex justify-center pt-[10px] pb-[4px]" onClick={props.onHeaderClick}>
                <div className="w-[40px] h-[4px] rounded-full bg-black/15" />
            </div>

            {/* Title */}
            {props.title && (
                <div className="px-[20px] pt-[6px] pb-[12px]"
                    style={{ borderBottom: "1px solid rgba(0,0,0,0.08)" }}>
                    <span className="text-[12px] font-semibold text-black/40 uppercase tracking-wider">
                        {props.title}
                    </span>
                </div>
            )}

            {/* Items */}
            <div className="flex-1 overflow-y-auto bg-white py-[4px]">
                {props.data.map((row, idx) => {
                    const key = typeof row === "string" ? row : row.key
                    const desc = typeof row === "string" ? null : row.description
                    const isSelected = key === (
                        typeof props.value === "string" ? props.value : props.value?.key
                    )
                    const isLast = idx === props.data.length - 1

                    return (
                        <button
                            ref={isSelected ? selectedRef : null}
                            key={key}
                            onClick={() => props.onValueChanged?.(key)}
                            className="flex items-center w-full px-[20px] py-[13px] gap-[12px]
                                transition-colors active:bg-black/5 text-left"
                            style={{
                                borderBottom: isLast ? "none" : "1px solid rgba(0,0,0,0.06)",
                                background: isSelected ? "rgba(0,122,255,0.06)" : undefined,
                            }}
                        >
                            {/* Key / code */}
                            <span className={`font-mono font-bold text-[14px] min-w-[48px]
                                ${isSelected ? "text-[#007AFF]" : "text-black/40"}`}>
                                {key}
                            </span>

                            {/* Description */}
                            {desc && (
                                <span className={`flex-1 text-[15px] leading-snug
                                    ${isSelected ? "text-black font-medium" : "text-black/70"}`}>
                                    {desc}
                                </span>
                            )}

                            {/* Checkmark */}
                            <div className="w-[20px] flex justify-center shrink-0">
                                {isSelected && (
                                    <svg className="w-[16px] h-[16px]" viewBox="0 0 24 24"
                                        fill="none" stroke="#007AFF" strokeWidth={2.5}
                                        strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M5 13l4 4L19 7" />
                                    </svg>
                                )}
                            </div>
                        </button>
                    )
                })}
            </div>

            {/* Safe area */}
            <div className="bg-white" style={{ height: "env(safe-area-inset-bottom, 8px)" }} />
        </div>
    )
}