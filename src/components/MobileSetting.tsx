"use client"

import { ReactNode, useState } from "react"
import SheetConfigSection, { DEFAULT_SHEET_CONFIG, type SheetConfig, type ConnectionStatus } from "./SheetConfigSection"
import JudgeSettings, { DEFAULT_JUDGE_CONFIG, type JudgeConfig, type ConnectedJudge } from "./JudgeSettings"
import CourtConnection from "./CourtConnection"
import XSignI from "@/assets/x-sign.svg"
import Switch from "./Switch"
import ArrowI from "@/assets/arrow.svg"
import EditI from "@/assets/edit.svg"
import ChainI from "@/assets/chain.svg"
import TimePicker from "./TimePicker"
import Stepper from "./Stepper"

// =============================================
// BINDING SYSTEM
// =============================================

/**
 * Một giá trị có thể "liên kết" với Google Sheet hoặc override thủ công.
 *
 * - isLinked = true  → dùng sheetValue (hiển thị từ Sheet, không chỉnh được)
 * - isLinked = false → dùng localValue (người dùng tự chỉnh, bỏ qua Sheet)
 *
 * effectiveValue() trả về giá trị thực tế đang áp dụng.
 */
export type Binding<T> = {
    sheetValue: T | null   // null = Sheet chưa cung cấp mục này
    localValue: T
    isLinked: boolean
}

export function effectiveValue<T>(b: Binding<T>): T {
    return b.isLinked && b.sheetValue !== null ? b.sheetValue : b.localValue
}

/** Tạo binding mới — mặc định linked nếu Sheet có dữ liệu */
export function createBinding<T>(localDefault: T, sheetValue: T | null = null): Binding<T> {
    return {
        sheetValue,
        localValue: localDefault,
        isLinked: sheetValue !== null,
    }
}

/**
 * Người dùng chỉnh giá trị → tự động ngắt liên kết, lưu vào localValue.
 */
export function overrideBinding<T>(b: Binding<T>, newValue: T): Binding<T> {
    return { ...b, localValue: newValue, isLinked: false }
}

/**
 * Nhấn icon xích để toggle:
 * - Đang linked   → ngắt liên kết (giữ nguyên localValue)
 * - Đang unlinked → liên kết lại  (chỉ được nếu Sheet có dữ liệu)
 */
export function toggleLink<T>(b: Binding<T>): Binding<T> {
    if (b.isLinked) return { ...b, isLinked: false }
    if (b.sheetValue !== null) return { ...b, isLinked: true }
    return b // Sheet chưa có dữ liệu → không thể link
}

// =============================================
// TYPES
// =============================================

type TimePickerTarget = "roundMs" | "breakMs" | "kyeshiMs" | null

// =============================================
// HELPERS
// =============================================

function formatMs(ms: number): string {
    const totalSec = Math.floor(ms / 1000)
    const min = Math.floor(totalSec / 60)
    const sec = totalSec % 60
    if (min > 0 && sec > 0) return `${min} phút ${sec} giây`
    if (min > 0) return `${min} phút`
    return `${sec} giây`
}

// =============================================
// CHAIN BUTTON
// =============================================

/**
 * Nút xích thể hiện trạng thái binding:
 *
 * linked + sheetAvail   → xanh, xích liền  → nhấn để ngắt
 * unlinked + sheetAvail → xám,  xích đứt   → nhấn để liên kết lại
 * sheetUnavail          → mờ,   xích đứt   → disabled
 */
function ChainButton(props: {
    isLinked: boolean
    sheetAvailable: boolean
    onToggle: () => void
}) {
    const { isLinked, sheetAvailable } = props
    const linked = isLinked && sheetAvailable

    return (
        <button
            disabled={!sheetAvailable}
            onClick={props.onToggle}
            className={`
                flex-center w-[32px] h-[32px] rounded-[8px] shrink-0 transition-all
                ${linked
                    ? "bg-blue-50 text-blue-500 active:bg-blue-100"
                    : sheetAvailable
                        ? "bg-gray-100 text-gray-400 active:bg-gray-200"
                        : "bg-transparent text-gray-200 cursor-not-allowed"
                }
            `}
            title={
                !sheetAvailable ? "Sheet chưa cung cấp giá trị này"
                    : linked ? "Theo Sheet — nhấn để override thủ công"
                        : "Đang override — nhấn để liên kết lại Sheet"
            }
        >
            {linked
                ? <ChainI className="h-[14px]" />
                : <BrokenChainIcon className="h-[14px]" />
            }
        </button>
    )
}

/** SVG xích đứt — inline để không cần thêm asset */
function BrokenChainIcon(props: { className?: string }) {
    return (
        <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={props.className}
        >
            <path d="M9 17H7a5 5 0 0 1 0-10h2" />
            <path d="M15 7h2a5 5 0 0 1 0 10h-2" />
            <line x1="8" y1="12" x2="10" y2="12" />
            <line x1="14" y1="12" x2="16" y2="12" />
            <line x1="12" y1="4" x2="12" y2="7" strokeDasharray="2 2" />
            <line x1="12" y1="17" x2="12" y2="20" strokeDasharray="2 2" />
        </svg>
    )
}

// =============================================
// SETTING ROW VARIANTS
// =============================================

function NavRow(props: {
    label: string
    value?: ReactNode
    onClick?: () => void
    accent?: boolean
}) {
    return (
        <button
            className="flex items-center w-full min-h-[52px] px-[4px] gap-[12px]
                active:bg-white/5 rounded-[10px] transition-colors text-left"
            onClick={props.onClick}
        >
            <span className={`flex-1 text-[15px] font-medium
                ${props.accent ? "text-blue-400" : "text-white/80"}`}>
                {props.label}
            </span>
            {props.value !== undefined && (
                <span className="text-[15px] text-white/50 shrink-0">
                    {props.value}
                </span>
            )}
            <ArrowI className="h-[10px] text-[rgb(var(--color-text-muted))] shrink-0 -rotate-90" />
        </button>
    )
}

function ToggleRow(props: {
    label: string
    description?: string
    value: boolean
    onChange: (v: boolean) => void
}) {
    return (
        <div className="flex items-center w-full min-h-[52px] px-[4px] gap-[10px]">
            <div className="flex-1 flex flex-col gap-[2px]">
                <span className="text-[15px] font-medium text-white/80">
                    {props.label}
                </span>
                {props.description && (
                    <span className="text-[12px] text-[rgb(var(--color-text-secondary))]">
                        {props.description}
                    </span>
                )}
            </div>
            <Switch value={props.value} onValueChanged={props.onChange} className="shrink-0" />
        </div>
    )
}

/** Stepper +/- với binding */
function StepperRow(props: {
    label: string
    description?: string
    binding: Binding<number>
    onBindingChange: (b: Binding<number>) => void
    min?: number
    max?: number
    suffix?: string
}) {
    const min = props.min ?? 0
    const max = props.max ?? 99
    const value = effectiveValue(props.binding)
    const locked = props.binding.isLinked

    return (
        <div className="flex items-center w-full min-h-[52px] px-[4px] gap-[10px] text-black">
            <div className="flex-1 flex flex-col gap-[2px]">
                <span className="text-[15px] font-medium text-white/80">
                    {props.label}
                </span>
                {props.description && (
                    <span className="text-[12px] text-[rgb(var(--color-text-secondary))]">
                        {props.description}
                    </span>
                )}
            </div>
            <ChainButton
                isLinked={props.binding.isLinked}
                sheetAvailable={props.binding.sheetValue !== null}
                onToggle={() => props.onBindingChange(toggleLink(props.binding))}
            />
            <Stepper
                value={value}
                onChange={(v) => props.onBindingChange(overrideBinding(props.binding, v))}
                min={min}
                max={max}
                suffix={props.suffix}
                disabled={locked}
            />
        </div>
    )
}

/** Time row với binding */
function TimeRow(props: {
    label: string
    binding: Binding<number>
    onBindingChange: (b: Binding<number>) => void
    onOpenPicker: () => void

    value: number
}) {
    const isLinked = props.binding.isLinked
    // const valueMs = effectiveValue(props.binding)
    const valueMs = props.value

    return (
        <div className="flex items-center w-full min-h-[52px] px-[4px] gap-[10px]">
            <button
                className={`flex-1 flex items-center gap-[10px] text-left rounded-[10px] transition-colors
                    ${isLinked ? "cursor-default" : "active:bg-black/5"}`}
                onClick={() => { if (!isLinked) props.onOpenPicker() }}
                disabled={isLinked}
            >
                <span className="flex-1 text-[15px] font-medium text-white/80">
                    {props.label}
                </span>
                <div className="flex items-center gap-[6px] shrink-0">
                    <span className={`text-[15px] ${isLinked
                        ? "text-blue-500 font-medium"
                        : "text-[rgb(var(--color-text-secondary))]"}`}>
                        {formatMs(valueMs)}
                    </span>
                    {!isLinked && <EditI className="h-[14px] text-[rgb(var(--color-text-muted))]" />}
                </div>
            </button>
            <ChainButton
                isLinked={isLinked}
                sheetAvailable={props.binding.sheetValue !== null}
                onToggle={() => props.onBindingChange(toggleLink(props.binding))}
            />
        </div>
    )
}

function RowDivider() {
    return <div className="h-[1px] bg-white/8 mx-[4px]" />
}

function SettingGroup(props: { title: string; children: ReactNode }) {
    return (
        <div className="flex flex-col gap-[6px]">
            <span className="px-[4px] text-[12px] font-semibold uppercase tracking-wider
                text-white/40">
                {props.title}
            </span>
            <div className="flex flex-col px-[16px] bg-white/5 border border-white/8 rounded-[16px]">
                {props.children}
            </div>
        </div>
    )
}

// =============================================
// TIME PICKER MODAL
// =============================================

const TIME_PICKER_LABEL: Record<NonNullable<TimePickerTarget>, string> = {
    roundMs: "Thời gian hiệp đấu",
    breakMs: "Thời gian giải lao",
    kyeshiMs: "Thời gian Kye-shi",
}

function TimePickerModal(props: {
    target: TimePickerTarget
    initMs: number
    onClose: () => void
    onSave: (ms: number) => void
}) {
    if (!props.target) return null
    return (
        <div
            className="fixed inset-0 flex items-center justify-center z-[200]"
            style={{ backgroundColor: "var(--color-overlay)" }}
            onClick={(e) => { if (e.target === e.currentTarget) props.onClose() }}
        >
            <div className="relative w-[90vw] max-w-[400px] max-h-[380px] flex items-center justify-center">
                <TimePicker
                    title={TIME_PICKER_LABEL[props.target]}
                    initTimeMs={props.initMs}
                    onSubmit={(ms) => {
                        if (ms !== undefined) props.onSave(ms)
                        props.onClose()
                    }}
                />
            </div>
        </div>
    )
}

// =============================================
// MAIN COMPONENT
// =============================================

export default function MobileSetting(props: {
    onClose?: () => void
    courtId?: string
    judgesConnected?: number
    judgesMax?: number
    channelId?: number
    onNavigateToConnection?: () => void
    onNavigateToJudges?: () => void
    onNavigateToChannel?: () => void
    /**
     * Dữ liệu từ Google Sheet cho trận đấu hiện tại.
     * Mỗi field có thể undefined nếu Sheet không cung cấp mục đó.
     */
    sheetData?: {
        maxGamjeom?: number
        pointGap?: number
        pointGapEnabled?: boolean
        roundMs?: number
        breakMs?: number
        kyeshiMs?: number
    }

    roundMs: number
    onRoundMsChanged?: (ms: number) => void

    pointGapEnabled: boolean
    onApplyPTGChanged?: (value: boolean) => void
    pointGap: number
    onPointGapChanged?: (value: number) => void
}) {
    const s = props.sheetData

    // ----- BINDINGS -----
    const [maxGamjeom, setMaxGamjeom] = useState(() => createBinding(5, s?.maxGamjeom ?? null))
    const [pointGap, setPointGap] = useState(() => createBinding(12, s?.pointGap ?? null))
    const [pointGapEnabled, setPointGapEnabled] = useState(() => createBinding(true, s?.pointGapEnabled ?? null))
    const [roundMs, setRoundMs] = useState(() => createBinding(2 * 60 * 1000, s?.roundMs ?? null))
    const [breakMs, setBreakMs] = useState(() => createBinding(1 * 60 * 1000, s?.breakMs ?? null))
    const [kyeshiMs, setKyeshiMs] = useState(() => createBinding(1 * 60 * 1000, s?.kyeshiMs ?? null))

    // ----- SHEET STATE -----
    const [sheetConfig, setSheetConfig] = useState<SheetConfig>(DEFAULT_SHEET_CONFIG)
    const [sheetStatus, setSheetStatus] = useState<ConnectionStatus>("disconnected")
    const [sheetLoading, setSheetLoading] = useState(false)
    const [sheetError, setSheetError] = useState("")
    const [sheetTabs, setSheetTabs] = useState<string[]>([])
    const [sheetMatchCount, setSheetMatchCount] = useState(0)

    // ----- JUDGE CONFIG -----
    const [judgeConfig, setJudgeConfig] = useState<JudgeConfig>(DEFAULT_JUDGE_CONFIG)
    const [connectedJudges, setConnectedJudges] = useState<ConnectedJudge[]>([])

    // ----- SUB-PAGE NAV -----
    type SubPage = "main" | "court" | "judges"
    const [subPage, setSubPage] = useState<SubPage>("main")

    const [autoBreak, setAutoBreak] = useState(false)
    const [timePickerTarget, setTimePickerTarget] = useState<TimePickerTarget>(null)

    const hasSheetData = s !== undefined

    // Lấy initMs cho TimePicker dựa vào target đang mở
    function getPickerInitMs() {
        if (!timePickerTarget) return 0
        return props.roundMs
    }

    // Lưu kết quả TimePicker vào đúng binding
    function handleTimeSave(ms: number) {
        if (!timePickerTarget) return
        // const actions: Record<NonNullable<TimePickerTarget>, () => void> = {
        //     roundMs: () => setRoundMs(overrideBinding(roundMs, ms)),
        //     breakMs: () => setBreakMs(overrideBinding(breakMs, ms)),
        //     kyeshiMs: () => setKyeshiMs(overrideBinding(kyeshiMs, ms)),
        // }
        // actions[timePickerTarget]()

        props.onRoundMsChanged?.(ms)
    }

    const pointGapLocked = pointGap.isLinked
    const pointSwitchLocked = pointGapEnabled.isLinked
    const pointSwitchOff = !effectiveValue(pointGapEnabled)

    // ----- SUBPAGE RENDERS -----
    if (subPage === "court") {
        return (
            <div className="fixed inset-0 flex flex-col w-full h-full z-[100] overflow-y-auto
                px-[16px] py-[20px]" style={{ background: "#111" }}>
                <CourtConnection
                    onBack={() => setSubPage("main")}
                    courtId={props.courtId ?? "–"}
                    serverUrl=""
                    latencyMs={null}
                    isConnected={false}
                    judgesCount={props.judgesConnected ?? 0}
                    judgesMax={judgeConfig.maxJudges}
                />
            </div>
        )
    }

    if (subPage === "judges") {
        return (
            <div className="fixed inset-0 flex flex-col w-full h-full z-[100] overflow-y-auto
                px-[16px] py-[20px]" style={{ background: "#111" }}>
                <JudgeSettings
                    onBack={() => setSubPage("main")}
                    config={judgeConfig}
                    onConfigChange={patch => setJudgeConfig(prev => ({ ...prev, ...patch }))}
                    connectedJudges={connectedJudges}
                    onKickJudge={(socketId) => {
                        setConnectedJudges(prev => prev.filter(j => j.socketId !== socketId))
                        // TODO: emit socket event "judge:kick" khi nối logic thật
                    }}
                />
            </div>
        )
    }

    return (
        <>
            <div className="fixed inset-0 flex flex-col w-full h-full z-[100]"
                style={{ background: "#111" }}>

                {/* Header */}
                <div className="flex items-center justify-between px-[20px] py-[14px]
                    bg-white/5 border-b border-white/10">
                    <span className="text-[18px] font-semibold text-white">
                        Cài đặt
                    </span>
                    {props.onClose && (
                        <button
                            className="flex-center w-[32px] h-[32px] rounded-full
                                bg-white/10 active:bg-white/20 transition-colors"
                            onClick={props.onClose}
                        >
                            <XSignI className="h-[14px] text-white/60" />
                        </button>
                    )}
                </div>

                {/* Chú thích binding — hiện khi Sheet đã kết nối */}
                {hasSheetData && (
                    <div className="flex items-center gap-[20px] px-[20px] py-[8px]
                        bg-blue-950/40 border-b border-blue-900/50">
                        <div className="flex items-center gap-[6px]">
                            <ChainI className="h-[11px] text-blue-500 shrink-0" />
                            <span className="text-[11px] text-blue-300 font-medium">Theo Google Sheet</span>
                        </div>
                        <div className="flex items-center gap-[6px]">
                            <BrokenChainIcon className="h-[11px] text-gray-400 shrink-0" />
                            <span className="text-[11px] text-white/40">Override thủ công</span>
                        </div>
                    </div>
                )}

                {/* Body */}
                <div className="flex-1 overflow-y-auto px-[16px] py-[20px] flex flex-col gap-[24px] bg-[#111]">

                    {/* KẾT NỐI & THIẾT BỊ */}
                    <SettingGroup title="Kết nối & Thiết bị">
                        <NavRow
                            label="Mã bảng điểm"
                            value={
                                <span className="font-bold text-blue-600 text-[16px]">
                                    {props.courtId ?? "–"}
                                </span>
                            }
                            onClick={() => setSubPage("court")}
                            accent
                        />
                        <RowDivider />
                        <NavRow
                            label="Kết nối Giám định"
                            value={
                                <span>
                                    <span className={
                                        (props.judgesConnected ?? 0) >= judgeConfig.maxJudges
                                            ? "text-green-600 font-semibold"
                                            : "text-orange-500 font-semibold"
                                    }>
                                        {props.judgesConnected ?? 0}
                                    </span>
                                    <span className="text-[rgb(var(--color-text-muted))]">
                                        /{props.judgesMax ?? 3}
                                    </span>
                                </span>
                            }
                            onClick={() => setSubPage("judges")}
                        />
                        <RowDivider />
                        <NavRow
                            label="Kênh hiển thị"
                            value={props.channelId !== undefined ? `Kênh ${props.channelId}` : "Chưa chọn"}
                            onClick={props.onNavigateToChannel}
                        />
                    </SettingGroup>

                    {/* LUẬT THI ĐẤU */}
                    <SettingGroup title="Luật thi đấu">
                        <StepperRow
                            label="Gam-jeom tối đa"
                            description="VĐV đạt ngưỡng này → thắng hiệp"
                            binding={maxGamjeom}
                            onBindingChange={setMaxGamjeom}
                            min={1}
                            max={20}
                        />
                        <RowDivider />

                        {/*
                            Điểm cách biệt — 2 binding độc lập:
                            · pointGap        → giá trị số
                            · pointGapEnabled → trạng thái bật/tắt
                            Layout: [label] [chain số] [stepper] [chain switch] [switch]
                        */}
                        <div className="flex items-center w-full min-h-[58px] px-[4px] gap-[8px]">
                            <div className="flex-1 flex flex-col gap-[2px] min-w-0">
                                <span className="text-[15px] font-medium text-white/80">
                                    Điểm cách biệt
                                </span>
                                <span className="text-[12px] text-[rgb(var(--color-text-secondary))]">
                                    Dẫn trước số điểm này → thắng hiệp
                                </span>
                            </div>

                            {/* Binding cho giá trị số */}
                            <ChainButton
                                isLinked={pointGap.isLinked}
                                sheetAvailable={pointGap.sheetValue !== null}
                                onToggle={() => setPointGap(toggleLink(pointGap))}
                            />

                            {/* Stepper số — mờ nếu locked hoặc switch tắt */}
                            <Stepper
                                value={props.pointGap}
                                // value={effectiveValue(pointGap)}
                                // onChange={(v) => setPointGap(overrideBinding(pointGap, v))}
                                onChange={props.onPointGapChanged}
                                min={1}
                                max={99}
                                disabled={pointGapLocked || pointSwitchOff}
                            />

                            {/* Switch bật/tắt */}
                            <Switch
                                value={props.pointGapEnabled}
                                // value={effectiveValue(pointGapEnabled)}
                                onValueChanged={props.onApplyPTGChanged}
                                // onValueChanged={(v) => setPointGapEnabled(overrideBinding(pointGapEnabled, v))}
                                disable={pointSwitchLocked}
                                className="shrink-0"
                            />
                        </div>
                    </SettingGroup>

                    {/* THỜI GIAN */}
                    <SettingGroup title="Thời gian">
                        <TimeRow
                            label="Hiệp đấu"
                            binding={roundMs}
                            onBindingChange={setRoundMs}
                            onOpenPicker={() => setTimePickerTarget("roundMs")}
                            value={props.roundMs}
                        />
                        <RowDivider />
                        <TimeRow
                            label="Giải lao"
                            binding={breakMs}
                            onBindingChange={setBreakMs}
                            onOpenPicker={() => setTimePickerTarget("breakMs")}
                            value={props.roundMs}
                        />
                        <RowDivider />
                        <TimeRow
                            label="Điều trị (Kye-shi)"
                            binding={kyeshiMs}
                            onBindingChange={setKyeshiMs}
                            onOpenPicker={() => setTimePickerTarget("kyeshiMs")}
                            value={props.roundMs}
                        />
                    </SettingGroup>

                    {/* GOOGLE SHEETS */}
                    <SettingGroup title="Google Sheets">
                        <div className="py-[4px]">
                            <SheetConfigSection
                                config={sheetConfig}
                                status={sheetStatus}
                                loading={sheetLoading}
                                errorMsg={sheetError}
                                availableTabs={sheetTabs}
                                matchCount={sheetMatchCount}
                                onConfigChange={(updates) => setSheetConfig(prev => ({ ...prev, ...updates }))}
                                onTestConnection={() => {
                                    // TODO: gọi API khi nối logic
                                    setSheetStatus("connecting")
                                    setSheetLoading(true)
                                    setTimeout(() => {
                                        setSheetStatus("disconnected")
                                        setSheetLoading(false)
                                        setSheetError("Chưa kết nối service — logic sẽ được triển khai sau")
                                    }, 1200)
                                }}
                                onFetchMatches={() => { }}
                                onDisconnect={() => {
                                    setSheetStatus("disconnected")
                                    setSheetError("")
                                    setSheetTabs([])
                                    setSheetMatchCount(0)
                                }}
                            />
                        </div>
                    </SettingGroup>

                    {/* HỖ TRỢ */}
                    <SettingGroup title="Hỗ trợ">
                        <ToggleRow
                            label="Tự động giải lao"
                            description="Chuyển sang đếm ngược giải lao khi hết giờ hiệp đấu"
                            value={autoBreak}
                            onChange={setAutoBreak}
                        />
                    </SettingGroup>

                    <div className="h-[env(safe-area-inset-bottom,16px)]" />
                </div>
            </div>

            {/* TIME PICKER MODAL */}
            {timePickerTarget && (
                <TimePickerModal
                    target={timePickerTarget}
                    initMs={getPickerInitMs()}
                    onClose={() => setTimePickerTarget(null)}
                    onSave={handleTimeSave}
                />
            )}
        </>
    )
}