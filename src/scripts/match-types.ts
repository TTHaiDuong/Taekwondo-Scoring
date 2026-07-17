// ============================================================
// DOMAIN TYPES — Quản lý nghiệp vụ trận đấu Taekwondo
// ============================================================

// --- Mã kết quả ---
export const WIN_CODES = [
    { key: "PTG", description: "Thắng do cách biệt điểm" },
    { key: "WIN", description: "Thắng điểm chung cuộc" },
    { key: "GDP", description: "Thắng Golden Point" },
    { key: "SUP", description: "Thắng bằng ưu thế (Woo-se girok)" },
    { key: "RSC", description: "Trọng tài dừng trận" },
    { key: "KO", description: "Knock-out" },
    { key: "PUN", description: "Thắng do đối phương bị phạt" },
    { key: "WDR", description: "Đối phương bỏ cuộc" },
    { key: "DSQ", description: "Đối phương bị truất quyền" },
] as const

export type WinCode = typeof WIN_CODES[number]["key"]

export const SIDE = ["blue", "red"] as const
export type Side = typeof SIDE[number]

// --- Sự kiện ghi điểm (dùng cho lịch sử + undo) ---
// export type ScoreEvent = {
//     id: string        // uuid
//     timestamp: number        // Date.now()
//     side: Side
//     scoreType: number | "gj" // 1-6 hoặc gj
//     delta: 1 | -1        // +1 ghi, -1 undo
//     // judgeId?: string        // giám định nào bấm (nếu có)
//     remainingMs: number        // còn bao nhiêu giây lúc ghi
// }

// --- Breakdown điểm theo từng loại ---
export const POINT_TYPE = ["punch", "trunkKick", "headKick", "spinTrunk", "spinHead", "gamjeom", "eejeom"] as const
export type PointType = typeof POINT_TYPE[number]

export type ScoreBreakdown = {
    [k in PointType]: number
    // punch: number  // 1đ — đấm thân
    // trunkKick: number  // 2đ — đá thân
    // headKick: number  // 3đ — đá đầu
    // spinTrunk: number  // 4đ — đá xoay thân
    // spinHead: number  // 6đ — đá xoay đầu
    // gamjeom: number  // gam-jeom bị phạt (cộng điểm cho đối thủ)
}

export function emptyBreakdown(): ScoreBreakdown {
    return Object.fromEntries(
        POINT_TYPE.map(type => [type, 0])
    ) as ScoreBreakdown
}

export const POINT_MAP: { [k in PointType]: number } = {
    "punch": 1,
    "trunkKick": 2,
    "headKick": 3,
    "spinTrunk": 4,
    "spinHead": 6,
    "gamjeom": 1,
    "eejeom": 2,
}

export function calcTotalFromBreakdown(b: ScoreBreakdown, rivalGamjeom: number, rivalEejeom: number): number {
    return (
        b.punch * POINT_MAP["punch"] +
        b.trunkKick * POINT_MAP["trunkKick"] +
        b.headKick * POINT_MAP["headKick"] +
        b.spinTrunk * POINT_MAP["spinTrunk"] +
        b.spinHead * POINT_MAP["spinHead"] +
        rivalGamjeom * POINT_MAP["gamjeom"] +
        rivalEejeom * POINT_MAP["eejeom"]
    )
}

export type RoundNo = 1 | 2 | 3 | "golden"

// --- Kết quả một hiệp ---
export type RoundResult = {
    // roundNo: 1 | 2 | 3 | "golden"
    winner?: Side
    winCode?: WinCode
    // events: ScoreEvent[]
    // roundMs: number
    // Breakdown từng loại điểm (tuỳ chọn — có thể tính từ events)
    blueBreakdown: ScoreBreakdown
    redBreakdown: ScoreBreakdown
}

export function createEmptyRound(
    // roundNo: RoundResult["roundNo"], roundMs = 120_000
): RoundResult {
    return {
        // events: [],
        // roundMs,
        blueBreakdown: emptyBreakdown(),
        redBreakdown: emptyBreakdown(),
    }
}

// --- Thông tin VĐV ---
export type AthleteInfo = {
    name: string
    team?: string
    flag?: string
}

// --- Cấu hình riêng cho từng trận (có thể bind từ Sheet) ---
export type MatchConfig = {
    roundMs: number   // 120_000
    breakMs: number   // 60_000
    countdown: number   // 60_000
    maxGamjeom: number   // 5
    pointGap: number   // 12
    pointGapEnabled: boolean  // true
}

export const DEFAULT_MATCH_CONFIG: MatchConfig = {
    roundMs: 120_000,
    breakMs: 60_000,
    countdown: 60_000,
    maxGamjeom: 5,
    pointGap: 12,
    pointGapEnabled: true,
}

// --- Loại trận ---
export type MatchCategory =
    | "preliminary"   // Vòng loại
    | "quarterfinal"  // Tứ kết
    | "semifinal"     // Bán kết
    | "final"         // Chung kết
    | "bronze"        // Tranh HCĐ
    | "other"

export const MATCH_CATEGORY_LABEL: Record<MatchCategory, string> = {
    preliminary: "Vòng loại",
    quarterfinal: "Tứ kết",
    semifinal: "Bán kết",
    final: "Chung kết",
    bronze: "Tranh HCĐ",
    other: "Khác",
}

// --- Trạng thái hiệp đấu ---
export type RoundStatus =
    | "pending"    // Chưa bắt đầu
    | "running"    // Đang đấu
    | "paused"     // Tạm dừng (kye-shi hoặc giải lao)
    | "finished"   // Đã kết thúc, chờ công bố
    | "declared"   // Đã công bố kết quả

// --- Trạng thái trận đấu ---
export type MatchStatus =
    | "upcoming"   // Chưa đến lượt
    | "active"     // Đang diễn ra
    | "finished"   // Đã xong, chờ xác nhận
    | "confirmed"  // Đã xác nhận + push Sheet

// --- Thông tin đầy đủ một trận ---
export type MatchInfo = {
    matchId?: string
    matchNo?: number           // Số trận trong giải
    category?: MatchCategory
    weightClass?: string           // "Dưới 58KG"
    gender?: "male" | "female" | "mixed"
    blue?: AthleteInfo
    red?: AthleteInfo
    config: MatchConfig
    status?: MatchStatus

    // Kết quả (điền dần khi thi đấu)
    rounds: Map<RoundNo, RoundResult>
    currentRound?: RoundNo
    matchWinner?: Side
    matchWinCode?: WinCode

    // Metadata từ Sheet
    sheetRowIndex?: number        // dòng trong Sheet để ghi kết quả ngược lại
}

export type RoundWinner = { totalBlue: number, totalRed: number, winner: Side | null }

export function inferRoundWinner(blue: ScoreBreakdown, red: ScoreBreakdown): RoundWinner {
    const totalBlue = calcTotalFromBreakdown(blue, red.gamjeom, red.eejeom)
    const totalRed = calcTotalFromBreakdown(red, blue.gamjeom, blue.eejeom)

    const result: RoundWinner = { totalBlue, totalRed, winner: null }

    if (totalBlue > totalRed) result.winner = "blue"
    else if (totalRed > totalBlue) result.winner = "red"

    else if (blue.spinHead > red.spinHead) result.winner = "blue"
    else if (red.spinHead > blue.spinHead) result.winner = "red"

    else if (blue.spinTrunk > red.spinTrunk) result.winner = "blue"
    else if (red.spinTrunk > blue.spinTrunk) result.winner = "red"

    else if (blue.headKick > red.headKick) result.winner = "blue"
    else if (red.headKick > blue.headKick) result.winner = "red"

    else if (blue.gamjeom > red.gamjeom) result.winner = "blue"
    else if (red.gamjeom > blue.gamjeom) result.winner = "red"

    return result
}

// --- Tính toán tổng điểm trận (best-of-3) ---
export function countRoundWins(match: MatchInfo): { blue: number; red: number } {
    let blue = 0, red = 0
    match.rounds.forEach((r) => {
        if (r?.winner === "blue") blue++
        else if (r?.winner === "red") red++
    })
    // for (const r of Object.values(match.rounds)) {
    //     if (r?.winner === "blue") blue++
    //     else if (r?.winner === "red") red++
    // }
    return { blue, red }
}

export function inferMatchWinner(match: MatchInfo): Side | null {
    const { blue, red } = countRoundWins(match)
    if (blue >= 2) return "blue"
    if (red >= 2) return "red"
    return null
}

export type Role = "operator" | "judge"

export type ScoreEvent = {
    blueScore: number
    redScore: number
    remainingMs?: number
    timestamp: number
    side: Side
    pointType: PointType
    action: "increase" | "decrease" | "set"
    scoreChangeBy: Role
    judgeNumber?: (number | undefined)[]
}