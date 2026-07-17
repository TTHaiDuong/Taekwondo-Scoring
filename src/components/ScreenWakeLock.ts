import { useEffect } from "react"

/**
 * Chống tự động tắt màn hình khi không có tương tác của người dùng.
 * @note Chỉ sử dụng được với `https://`
 * @example
 * ```
 * function Component() {
 *      useScreenWakeLock()
 *      // ...
 * }
 * ```
 */
export default function useScreenWakeLock() {
    useEffect(() => {
        let wakeLock: WakeLockSentinel | null = null

        async function requestWakeLock() {
            if (!("wakeLock" in navigator)) return

            try {
                wakeLock = await navigator.wakeLock.request("screen")
            } catch (e) {
                console.error(e)
            }
        }

        requestWakeLock()

        const handleVisibility = () => {
            if (document.visibilityState === "visible") {
                requestWakeLock()
            }
        }

        document.addEventListener("visibilitychange", handleVisibility)

        return () => {
            wakeLock?.release()
            document.removeEventListener("visibilitychange", handleVisibility)
        }
    }, [])
}