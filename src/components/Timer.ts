export function formatTime(ms: number) {
    if (ms > 10_000) {
        const totalSec = Math.ceil(ms / 1000)
        const m = Math.floor(totalSec / 60)
        const s = totalSec % 60
        return `${m}:${s.toString().padStart(2, "0")}`
    }

    const sec = Math.floor(ms / 1000)
    const centi = Math.floor((ms % 1000) / 10)
    return `${sec}.${centi.toString().padStart(2, "0")}`
}

