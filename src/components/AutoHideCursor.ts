import { useEffect, useRef } from "react"

/** 
 * Sử dụng để tạm ẩn con trỏ chuột trong ứng dụng.
 * @example
 * ```
 * function Component() {
 *      useAutoHideCursor(2000)
 *      // ...
 * }
 * ```
*/
export default function useAutoHideCursor(delay = 3000) {
    const timer = useRef<number | null>(null)

    useEffect(() => {
        function showCursor() {
            document.body.style.cursor = "default"

            if (timer.current) {
                clearTimeout(timer.current)
            }

            timer.current = window.setTimeout(() => {
                document.body.style.cursor = "none"
            }, delay)
        }

        window.addEventListener("mousemove", showCursor)

        // Khởi động timer ngay khi vào trang
        showCursor()

        return () => {
            window.removeEventListener("mousemove", showCursor)

            if (timer.current) {
                clearTimeout(timer.current)
            }

            document.body.style.cursor = "default"
        }
    }, [delay])
}