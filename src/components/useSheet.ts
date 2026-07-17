"use client"

// ============================================================
// useSheet — hook quản lý toàn bộ kết nối Google Sheets
// Dùng ở MobileSetting và QuickAccess
// ============================================================

import { useCallback, useEffect, useState } from "react"
import type { SheetConfig } from "@/scripts/sheet-schema"
import { DEFAULT_SHEET_CONFIG, parseSpreadsheetId, validateSheetConfig } from "@/scripts/sheet-schema"
import type { MatchInfo } from "@/scripts/match-types"

// ── Storage key ──────────────────────────────────────────────
const STORAGE_KEY = "scoreboard_sheet_config"

function loadConfig(): SheetConfig {
    if (typeof window === "undefined") return DEFAULT_SHEET_CONFIG
    try {
        const raw = localStorage.getItem(STORAGE_KEY)
        if (raw) return { ...DEFAULT_SHEET_CONFIG, ...JSON.parse(raw) }
    } catch { }
    return DEFAULT_SHEET_CONFIG
}

function saveConfig(cfg: SheetConfig) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg)) }
    catch { }
}

// ── Types ─────────────────────────────────────────────────────

export type ConnectionStatus =
    | "disconnected"   // Chưa cấu hình
    | "connecting"     // Đang test
    | "connected"      // Kết nối thành công
    | "error"          // Lỗi

export type SheetState = {
    config: SheetConfig
    status: ConnectionStatus
    errorMsg: string
    availableTabs: string[]
    matches: MatchInfo[]
    loading: boolean
}

// ── Hook ──────────────────────────────────────────────────────

export function useSheet() {
    const [state, setState] = useState<SheetState>({
        config: loadConfig(),
        status: "disconnected",
        errorMsg: "",
        availableTabs: [],
        matches: [],
        loading: false,
    })

    // Helper để patch state
    const patch = useCallback((p: Partial<SheetState>) => {
        setState(prev => ({ ...prev, ...p }))
    }, [])

    // Persist config khi thay đổi
    const updateConfig = useCallback((updates: Partial<SheetConfig>) => {
        setState(prev => {
            const next = { ...prev.config, ...updates }
            // Auto-parse spreadsheet ID nếu người dùng paste URL
            if (updates.spreadsheetId) {
                next.spreadsheetId = parseSpreadsheetId(updates.spreadsheetId)
            }
            saveConfig(next)
            return { ...prev, config: next, status: "disconnected", errorMsg: "" }
        })
    }, [])

    // ── API call helper ──────────────────────────────────────
    async function callApi(action: string, extra: object = {}) {
        const res = await fetch("/api/sheet", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action, config: state.config, ...extra }),
        })
        const data = await res.json()
        if (!res.ok || data.error) throw new Error(data.error ?? "Lỗi không xác định")
        return data
    }

    // ── Test connection ──────────────────────────────────────
    const testConnection = useCallback(async () => {
        const errors = validateSheetConfig(state.config)
        if (errors.length > 0) {
            patch({ status: "error", errorMsg: errors.join(", ") })
            return
        }

        patch({ status: "connecting", errorMsg: "", loading: true })
        try {
            const data = await callApi("test")
            if (data.ok) {
                patch({
                    status: "connected",
                    availableTabs: data.tabs ?? [],
                    errorMsg: "",
                    loading: false,
                })
            } else {
                patch({ status: "error", errorMsg: data.error ?? "Lỗi kết nối", loading: false })
            }
        } catch (e: any) {
            patch({ status: "error", errorMsg: e.message, loading: false })
        }
    }, [state.config])

    // ── Fetch matches ────────────────────────────────────────
    const fetchMatches = useCallback(async () => {
        if (state.status !== "connected") return
        patch({ loading: true })
        try {
            const data = await callApi("fetch_matches")
            patch({ matches: data.matches ?? [], loading: false })
        } catch (e: any) {
            patch({ errorMsg: e.message, loading: false })
        }
    }, [state.config, state.status])

    // ── Write result ─────────────────────────────────────────
    const writeResult = useCallback(async (match: MatchInfo) => {
        if (state.status !== "connected") return
        await callApi("write_result", { match })
    }, [state.config, state.status])

    // ── Auto-fetch khi connected ─────────────────────────────
    useEffect(() => {
        if (state.status === "connected" && state.matches.length === 0) {
            fetchMatches()
        }
    }, [state.status])

    return {
        ...state,
        isConnected: state.status === "connected",
        updateConfig,
        testConnection,
        fetchMatches,
        writeResult,
    }
}