export function formatTime(ms: number, format: string): string {
    const totalSecond = Math.floor(ms / 1000)
    const hours = Math.floor(totalSecond / 3600)
    const minutes = Math.floor((totalSecond % 3600) / 60)
    const seconds = totalSecond % 60
    const centiseconds = Math.floor(ms / 10) % 100
    const miliseconds = ms % 1000

    const parts: Record<string, string> = {
        HH: hours.toString().padStart(2, "0"),
        H: hours.toString(),
        MM: minutes.toString().padStart(2, "0"),
        M: minutes.toString(),
        SS: seconds.toString().padStart(2, "0"),
        S: seconds.toString(),
        cc: centiseconds.toString().padStart(2, "0"),
        c: centiseconds.toString(),
        mm: miliseconds.toString().padStart(2, "0"),
        m: seconds.toString(),
    }

    let result = format
    Object.keys(parts)
        .sort((a, b) => b.length - a.length)
        .forEach((key: string) => {
            result = result.replace(new RegExp(key, "g"), parts[key])
        })

    return result
}