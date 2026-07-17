"use client"

import { useState } from "react"
import GoogleSheetI from "@/assets/google-sheet.svg"
import ExclamationI from "@/assets/exclamation.svg"
import ArrowI from "@/assets/arrow.svg"

// ============================================================
// SHEET CONFIG SECTION — Pure UI
// Không import bất kỳ service/hook nào
// Tất cả state + logic truyền vào qua props
// ============================================================

// ── Types ────────────────────────────────────────────────────

export type ConnectionStatus = "disconnected" | "connecting" | "connected" | "error"

export type SheetConfig = {
    spreadsheetId: string
    matchesTab: string
    resultsTab: string
    configTab: string
}

export const DEFAULT_SHEET_CONFIG: SheetConfig = {
    spreadsheetId: "",
    matchesTab: "matches",
    resultsTab: "results",
    configTab: "_config",
}

// Mapping mặc định hiển thị trong accordion
const DEFAULT_MAPPINGS = [
    { field: "match_id", column: "match_id", description: "Số thứ tự trận", required: true },
    { field: "blue_athlete", column: "blue_athlete", description: "Tên VĐV xanh", required: true },
    { field: "red_athlete", column: "red_athlete", description: "Tên VĐV đỏ", required: true },
    { field: "blue_team", column: "blue_team", description: "Đội xanh", required: false },
    { field: "red_team", column: "red_team", description: "Đội đỏ", required: false },
    { field: "weight_class", column: "weight_class", description: "Hạng cân", required: false },
    { field: "gender", column: "gender", description: "Giới tính (male/female)", required: false },
    { field: "category", column: "category", description: "Loại trận (final...)", required: false },
    { field: "round_ms", column: "round_ms", description: "Thời gian hiệp (ms)", required: false },
    { field: "break_ms", column: "break_ms", description: "Thời gian giải lao (ms)", required: false },
    { field: "kyeshi_ms", column: "kyeshi_ms", description: "Thời gian kye-shi (ms)", required: false },
    { field: "max_gamjeom", column: "max_gamjeom", description: "Gam-jeom tối đa", required: false },
    { field: "point_gap", column: "point_gap", description: "Điểm cách biệt", required: false },
    { field: "point_gap_enabled", column: "point_gap_enabled", description: "Áp dụng cách biệt (true/false)", required: false },
]

// ── Sub-components ────────────────────────────────────────────

function StatusBadge(props: { status: ConnectionStatus }) {
    const map: Record<ConnectionStatus, { label: string; cls: string }> = {
        disconnected: { label: "Chưa kết nối", cls: "bg-white/10 text-white/40" },
        connecting: { label: "Đang kiểm tra...", cls: "bg-blue-900/50 text-blue-300 animate-pulse" },
        connected: { label: "Đã kết nối", cls: "bg-green-900/50 text-green-300" },
        error: { label: "Lỗi kết nối", cls: "bg-red-900/50 text-red-300" },
    }
    const { label, cls } = map[props.status]
    return (
        <span className={`px-[8px] py-[2px] rounded-full text-[11px] font-semibold ${cls}`}>
            {label}
        </span>
    )
}

function DarkInput(props: {
    label: string
    value: string
    placeholder?: string
    hint?: string
    mono?: boolean
    onChange: (v: string) => void
}) {
    return (
        <div className="flex flex-col gap-[4px]">
            <span className="text-[11px] font-semibold text-white/40 uppercase tracking-wider">
                {props.label}
            </span>
            <input
                type="text"
                value={props.value}
                placeholder={props.placeholder}
                onChange={e => props.onChange(e.target.value)}
                className="w-full px-[10px] py-[7px] rounded-[8px] text-[14px]
                    bg-[#2a2a2a] border border-white/15 text-white
                    placeholder:text-white/35 outline-none
                    focus:border-blue-500/60 focus:bg-[#333] transition-colors"
            />
            {props.hint && (
                <span className="text-[11px] text-white/30">{props.hint}</span>
            )}
        </div>
    )
}

function MappingRow(props: {
    field: string
    column: string
    description: string
    required: boolean
    onChange: (v: string) => void
}) {
    return (
        <div className="grid grid-cols-[1fr_1fr] gap-[8px] items-center
            py-[7px] border-b border-white/5 last:border-0">
            <div className="flex flex-col gap-[1px]">
                <div className="flex items-center gap-[4px]">
                    <span className="font-mono text-[12px] text-blue-300">{props.field}</span>
                    {props.required && (
                        <span className="text-[9px] text-red-400 font-bold">*</span>
                    )}
                </div>
                <span className="text-[10px] text-white/35 leading-tight">{props.description}</span>
            </div>
            <input
                type="text"
                value={props.column}
                onChange={e => props.onChange(e.target.value)}
                className="w-full px-[10px] py-[7px] rounded-[8px] text-[14px]
                    bg-[#2a2a2a] border border-white/15 text-white
                    placeholder:text-white/35 outline-none
                    focus:border-blue-500/60 focus:bg-[#333] transition-colors"
            />
        </div>
    )
}

// ── Main component ────────────────────────────────────────────

export default function SheetConfigSection(props: {
    // Config
    config: SheetConfig
    onConfigChange: (updates: Partial<SheetConfig>) => void
    // Connection state
    status: ConnectionStatus
    loading: boolean
    errorMsg: string
    availableTabs: string[]
    matchCount: number
    // Actions (sẽ nối với logic thật sau)
    onTestConnection: () => void
    onFetchMatches: () => void
    onDisconnect?: () => void
}) {
    const [showMapping, setShowMapping] = useState(false)
    const [mappings, setMappings] = useState<Record<string, string>>(() => {
        const m: Record<string, string> = {}
        for (const row of DEFAULT_MAPPINGS) m[row.field] = row.column
        return m
    })

    const isConnected = props.status === "connected"
    const hasSpreadId = props.config.spreadsheetId.trim().length > 0

    return (
        <div className="flex flex-col gap-[14px]">

            {/* ── Header ── */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-[8px]">
                    <GoogleSheetI className="h-[18px] shrink-0" />
                    <span className="text-[15px] font-semibold text-white/80">Google Sheets</span>
                </div>
                <StatusBadge status={props.status} />
            </div>

            {/* ── Error banner ── */}
            {props.errorMsg && (
                <div className="flex items-start gap-[8px] px-[12px] py-[10px]
                    bg-red-950/50 border border-red-800/50 rounded-[10px]">
                    <ExclamationI className="h-[14px] text-red-400 shrink-0 mt-[1px]" />
                    <span className="text-[12px] text-red-300 leading-relaxed">
                        {props.errorMsg}
                    </span>
                </div>
            )}

            {/* ── Connected banner ── */}
            {isConnected && (
                <div className="flex items-center gap-[8px] px-[12px] py-[10px]
                    bg-green-950/40 border border-green-800/40 rounded-[10px]">
                    <div className="w-[7px] h-[7px] rounded-full bg-green-400 shrink-0" />
                    <span className="text-[13px] text-green-300 flex-1">
                        {props.matchCount > 0
                            ? `Đã tải ${props.matchCount} trận đấu`
                            : "Kết nối thành công"}
                    </span>
                    {props.matchCount === 0 && (
                        <button
                            onClick={props.onFetchMatches}
                            className="text-[11px] text-green-400 font-semibold
                                active:opacity-60 shrink-0"
                        >
                            Tải ngay
                        </button>
                    )}
                </div>
            )}

            {/* ── Spreadsheet ID ── */}
            <DarkInput
                label="Spreadsheet ID hoặc URL"
                value={props.config.spreadsheetId}
                placeholder="1BxiMVs0XRA5n... hoặc dán URL Sheet"
                hint="Dán toàn bộ URL — app sẽ tự trích xuất ID"
                mono
                onChange={v => props.onConfigChange({ spreadsheetId: v })}
            />

            {/* ── Tab names ── */}
            <div className="grid grid-cols-[1fr_1fr] gap-[10px]">
                <DarkInput
                    label="Tab trận đấu"
                    value={props.config.matchesTab}
                    placeholder="matches"
                    mono
                    onChange={v => props.onConfigChange({ matchesTab: v })}
                />
                <DarkInput
                    label="Tab kết quả"
                    value={props.config.resultsTab}
                    placeholder="results"
                    mono
                    onChange={v => props.onConfigChange({ resultsTab: v })}
                />
            </div>

            <DarkInput
                label="Tab mapping cột (tuỳ chọn)"
                value={props.config.configTab}
                placeholder="_config"
                hint="Bỏ trống để dùng tên cột mặc định"
                mono
                onChange={v => props.onConfigChange({ configTab: v })}
            />

            {/* ── Tabs có sẵn ── */}
            {props.availableTabs.length > 0 && (
                <div className="flex flex-wrap items-center gap-[6px]">
                    <span className="text-[11px] text-white/30">Tab có sẵn:</span>
                    {props.availableTabs.map(tab => (
                        <button
                            key={tab}
                            onClick={() => {
                                // Nhấn vào tab để tự điền vào ô matches/results
                                if (!props.config.matchesTab || props.config.matchesTab === "matches")
                                    props.onConfigChange({ matchesTab: tab })
                            }}
                            className="px-[6px] py-[2px] rounded-[4px] bg-white/8
                                text-[11px] font-mono text-white/60
                                active:bg-white/15 transition-colors"
                        >
                            {tab}
                        </button>
                    ))}
                </div>
            )}

            {/* ── Column mapping accordion ── */}
            <button
                onClick={() => setShowMapping(s => !s)}
                className="flex items-center justify-between w-full
                    px-[12px] py-[10px] rounded-[10px] text-left
                    bg-white/5 border border-white/8
                    text-[13px] text-white/60
                    active:bg-white/10 transition-colors"
            >
                <span>Tuỳ chỉnh tên cột</span>
                <ArrowI className={`h-[10px] transition-transform duration-200
                    ${showMapping ? "rotate-0" : "-rotate-90"}`} />
            </button>

            {showMapping && (
                <div className="flex flex-col px-[12px] py-[8px]
                    bg-white/3 border border-white/8 rounded-[10px]">
                    <div className="grid grid-cols-[1fr_1fr] gap-[8px] pb-[8px]
                        border-b border-white/10 mb-[4px]">
                        <span className="text-[10px] font-semibold text-white/30
                            uppercase tracking-wider">
                            Field app
                        </span>
                        <span className="text-[10px] font-semibold text-white/30
                            uppercase tracking-wider">
                            Tên cột trong Sheet
                        </span>
                    </div>
                    {DEFAULT_MAPPINGS.map(row => (
                        <MappingRow
                            key={row.field}
                            field={row.field}
                            column={mappings[row.field] ?? row.column}
                            description={row.description}
                            required={row.required}
                            onChange={v => setMappings(m => ({ ...m, [row.field]: v }))}
                        />
                    ))}
                    <p className="text-[10px] text-white/25 mt-[8px]">
                        * Bắt buộc
                    </p>
                </div>
            )}

            {/* ── Action buttons ── */}
            <div className="flex gap-[8px]">
                <button
                    disabled={props.loading || !hasSpreadId}
                    onClick={props.onTestConnection}
                    className={`flex-1 py-[12px] rounded-[12px] text-[14px] font-semibold
                        transition-all active:scale-[0.97]
                        ${props.loading || !hasSpreadId
                            ? "bg-white/5 text-white/25 cursor-not-allowed"
                            : "bg-white/12 text-white active:bg-white/20"
                        }`}
                >
                    {props.loading ? "Đang kiểm tra..." : "Kiểm tra kết nối"}
                </button>

                {isConnected && (
                    <button
                        disabled={props.loading}
                        onClick={props.onFetchMatches}
                        className="flex-1 py-[12px] rounded-[12px] text-[14px] font-semibold
                            bg-green-900/50 text-green-300
                            active:scale-[0.97] active:bg-green-900/70 transition-all"
                    >
                        Tải lại trận đấu
                    </button>
                )}
            </div>

            {/* ── Disconnect button ── */}
            {isConnected && props.onDisconnect && (
                <button
                    onClick={props.onDisconnect}
                    className="w-full py-[10px] rounded-[12px] text-[13px] text-white/30
                        border border-white/8 active:bg-white/5 transition-colors"
                >
                    Ngắt kết nối
                </button>
            )}

            {/* ── Setup guide (chỉ hiện khi chưa có ID) ── */}
            {props.status === "disconnected" && !hasSpreadId && (
                <div className="flex flex-col gap-[10px] px-[12px] py-[12px]
                    bg-white/3 border border-white/8 rounded-[10px]">
                    <span className="text-[12px] font-semibold text-white/50">
                        Hướng dẫn kết nối lần đầu
                    </span>
                    {[
                        "Vào Google Cloud Console → tạo project → bật Sheets API",
                        "Tạo Service Account → tải file JSON chứa private key",
                        "Thêm GOOGLE_SERVICE_ACCOUNT_EMAIL và GOOGLE_PRIVATE_KEY vào file .env",
                        "Mở Google Sheet → Share → dán email service account → Editor",
                        "Dán Spreadsheet ID hoặc URL vào ô bên trên rồi nhấn Kiểm tra kết nối",
                    ].map((step, i) => (
                        <div key={i} className="flex items-start gap-[10px]">
                            <div className="flex items-center justify-center
                                w-[18px] h-[18px] rounded-full shrink-0 mt-[1px]
                                bg-white/10 text-white/40 text-[9px] font-bold">
                                {i + 1}
                            </div>
                            <span className="text-[12px] text-white/40 leading-relaxed">
                                {step}
                            </span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}