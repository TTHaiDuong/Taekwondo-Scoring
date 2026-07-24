import {
    MatchInfo,
    DEFAULT_MATCH_CONFIG,
    createEmptyRound,
    ScoreEvent,
} from "./match-types"

// ============================================================
// MOCK DATA — Dữ liệu giả để phát triển UI
// Thay bằng Google Sheets khi đã setup xong
// ============================================================

function mockEvent(
    side: "blue" | "red",
    scoreType: number | "gj",
    remainingMs: number,
): ScoreEvent {
    return {
        id: Math.random().toString(36).slice(2),
        timestamp: Date.now(),
        side,
        scoreType,
        delta: 1,
        remainingMs,
    }
}

export const MOCK_MATCHES: MatchInfo[] = [
    {
        matchId: "m001",
        matchNo: 1,
        category: "preliminary",
        weightClass: "Dưới 54KG",
        gender: "male",
        blueInfo: { name: "Nguyễn Huỳnh Minh Nhật", team: "Cần Đước" },
        redInfo: { name: "Nguyễn Khắc Duy", team: "Cần Đước" },
        config: { ...DEFAULT_MATCH_CONFIG, roundMs: 90_000 },
        status: "confirmed",
        rounds: {
            1: {
                roundNo: 1,
                blueScore: 12,
                redScore: 8,
                winner: "blue",
                winCode: "PTG",
                durationMs: 90_000,
                events: [
                    mockEvent("blue", 2, 75_000),
                    mockEvent("blue", 3, 60_000),
                    mockEvent("red", 1, 55_000),
                    mockEvent("blue", 2, 40_000),
                    mockEvent("red", 2, 30_000),
                    mockEvent("blue", 1, 15_000),
                ],
            },
            2: {
                roundNo: 2,
                blueScore: 6,
                redScore: 9,
                winner: "red",
                winCode: "WIN",
                durationMs: 90_000,
                events: [
                    mockEvent("red", 3, 80_000),
                    mockEvent("blue", 1, 65_000),
                    mockEvent("red", 2, 50_000),
                    mockEvent("red", 1, 35_000),
                ],
            },
            3: {
                roundNo: 3,
                blueScore: 14,
                redScore: 10,
                winner: "blue",
                winCode: "PTG",
                durationMs: 90_000,
                events: [
                    mockEvent("blue", 3, 85_000),
                    mockEvent("red", 2, 70_000),
                    mockEvent("blue", 2, 55_000),
                    mockEvent("blue", 3, 40_000),
                    mockEvent("red", 1, 25_000),
                    mockEvent("blue", 1, 10_000),
                ],
            },
        },
        matchWinner: "blue",
        matchWinCode: "WIN",
        sheetRowIndex: 2,
    },

    {
        matchId: "m002",
        matchNo: 2,
        category: "preliminary",
        weightClass: "Dưới 58KG",
        gender: "male",
        blueInfo: { name: "Lê Văn Tuấn", team: "Đà Nẵng" },
        redInfo: { name: "Phạm Quốc Bảo", team: "Cần Thơ" },
        config: DEFAULT_MATCH_CONFIG,
        status: "active",
        rounds: {
            1: {
                roundNo: 1,
                blueScore: 8,
                redScore: 11,
                winner: "red",
                winCode: "WIN",
                durationMs: 120_000,
                events: [
                    mockEvent("red", 2, 100_000),
                    mockEvent("blue", 1, 80_000),
                    mockEvent("red", 3, 60_000),
                    mockEvent("blue", 2, 40_000),
                    mockEvent("red", 1, 20_000),
                ],
            },
            2: {
                roundNo: 2,
                blueScore: 5,
                redScore: 3,
                durationMs: 120_000,
                events: [
                    mockEvent("blue", 2, 90_000),
                    mockEvent("red", 1, 70_000),
                    mockEvent("blue", 1, 50_000),
                ],
            },
        },
        sheetRowIndex: 3,
    },

    {
        matchId: "m003",
        matchNo: 3,
        category: "semifinal",
        weightClass: "Dưới 63KG",
        gender: "female",
        blueInfo: { name: "Nguyễn Thị Lan", team: "Bình Dương" },
        redInfo: { name: "Võ Thị Thu Hương", team: "Đồng Nai" },
        config: { ...DEFAULT_MATCH_CONFIG, pointGapEnabled: false },
        status: "upcoming",
        rounds: {},
        sheetRowIndex: 4,
    },

    {
        matchId: "m004",
        matchNo: 4,
        category: "final",
        weightClass: "Dưới 68KG",
        gender: "male",
        blueInfo: { name: "Trần Đình Phúc", team: "Hà Nội" },
        redInfo: { name: "Nguyễn Văn Thịnh", team: "TP.HCM" },
        config: { ...DEFAULT_MATCH_CONFIG, pointGapEnabled: false, roundMs: 150_000 },
        status: "upcoming",
        rounds: {},
        sheetRowIndex: 5,
    },
]

// Index để lookup nhanh
export function getMatchById(id: string): MatchInfo | undefined {
    return MOCK_MATCHES.find(m => m.matchId === id)
}

export function getMatchByNo(no: number): MatchInfo | undefined {
    return MOCK_MATCHES.find(m => m.matchNo === no)
}