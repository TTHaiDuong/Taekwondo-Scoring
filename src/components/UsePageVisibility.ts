import { useEffect, useState } from "react"

// ── Hook: phát hiện trang mất focus/bị ẩn ──────────────────────
export default function usePageVisibility() {
    const [isActive, setIsActive] = useState(true)

    useEffect(() => {
        function updateActive() {
            // Chỉ coi là "active" khi tab đang hiện VÀ window đang có focus
            setIsActive(document.visibilityState === "visible" && document.hasFocus())
        }

        updateActive()

        document.addEventListener("visibilitychange", updateActive)
        window.addEventListener("focus", updateActive)
        window.addEventListener("blur", updateActive)

        return () => {
            document.removeEventListener("visibilitychange", updateActive)
            window.removeEventListener("focus", updateActive)
            window.removeEventListener("blur", updateActive)
        }
    }, [])

    return isActive
}