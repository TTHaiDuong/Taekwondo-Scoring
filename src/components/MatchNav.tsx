"use client"

import { useState } from "react"
import {
    MatchInfo, MatchCategory, MATCH_CATEGORY_LABEL,
    AthleteInfo, countRoundWins
} from "@/scripts/match-types"
import ArrowI from "@/assets/arrow.svg"
import EditI from "@/assets/edit.svg"

// ============================================================
// MATCH NAV — Điều hướng + search + chỉnh sửa thủ công
// ============================================================

// ── Shared sub-components ────────────────────────────────────

function Badge(props: { label: string; color: "blue" | "red" | "gold" | "gray" }) {
    const s = {
        blue: "bg-blue-100 text-blue-800", red: "bg-red-100 text-red-800",
        gold: "bg-amber-100 text-amber-800", gray: "bg-gray-100 text-gray-600"
    }
    return <span className={`px-[8px] py-[2px] rounded-full text-[11px] font-semibold ${s[props.color]}`}>{props.label}</span>
}

function DarkInput(props: {
    label?: string
    value: string
    placeholder?: string
    onChange: (v: string) => void
    className?: string
}) {
    return (
        <div className={`flex flex-col gap-[3px] ${props.className ?? ""}`}>
            {props.label && (
                <span className="text-[10px] font-semibold text-white/35 uppercase tracking-wider">
                    {props.label}
                </span>
            )}
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
        </div>
    )
}

function DarkSelect<T extends string>(props: {
    label?: string
    value: T
    options: { value: T; label: string }[]
    onChange: (v: T) => void
}) {
    return (
        <div className="flex flex-col gap-[3px]">
            {props.label && (
                <span className="text-[10px] font-semibold text-white/35 uppercase tracking-wider">
                    {props.label}
                </span>
            )}
            <select
                value={props.value}
                onChange={e => props.onChange(e.target.value as T)}
                className="w-full px-[10px] py-[7px] rounded-[8px] text-[14px]
                    bg-[#2a2a2a] border border-white/15 text-white
                    outline-none focus:border-blue-500/60 transition-colors
                    appearance-none"
                style={{ backgroundImage: "none" }}
            >
                {props.options.map(o => (
                    <option key={o.value} value={o.value}
                        style={{ background: "#222", color: "white" }}>
                        {o.label}
                    </option>
                ))}
            </select>
        </div>
    )
}

// ── Athlete edit block ────────────────────────────────────────

function AthleteEditBlock(props: {
    side: "blue" | "red"
    info?: AthleteInfo
    wins: number
    onChange: (patch: Partial<AthleteInfo>) => void
}) {
    const isBlue = props.side === "blue"
    const accent = isBlue ? "border-blue-700/50 bg-blue-950/30" : "border-red-700/50 bg-red-950/30"

    return (
        <div className={`flex flex-col gap-[8px] p-[12px] rounded-[12px] border ${accent}`}>
            <div className="flex items-center gap-[8px]">
                <div className={`flex-center w-[26px] h-[26px] rounded-full font-bold text-[20px] shrink-0
                    ${isBlue ? "bg-blue-600 text-white" : "bg-red-600 text-white"}`}>
                    {props.wins}
                </div>
                <span className={`text-[12px] font-bold uppercase tracking-wider
                    ${isBlue ? "text-blue-400" : "text-red-400"}`}>
                    VĐV {isBlue ? "Xanh" : "Đỏ"}
                </span>
            </div>
            <DarkInput
                label="Tên vận động viên"
                value={String(props.info?.name)}
                placeholder={isBlue ? "Tên VĐV xanh" : "Tên VĐV đỏ"}
                onChange={v => props.onChange({ name: v })}
            />
            <div className="grid grid-cols-2 gap-[8px]">
                <DarkInput
                    label="Đội / CLB"
                    value={props.info?.team ?? ""}
                    placeholder="Đội"
                    onChange={v => props.onChange({ team: v || undefined })}
                />
                <DarkInput
                    label="Quốc gia"
                    value={props.info?.flag ?? ""}
                    placeholder="VIE"
                    onChange={v => props.onChange({ flag: v || undefined })}
                />
            </div>
        </div>
    )
}

// ── View mode: athlete row ────────────────────────────────────

function AthleteRow(props: {
    side: "blue" | "red"
    name: string
    team?: string
    roundWins: number
}) {
    const isBlue = props.side === "blue"
    return (
        <div className={`flex items-center gap-[10px] px-[16px] py-[12px]
            ${isBlue ? "bg-blue-950/40" : "bg-red-950/40"} rounded-[12px]`}>
            <div className={`flex-center w-[34px] h-[34px] rounded-full font-bold text-[30px] shrink-0
                ${isBlue ? "bg-blue-600 text-white" : "bg-red-600 text-white"}`}>
                {props.roundWins}
            </div>
            <div className="flex-1 min-w-0">
                <div className="text-[15px] font-semibold text-white truncate">{props.name}</div>
                {props.team && <div className="text-[12px] text-white/50">{props.team}</div>}
            </div>
            <Badge label={isBlue ? "XANH" : "ĐỎ"} color={isBlue ? "blue" : "red"} />
        </div>
    )
}

// ── Edit panel ────────────────────────────────────────────────

const CATEGORY_OPTIONS: { value: MatchCategory; label: string }[] = [
    { value: "preliminary", label: "Vòng loại" },
    { value: "quarterfinal", label: "Tứ kết" },
    { value: "semifinal", label: "Bán kết" },
    { value: "final", label: "Chung kết" },
    { value: "bronze", label: "Tranh HCĐ" },
    { value: "other", label: "Khác" },
]

const GENDER_OPTIONS = [
    { value: "male", label: "Nam" },
    { value: "female", label: "Nữ" },
    { value: "mixed", label: "Hỗn hợp" },
] as const

type EditDraft = Pick<MatchInfo, "matchNo" | "category" | "weightClass" | "gender" | "blue" | "red">

function EditPanel(props: {
    match: MatchInfo
    wins: { blue: number; red: number }
    onSave: (draft: EditDraft) => void
    onCancel: () => void
    onNewMatch: () => void
}) {
    const [draft, setDraft] = useState<EditDraft>({
        matchNo: props.match.matchNo,
        category: props.match.category,
        weightClass: props.match.weightClass,
        gender: props.match.gender,
        // blue: { ...props.match.blue },
        // red: { ...props.match.red },
    })

    return (
        <div className="flex flex-col gap-[14px]">

            {/* Header */}
            <div className="flex items-center justify-between">
                <span className="text-[15px] font-semibold text-white">
                    Chỉnh sửa trận {draft.matchNo}
                </span>
                <button
                    onClick={props.onCancel}
                    className="px-[15px] text-[13px] text-white/40 active:text-white/70 transition-colors"
                >
                    Huỷ
                </button>
            </div>

            {/* Thông tin chung */}
            <div className="flex flex-col gap-[8px] p-[12px] rounded-[12px]
                border border-white/10 bg-white/3">
                <span className="text-[11px] font-semibold text-white/40 uppercase tracking-wider">
                    Thông tin trận
                </span>
                <div className="grid grid-cols-2 gap-[8px]">
                    <DarkInput
                        label="Số trận"
                        value={String(draft.matchNo)}
                        placeholder="1"
                        onChange={v => {
                            const n = parseInt(v)
                            if (!isNaN(n) && n > 0) setDraft(d => ({ ...d, matchNo: n }))
                        }}
                    />
                    <DarkSelect
                        label="Loại trận"
                        value={String(draft.category)}
                        options={CATEGORY_OPTIONS}
                        onChange={v => setDraft(d => ({ ...d, category: v }))}
                    />
                </div>
                <div className="grid grid-cols-2 gap-[8px]">
                    <DarkInput
                        label="Hạng cân"
                        value={String(draft.weightClass)}
                        placeholder="Dưới 58KG"
                        onChange={v => setDraft(d => ({ ...d, weightClass: v }))}
                    />
                    <DarkSelect
                        label="Giới tính"
                        value={String(draft.gender)}
                        options={GENDER_OPTIONS as any}
                        onChange={v => setDraft(d => ({ ...d, gender: v as any }))}
                    />
                </div>
            </div>

            {/* VĐV Xanh */}
            <AthleteEditBlock
                side="blue"
                info={draft.blue}
                wins={props.wins.blue}
                onChange={patch => setDraft(d => ({ ...d, blue: { ...d.blue, ...patch } }))}
            />

            {/* VĐV Đỏ */}
            <AthleteEditBlock
                side="red"
                info={draft.red}
                wins={props.wins.red}
                onChange={patch => setDraft(d => ({ ...d, red: { ...d.red, ...patch } }))}
            />

            {/* Buttons */}
            <div className="flex flex-col gap-[8px]">
                <button
                    onClick={() => props.onSave(draft)}
                    disabled={!draft.blue?.name.trim() || !draft.red?.name.trim()}
                    className="w-full py-[12px] rounded-[12px] text-[14px] font-semibold
                        bg-white text-black active:scale-[0.97] transition-transform
                        disabled:opacity-30 disabled:cursor-not-allowed"
                >
                    Lưu thông tin
                </button>
                <button
                    onClick={props.onNewMatch}
                    className="w-full py-[11px] rounded-[12px] text-[14px] font-medium
                        bg-white/8 border border-white/10 text-white/60
                        active:bg-white/15 transition-colors"
                >
                    + Trận mới (reset thông tin)
                </button>
            </div>
        </div>
    )
}

// ── Search panel ──────────────────────────────────────────────

function MatchListItem(props: {
    match: MatchInfo; isActive: boolean; onClick: () => void
}) {
    const { match } = props
    const wins = countRoundWins(match)
    const dot: Record<typeof match.status, string> = {
        upcoming: "bg-white/30", active: "bg-green-400",
        finished: "bg-amber-400", confirmed: "bg-white/20",
    }
    return (
        <button onClick={props.onClick}
            className={`flex items-center w-full gap-[10px] px-[12px] py-[10px]
                rounded-[10px] text-left transition-colors
                ${props.isActive ? "bg-white/15 ring-1 ring-white/20" : "active:bg-white/10"}`}>
            <div className={`w-[8px] h-[8px] rounded-full shrink-0 ${dot[match.status]}`} />
            <span className="font-bold text-[1.5rem] text-white/60 w-[28px] shrink-0">
                {match.matchNo}
            </span>
            <div className="flex-1 min-w-0 flex flex-col gap-[1px]">
                <div className="flex items-center gap-[6px] min-w-0">
                    <span className="text-[13px] text-blue-300 truncate flex-1">{match.blue.name}</span>
                    <span className="text-[11px] text-white/30 shrink-0">vs</span>
                    <span className="text-[13px] text-red-300 truncate flex-1 text-right">{match.red.name}</span>
                </div>
                <span className="text-[11px] text-white/40">
                    {MATCH_CATEGORY_LABEL[match.category]} · {match.weightClass}
                </span>
            </div>
            {(wins.blue > 0 || wins.red > 0) && (
                <span className="text-[2rem] text-white/50 shrink-0">
                    {wins.blue}:{wins.red}
                </span>
            )}
            {props.isActive && <div className="w-[6px] h-[6px] rounded-full bg-amber-400 shrink-0" />}
        </button>
    )
}

function MatchSearchPanel(props: {
    matches: MatchInfo[]; currentMatchId: string
    onSelect: (idx: number) => void; onClose: () => void
}) {
    const [query, setQuery] = useState("")
    const filtered = props.matches.filter(m => {
        if (!query.trim()) return true
        const q = query.toLowerCase()
        return (
            m.matchNo.toString().includes(q) ||
            m.blue.name.toLowerCase().includes(q) ||
            m.red.name.toLowerCase().includes(q) ||
            (m.blue.team?.toLowerCase().includes(q) ?? false) ||
            (m.red.team?.toLowerCase().includes(q) ?? false) ||
            m.weightClass.toLowerCase().includes(q)
        )
    })
    return (
        <div className="flex flex-col gap-[10px]">
            <div className="flex items-center gap-[8px] px-[12px] py-[8px]
                bg-white/8 rounded-[10px] border border-white/10">
                <svg className="w-[14px] h-[14px] text-white/40 shrink-0" fill="none"
                    viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
                </svg>
                <input autoFocus type="text" value={query}
                    onChange={e => setQuery(e.target.value)}
                    placeholder="Tên VĐV, số trận, hạng cân..."
                    className="flex-1 bg-transparent text-[14px] text-white
                        placeholder:text-white/30 outline-none" />
                {query && (
                    <button onClick={() => setQuery("")}
                        className="text-white/40 text-[12px] active:text-white/70">✕</button>
                )}
            </div>
            <span className="text-[11px] text-white/30 px-[4px]">
                {filtered.length} / {props.matches.length} trận
            </span>
            <div className="flex flex-col gap-[2px] max-h-[320px] overflow-y-auto">
                {filtered.length === 0
                    ? <div className="flex justify-center items-center py-[20px] text-[13px] text-white/30">
                        Không tìm thấy trận nào
                    </div>
                    : filtered.map(m => (
                        <MatchListItem key={m.matchId} match={m}
                            isActive={m.matchId === props.currentMatchId}
                            onClick={() => {
                                props.onSelect(props.matches.findIndex(x => x.matchId === m.matchId))
                                props.onClose()
                            }} />
                    ))
                }
            </div>
        </div>
    )
}

// ── Main component ────────────────────────────────────────────

type ViewMode = "view" | "edit" | "search"

export default function MatchNav(props: {
    match: MatchInfo
    matches: MatchInfo[]
    totalMatches: number
    onPrev?: () => void
    onNext?: () => void
    onSelectMatch?: (idx: number) => void
    onMatchUpdate?: (patch: Partial<MatchInfo>) => void
    onNewMatch?: () => void
}) {
    const [mode, setMode] = useState<ViewMode>("view")
    const { match } = props
    const wins = countRoundWins(match)
    const genderLabel = match.gender === "male" ? "Nam"
        : match.gender === "female" ? "Nữ" : "Hỗn hợp"
    const hasPrev = match.matchNo > 1
    const hasNext = match.matchNo < props.totalMatches

    const statusLabel: Record<typeof match.status, string> = {
        upcoming: "Sắp diễn ra", active: "Đang thi đấu",
        finished: "Chờ xác nhận", confirmed: "Đã hoàn thành",
    }
    const statusColor: Record<typeof match.status, string> = {
        upcoming: "text-gray-400", active: "text-green-400",
        finished: "text-amber-400", confirmed: "text-gray-500",
    }

    // ── Search mode ──
    if (mode === "search") {
        return (
            <div className="flex flex-col gap-[10px]">
                <button onClick={() => setMode("view")}
                    className="flex items-center gap-[6px] text-[13px] text-white/50
                        active:text-white/80 transition-colors w-fit">
                    <ArrowI className="h-[10px] rotate-90" />
                    Quay lại trận {match.matchNo}
                </button>
                <MatchSearchPanel
                    matches={props.matches}
                    currentMatchId={match.matchId}
                    onSelect={props.onSelectMatch ?? (() => { })}
                    onClose={() => setMode("view")}
                />
            </div>
        )
    }

    // ── Edit mode ──
    if (mode === "edit") {
        return (
            <EditPanel
                match={match}
                wins={wins}
                onCancel={() => setMode("view")}
                onSave={(draft) => {
                    props.onMatchUpdate?.(draft)
                    setMode("view")
                }}
                onNewMatch={() => {
                    props.onNewMatch?.()
                    setMode("edit")
                }}
            />
        )
    }

    // ── View mode ──
    return (
        <div className="flex flex-col gap-[12px]">

            {/* Điều hướng trận */}
            <div className="flex items-center justify-between px-[4px]">
                <button
                    className={`flex items-center gap-[4px] px-[10px] py-[6px] rounded-[8px]
                        text-[13px] font-medium transition-colors
                        ${hasPrev ? "text-white/80 active:bg-white/10" : "text-white/20 pointer-events-none"}`}
                    onClick={props.onPrev}
                >
                    <ArrowI className={`h-[10px] rotate-90
                        ${hasPrev ? "text-white/80 active:bg-white/10" : "text-white/20 pointer-events-none"}`} />
                    Trước
                </button>

                <button onClick={() => setMode("search")}
                    className="flex flex-col items-center gap-[2px] px-[12px] py-[4px]
                        rounded-[10px] active:bg-white/10 transition-colors">
                    <div className="flex items-baseline gap-[4px]">
                        <span className="font-bold text-[30px] text-white leading-none">
                            Trận {match.matchNo}
                        </span>
                        <span className="text-[13px] text-white/30">/ {props.totalMatches}</span>
                    </div>
                    <span className={`text-[11px] font-medium ${statusColor[match.status]}`}>
                        {statusLabel[match.status]}
                    </span>
                </button>

                <button
                    className={`flex items-center gap-[4px] px-[10px] py-[6px] rounded-[8px]
                        text-[13px] font-medium transition-colors
                        ${hasNext ? "text-white/80 active:bg-white/10" : "text-white/20 pointer-events-none"}`}
                    onClick={props.onNext}
                >
                    Sau
                    <ArrowI className={`h-[10px] -rotate-90
                         ${hasNext ? "text-white/80 active:bg-white/10" : "text-white/20 pointer-events-none"}`} />
                </button>
            </div>

            {/* Search bar */}
            <button onClick={() => setMode("search")}
                className="flex items-center gap-[8px] px-[12px] py-[8px]
                    bg-white/5 rounded-[10px] border border-white/8
                    text-[13px] text-white/30 active:bg-white/10 transition-colors">
                <svg className="w-[13px] h-[13px] shrink-0" fill="none"
                    viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
                </svg>
                Tìm kiếm trận đấu...
            </button>

            {/* Badges + nút edit */}
            <div className="flex items-center gap-[8px] flex-wrap">
                <Badge label={MATCH_CATEGORY_LABEL[match.category]} color="gold" />
                <Badge label={match.weightClass} color="gray" />
                <Badge label={genderLabel} color="gray" />
                <button
                    onClick={() => setMode("edit")}
                    className="ml-auto flex items-center gap-[4px] px-[8px] py-[3px]
                        rounded-[8px] text-[12px] text-white/40 bg-white/8
                        active:bg-white/15 transition-colors"
                >
                    <EditI className="h-[11px]" />
                    Chỉnh sửa
                </button>
            </div>

            {/* VĐV */}
            <div className="flex flex-col gap-[8px]">
                <AthleteRow side="blue" name={match.blue.name}
                    team={match.blue.team} roundWins={wins.blue} />
                <AthleteRow side="red" name={match.red.name}
                    team={match.red.team} roundWins={wins.red} />
            </div>
        </div>
    )
}