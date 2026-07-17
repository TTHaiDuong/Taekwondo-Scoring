"use client"

import { useState } from "react"
import ArrowI from "@/assets/arrow.svg"
import WifiI from "@/assets/wifi.svg"
import ChainI from "@/assets/chain.svg"

// ============================================================
// COURT CONNECTION — Sub-page Mã bảng điểm
// Mở từ NavRow "Mã bảng điểm" trong MobileSetting
// ============================================================

export default function CourtConnection(props: {
    onBack: () => void
    courtId: string
    serverUrl: string
    latencyMs: number | null
    isConnected: boolean
    judgesCount: number
    judgesMax: number
}) {
    const [copied, setCopied] = useState(false)

    function copyId() {
        navigator.clipboard.writeText(props.courtId).then(() => {
            setCopied(true)
            setTimeout(() => setCopied(false), 2000)
        })
    }

    const statusColor = props.isConnected ? "text-green-400" : "text-red-400"
    const statusLabel = props.isConnected ? "Đang kết nối" : "Mất kết nối"

    return (
        <div className="flex flex-col gap-[20px]">

            {/* Header */}
            <div className="flex items-center gap-[10px]">
                <button
                    onClick={props.onBack}
                    className="flex-center w-[32px] h-[32px] rounded-full
                        bg-white/10 active:bg-white/20 transition-colors shrink-0"
                >
                    <ArrowI className="h-[10px] rotate-90 text-white/60" />
                </button>
                <span className="text-[17px] font-semibold text-white">Mã bảng điểm</span>
            </div>

            {/* Mã bảng điểm lớn */}
            <div className="flex flex-col items-center gap-[12px] py-[24px]
                bg-white/5 rounded-[16px] border border-white/8">
                <span className="text-[11px] font-semibold text-white/40 uppercase tracking-wider">
                    Mã sân
                </span>
                <span className="font-score font-bold text-[52px] text-white leading-none tracking-widest">
                    {props.courtId}
                </span>
                <button
                    onClick={copyId}
                    className={`px-[16px] py-[6px] rounded-[8px] text-[13px] font-medium
                        transition-colors
                        ${copied
                            ? "bg-green-900/50 text-green-300"
                            : "bg-white/10 text-white/60 active:bg-white/20"
                        }`}
                >
                    {copied ? "✓ Đã sao chép" : "Sao chép mã"}
                </button>
                <p className="text-[11px] text-white/30 text-center px-[20px] leading-relaxed">
                    Các máy giám định và tracking board dùng mã này để kết nối vào cùng sân
                </p>
            </div>

            {/* Trạng thái kết nối server */}
            <div className="flex flex-col gap-[6px]">
                <span className="px-[2px] text-[11px] font-semibold uppercase tracking-wider text-white/35">
                    Kết nối server
                </span>
                <div className="flex flex-col px-[16px] bg-white/5 border border-white/8 rounded-[16px]">

                    <div className="flex items-center min-h-[48px] gap-[10px]">
                        <WifiI className="h-[14px] text-white/40 shrink-0" />
                        <span className="text-[14px] text-white/70 flex-1">Trạng thái</span>
                        <div className="flex items-center gap-[6px]">
                            <div className={`w-[7px] h-[7px] rounded-full
                                ${props.isConnected ? "bg-green-400" : "bg-red-400"}`} />
                            <span className={`text-[13px] font-semibold ${statusColor}`}>
                                {statusLabel}
                            </span>
                        </div>
                    </div>

                    <div className="h-[1px] bg-white/8 mx-[2px]" />

                    <div className="flex items-center min-h-[48px] gap-[10px]">
                        <span className="text-[14px] text-white/70 flex-1">Độ trễ</span>
                        <span className="font-score text-[15px] font-semibold text-white/60">
                            {props.latencyMs !== null ? `${props.latencyMs}ms` : "–"}
                        </span>
                    </div>

                    <div className="h-[1px] bg-white/8 mx-[2px]" />

                    <div className="flex items-center min-h-[48px] gap-[10px]">
                        <span className="text-[14px] text-white/70 flex-1">Địa chỉ server</span>
                        <span className="font-mono text-[12px] text-white/40 text-right max-w-[160px] truncate">
                            {props.serverUrl || "–"}
                        </span>
                    </div>

                    <div className="h-[1px] bg-white/8 mx-[2px]" />

                    <div className="flex items-center min-h-[48px] gap-[10px]">
                        <span className="text-[14px] text-white/70 flex-1">Giám định kết nối</span>
                        <span className={`text-[14px] font-semibold
                            ${props.judgesCount >= props.judgesMax
                                ? "text-green-400"
                                : props.judgesCount > 0 ? "text-amber-400" : "text-white/40"
                            }`}>
                            {props.judgesCount} / {props.judgesMax}
                        </span>
                    </div>
                </div>
            </div>

            {/* Hướng dẫn kết nối máy khác */}
            <div className="flex flex-col gap-[8px] px-[14px] py-[12px]
                bg-white/3 rounded-[12px] border border-white/8">
                <div className="flex items-center gap-[8px]">
                    <ChainI className="h-[14px] text-white/40 shrink-0" />
                    <span className="text-[13px] font-semibold text-white/60">
                        Kết nối thiết bị khác
                    </span>
                </div>
                {[
                    "Mở ứng dụng trên thiết bị khác (máy giám định, tracking board)",
                    `Nhập mã sân: ${props.courtId}`,
                    "Hoặc kết nối cùng mạng WiFi — thiết bị sẽ tự tìm thấy nhau",
                ].map((step, i) => (
                    <div key={i} className="flex items-start gap-[8px]">
                        <div className="flex-center w-[16px] h-[16px] rounded-full shrink-0 mt-[1px]
                            bg-white/10 text-white/40 text-[9px] font-bold">
                            {i + 1}
                        </div>
                        <span className="text-[12px] text-white/40 leading-relaxed">{step}</span>
                    </div>
                ))}
            </div>
        </div>
    )
}