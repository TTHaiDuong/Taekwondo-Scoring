// ============================================================
// GOOGLE SHEET SCHEMA
// Mapping giữa tên cột trong Sheet và field nội bộ của app
// ============================================================

/** Các field nội bộ của app */
export type AppField =
    | "match_id"
    | "blue_athlete"
    | "red_athlete"
    | "blue_team"
    | "red_team"
    | "weight_class"
    | "gender"
    | "category"
    | "round_ms"
    | "break_ms"
    | "kyeshi_ms"
    | "max_gamjeom"
    | "point_gap"
    | "point_gap_enabled"

/** Một dòng mapping: field nội bộ ↔ tên cột trong Sheet */
export type ColumnMapping = {
    field: AppField
    column: string    // tên cột thực trong Sheet (do người dùng đặt)
    required: boolean
    description: string
}

/** Cấu hình kết nối Sheet */
export type SheetConfig = {
    spreadsheetId: string
    matchesTab: string   // tab chứa danh sách trận
    resultsTab: string   // tab ghi kết quả
    configTab: string   // tab chứa column mapping (_config)
}

export const DEFAULT_SHEET_CONFIG: SheetConfig = {
    spreadsheetId: "",
    matchesTab: "matches",
    resultsTab: "results",
    configTab: "_config",
}

/** Mapping mặc định — người dùng có thể override trong tab _config */
export const DEFAULT_COLUMN_MAPPINGS: ColumnMapping[] = [
    { field: "match_id", column: "match_id", required: true, description: "Số thứ tự trận" },
    { field: "blue_athlete", column: "blue_athlete", required: true, description: "Tên VĐV xanh" },
    { field: "red_athlete", column: "red_athlete", required: true, description: "Tên VĐV đỏ" },
    { field: "blue_team", column: "blue_team", required: false, description: "Đội xanh" },
    { field: "red_team", column: "red_team", required: false, description: "Đội đỏ" },
    { field: "weight_class", column: "weight_class", required: false, description: "Hạng cân" },
    { field: "gender", column: "gender", required: false, description: "Giới tính (male/female)" },
    { field: "category", column: "category", required: false, description: "Loại trận (final/semifinal...)" },
    { field: "round_ms", column: "round_ms", required: false, description: "Thời gian hiệp (ms)" },
    { field: "break_ms", column: "break_ms", required: false, description: "Thời gian giải lao (ms)" },
    { field: "kyeshi_ms", column: "kyeshi_ms", required: false, description: "Thời gian kye-shi (ms)" },
    { field: "max_gamjeom", column: "max_gamjeom", required: false, description: "Gam-jeom tối đa" },
    { field: "point_gap", column: "point_gap", required: false, description: "Điểm cách biệt" },
    { field: "point_gap_enabled", column: "point_gap_enabled", required: false, description: "Áp dụng cách biệt (true/false)" },
]

/** Validate một SheetConfig */
export function validateSheetConfig(config: SheetConfig): string[] {
    const errors: string[] = []
    if (!config.spreadsheetId.trim()) errors.push("Chưa nhập Spreadsheet ID")
    if (!config.matchesTab.trim()) errors.push("Chưa nhập tên tab trận đấu")
    if (!config.resultsTab.trim()) errors.push("Chưa nhập tên tab kết quả")
    return errors
}

/** Parse Spreadsheet ID từ URL hoặc ID thuần */
export function parseSpreadsheetId(input: string): string {
    const match = input.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/)
    return match ? match[1] : input.trim()
}