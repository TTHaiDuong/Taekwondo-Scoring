// ============================================================
// DOMAIN TYPES — Quản lý nghiệp vụ trận đấu Taekwondo
// ============================================================

// --- Mã kết quả ---
export const WIN_CODES = ["PTG", "WIN", "GDP", "SUP", "RSC", "KO", "PUN", "WDR", "DSQ"] as const
export type WinCode = typeof WIN_CODES[number]
export const WIN_CODES_DESCRIPTION: Readonly<Record<WinCode, string>> = {
    "PTG": "Thắng do cách biệt điểm",
    "WIN": "Thắng điểm chung cuộc",
    "GDP": "Thắng Golden Point",
    "SUP": "Thắng bằng ưu thế (Woo-se girok)",
    "RSC": "Trọng tài dừng trận",
    "KO": "Knock-out",
    "PUN": "Thắng do đối phương bị phạt",
    "WDR": "Đối phương bỏ cuộc",
    "DSQ": "Đối phương bị truất quyền",
}

export const SIDE = ["blue", "red"] as const
export type Side = typeof SIDE[number]

// --- Breakdown điểm theo từng loại ---
export const POINT_TYPE = ["punch", "trunkKick", "headKick", "spinTrunk", "spinHead", "eeljeom", "eejeom"] as const
export type PointType = typeof POINT_TYPE[number]
export type ScoreBreakdown = {
    [k in PointType]: number
    // punch: number  // 1đ — đấm thân
    // trunkKick: number  // 2đ — đá thân
    // headKick: number  // 3đ — đá đầu
    // spinTrunk: number  // 4đ — đá xoay thân
    // spinHead: number  // 6đ — đá xoay đầu
    // eeljeom: number  // gam-jeom bị phạt (cộng 1 điểm cho đối thủ)
    // eejeom: number  // gam-jeom bị phạt (cộng 2 điểm cho đối thủ)
}
export function emptyBreakdown(): ScoreBreakdown {
    return Object.fromEntries(
        POINT_TYPE.map(type => [type, 0])
    ) as ScoreBreakdown
}

export const POINT_MAP: Readonly<{ [k in PointType]: number }> = {
    "punch": 1,
    "trunkKick": 2,
    "headKick": 3,
    "spinTrunk": 4,
    "spinHead": 6,
    "eeljeom": 1,
    "eejeom": 2,
}
export function calcTotalFromBreakdown(owner: ScoreBreakdown, rivalEeljeom: number, rivalEejeom: number): number {
    return (
        owner.punch * POINT_MAP["punch"] +
        owner.trunkKick * POINT_MAP["trunkKick"] +
        owner.headKick * POINT_MAP["headKick"] +
        owner.spinTrunk * POINT_MAP["spinTrunk"] +
        owner.spinHead * POINT_MAP["spinHead"] +
        rivalEeljeom * POINT_MAP["eeljeom"] +
        rivalEejeom * POINT_MAP["eejeom"]
    )
}

// --- Kết quả một hiệp ---
export type RoundNo = 1 | 2 | 3 | "golden"
export type Round = {
    roundNo: RoundNo
    winner?: Side
    winCode?: WinCode
    blueBreakdown: ScoreBreakdown
    redBreakdown: ScoreBreakdown
}
export function createEmptyRound(roundNo: RoundNo): Round {
    return {
        roundNo,
        blueBreakdown: emptyBreakdown(),
        redBreakdown: emptyBreakdown(),
    }
}

export type ScoreEvent = {
    blueScore: number
    redScore: number
    blueGamjeom: number
    redGamjeom: number
    remainingMs?: number
    timestamp: number
    side: Side
    pointType: PointType
    action: "increase" | "decrease" | "set"
    scoreChangedBy: "operator" | "judge"
    voters?: number[] // [1, 2, 3]
    leadingSide: Side | null
}

// --- Thông tin VĐV ---
export type AthleteInfo = {
    name: string
    team?: string
    flag?: string
}

// --- Cấu hình riêng cho từng trận (có thể bind từ Sheet) ---
export type MatchConfig = {
    roundMs: number
    breakMs: number
    countdown: number
    maxGamjeom: number
    pointGap: number
    pointGapEnabled: boolean
}

export const DEFAULT_MATCH_CONFIG: Readonly<MatchConfig> = {
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
    blueInfo?: AthleteInfo
    redInfo?: AthleteInfo
    status: MatchStatus
    config: MatchConfig

    // Kết quả (điền dần khi thi đấu)
    rounds: Map<RoundNo, Round>
    currentRound?: RoundNo
    matchWinner?: Side
    matchWinCode?: WinCode

    // Metadata từ Sheet
    // sheetRowIndex?: number        // dòng trong Sheet để ghi kết quả ngược lại
}

export type ScoreLeader = { totalBlue: number, totalRed: number, leader: Side | null }
export function inferScoreLeader(blue: ScoreBreakdown, red: ScoreBreakdown): ScoreLeader {
    const totalBlue = calcTotalFromBreakdown(blue, red.eeljeom, red.eejeom)
    const totalRed = calcTotalFromBreakdown(red, blue.eeljeom, blue.eejeom)

    const tieBreakers: Array<[number, number]> = [
        [totalBlue, totalRed],
        [blue.spinHead, red.spinHead],
        [blue.spinTrunk, red.spinTrunk],
        [blue.headKick, red.headKick],
        [
            blue.eeljeom + blue.eejeom * POINT_MAP.eejeom,
            red.eeljeom + red.eejeom * POINT_MAP.eejeom
        ]
    ]

    for (const [blueValue, redValue] of tieBreakers) {
        if (blueValue > redValue)
            return { totalBlue, totalRed, leader: "blue" }

        if (redValue > blueValue)
            return { totalBlue, totalRed, leader: "red" }
    }

    return { totalBlue, totalRed, leader: null }
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