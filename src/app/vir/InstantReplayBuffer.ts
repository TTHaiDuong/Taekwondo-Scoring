"use client"

// ============================================================
// INSTANT REPLAY BUFFER (client-side ring buffer)
//
// Ghi đệm liên tục NGAY TRÊN TRÌNH DUYỆT của người xem (trọng tài),
// trực tiếp từ MediaStreamTrack đang nhận qua LiveKit — KHÔNG đi qua
// server, KHÔNG qua FFmpeg/HLS. Mục tiêu: khi trọng tài bấm "tua lại",
// video xuất hiện gần như ngay lập tức (độ trễ chỉ còn đúng bằng độ trễ
// WebRTC live vốn có, thường <1s) thay vì phải chờ vài giây để server
// đóng gói xong segment HLS.
//
// Đánh đổi: chỉ tua lại được trong khoảng thời gian gần nhất (vài chục
// giây tới vài phút, tuỳ RAM/CPU máy trọng tài) và không có sẵn client
// video độc lập nhiều rendition — nhưng bù lại độ trễ thấp nhất có thể.
// Việc lưu clip vĩnh viễn / tua xa hơn vẫn nên dùng kênh HLS ("kho lưu
// trữ") đã có.
// ============================================================

export type BufferStats = { bufferedSec: number; recording: boolean }

const DEFAULT_TIMESLICE_MS = 1000

function pickMimeType(): string {
    const candidates = [
        "video/webm;codecs=vp9,opus",
        "video/webm;codecs=vp8,opus",
        "video/webm;codecs=h264,opus",
        "video/webm",
    ]
    for (const c of candidates) {
        if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(c)) return c
    }
    return "video/webm"
}

type Chunk = { blob: Blob; at: number }

export class InstantReplayBuffer {
    private recorder: MediaRecorder | null = null
    // Chunk ĐẦU TIÊN chứa EBML header của WebM (thông tin track/codec) —
    // PHẢI giữ lại vĩnh viễn suốt phiên ghi. Thiếu nó thì mọi Blob ghép
    // từ các chunk sau sẽ không decode được, dù bản thân các chunk đó
    // vẫn còn nguyên dữ liệu hình ảnh.
    private headerChunk: Chunk | null = null
    private chunks: Chunk[] = []
    private readonly maxDurationMs: number
    private readonly mimeType: string
    private readonly timesliceMs: number
    private readonly videoBitsPerSecond?: number
    private readonly stream: MediaStream
    private readonly onStatsChange?: (s: BufferStats) => void

    constructor(
        stream: MediaStream,
        opts?: {
            /** Số giây tối đa giữ trong bộ đệm (mặc định 90s) */
            maxDurationSec?: number
            mimeType?: string
            timesliceMs?: number
            videoBitsPerSecond?: number
            onStatsChange?: (s: BufferStats) => void
        }
    ) {
        this.stream = stream
        this.maxDurationMs = (opts?.maxDurationSec ?? 90) * 1000
        this.mimeType = opts?.mimeType ?? pickMimeType()
        this.timesliceMs = opts?.timesliceMs ?? DEFAULT_TIMESLICE_MS
        this.videoBitsPerSecond = opts?.videoBitsPerSecond
        this.onStatsChange = opts?.onStatsChange
    }

    start() {
        if (this.recorder) return
        if (typeof MediaRecorder === "undefined") {
            console.warn("[InstantReplay] MediaRecorder không khả dụng trên trình duyệt này")
            return
        }
        try {
            this.recorder = new MediaRecorder(this.stream, {
                mimeType: this.mimeType,
                ...(this.videoBitsPerSecond ? { videoBitsPerSecond: this.videoBitsPerSecond } : {}),
            })
        } catch (err) {
            console.error("[InstantReplay] Không tạo được MediaRecorder:", err)
            return
        }

        this.recorder.ondataavailable = (e: BlobEvent) => {
            if (e.data.size === 0) return
            const now = Date.now()
            if (!this.headerChunk) {
                this.headerChunk = { blob: e.data, at: now }
                this.emitStats()
                return
            }
            this.chunks.push({ blob: e.data, at: now })
            this.evictOld(now)
            this.emitStats()
        }

        this.recorder.onerror = (e) => {
            console.error("[InstantReplay] MediaRecorder lỗi:", e)
        }

        this.recorder.start(this.timesliceMs)
        this.emitStats()
    }

    private evictOld(now: number) {
        const cutoff = now - this.maxDurationMs
        while (this.chunks.length > 0 && this.chunks[0].at < cutoff) {
            this.chunks.shift()
        }
    }

    private emitStats() {
        this.onStatsChange?.(this.getStats())
    }

    getStats(): BufferStats {
        const bufferedSec = this.chunks.length ? (Date.now() - this.chunks[0].at) / 1000 : 0
        return { bufferedSec, recording: !!this.recorder && this.recorder.state === "recording" }
    }

    /**
     * Dựng 1 Blob phát lại được từ toàn bộ dữ liệu đang đệm (header + các
     * chunk còn nằm trong cửa sổ maxDurationSec). Gọi lại hàm này mỗi lần
     * người dùng bấm "tua lại" để luôn lấy được dữ liệu MỚI NHẤT — Blob là
     * một bản snapshot tại thời điểm gọi, không tự cập nhật sau đó.
     */
    buildPlayableBlob(): Blob | null {
        if (!this.headerChunk || this.chunks.length === 0) return null
        return new Blob([this.headerChunk.blob, ...this.chunks.map((c) => c.blob)], {
            type: this.mimeType,
        })
    }

    /** Có đủ dữ liệu để phát lại chưa (ít nhất ~2s) */
    hasEnoughData(): boolean {
        return this.getStats().bufferedSec >= 2
    }

    stop() {
        try {
            if (this.recorder && this.recorder.state !== "inactive") this.recorder.stop()
        } catch {
            /* ignore */
        }
        this.recorder = null
        this.headerChunk = null
        this.chunks = []
    }
}