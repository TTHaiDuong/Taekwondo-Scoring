import { useEffect, useState } from "react";

type VideoRect = { left: number; top: number; width: number; height: number }

export default function useVideoContentRect(
    containerRef: React.RefObject<HTMLElement | null>,
    videoRef: React.RefObject<HTMLVideoElement | null>
): VideoRect | null {
    const [rect, setRect] = useState<VideoRect | null>(null)

    useEffect(() => {
        console.log(rect)
    }, [rect])

    useEffect(() => {
        const container = containerRef.current
        const video = videoRef.current
        if (!container || !video) return

        function recompute() {
            const cw = container!.clientWidth
            const ch = container!.clientHeight
            const vw = video!.videoWidth
            const vh = video!.videoHeight
            if (!cw || !ch || !vw || !vh) return

            // Tái hiện chính xác thuật toán "object-fit: contain": video được
            // scale để vừa khít container mà KHÔNG cắt hình, phần dư ra 2
            // bên (hoặc trên/dưới) là letterbox — overlay phải bám theo
            // đúng góc trên-trái của vùng ẢNH THẬT, không phải góc container.
            const containerRatio = cw / ch
            const videoRatio = vw / vh

            let width: number, height: number
            if (videoRatio > containerRatio) {
                // Video "rộng" hơn container theo tỷ lệ → khớp theo chiều rộng,
                // letterbox nằm trên/dưới.
                width = cw
                height = cw / videoRatio
            } else {
                // Video "cao" hơn container theo tỷ lệ → khớp theo chiều cao,
                // letterbox nằm 2 bên trái/phải.
                height = ch
                width = ch * videoRatio
            }

            const left = (cw - width) / 2
            const top = (ch - height) / 2

            setRect({ left, top, width, height })
        }

        const ro = new ResizeObserver(recompute)
        ro.observe(container)

        video.addEventListener("loadedmetadata", recompute)
        video.addEventListener("resize", recompute)   // hls.js đổi rendition có thể đổi videoWidth/Height
        recompute()

        return () => {
            ro.disconnect()
            video.removeEventListener("loadedmetadata", recompute)
            video.removeEventListener("resize", recompute)
        }
    }, [containerRef, videoRef])

    return rect
}