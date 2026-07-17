export default function safeParse<T>(data: unknown, encoding: BufferEncoding = "utf8"): T | string {
    function tryParse(input: string) {
        try {
            return JSON.parse(input) as T
        } catch {
            return input
        }
    }

    if (Buffer.isBuffer(data)) {
        if (data.length > 1e6) throw new Error("Payload too large")
        return tryParse(data.toString(encoding))
    }

    if (typeof data === "string") return tryParse(data)

    if (data instanceof ArrayBuffer || data instanceof Uint8Array)
        return tryParse(Buffer.from(data as ArrayBuffer).toString(encoding))

    return data as T
}
