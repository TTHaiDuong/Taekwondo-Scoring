import { useState, useEffect } from "react"

export function useIsMobile() {
    const [isTouch, setIsTouch] = useState<boolean>(false)

    useEffect(() => {
        if (typeof window === "undefined") return

        setIsTouch(
            window.matchMedia("(hover: none)").matches
        )
    }, [])

    return isTouch
}

export function useFullScreen() {
    const [isFullScreen, setIsFullScreen] = useState<boolean>(false)
    const [isSupported, setIsSupported] = useState<boolean>(false)

    useEffect(() => {
        setIsSupported(!!document.documentElement.requestFullscreen)
    }, [])

    useEffect(() => {
        function handleFullscreenChange() {
            setIsFullScreen(!!document.fullscreenElement)
        }

        document.addEventListener("fullscreenchange", handleFullscreenChange)
        return () => { document.removeEventListener("fullscreenchange", handleFullscreenChange) }
    }, [])

    async function fullScreenRequest(callback?: (msg: string[]) => void) {
        const msg: string[] = []
        const el = document.documentElement

        if (el.requestFullscreen) {
            await el.requestFullscreen()
        } else if ((el as any).webkitRequestFullscreen) {
            (el as any).webkitRequestFullscreen()
        } else {
            msg.push("API toàn màn hình không được hỗ trợ trên trình duyệt này.")
        }

        if ("orientation" in screen && "lock" in screen.orientation) {
            try {
                await (screen.orientation as any).lock("landscape")
            }
            catch (err) {
                console.warn("Không thể khóa xoay màn hình:", err)
                msg.push("Không thể khóa xoay màn hình.")
            }
        } else {
            msg.push("Thiết bị hoặc trình duyệt không hỗ trợ Orientation Lock API.")
        }

        setIsFullScreen(true)

        callback?.(msg)
        return msg
    }

    return {
        isFullScreen,
        fullScreenRequest,
        isFullScreenSupported: isSupported
    }
}