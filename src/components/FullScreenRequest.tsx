import { useFullScreen } from "./UseStates"

export default function FullScreenRequest() {
    const fullscreen = useFullScreen()

    return (
        !fullscreen.isFullScreen &&
        fullscreen.isFullScreenSupported &&
        <div
            onClick={() => fullscreen.fullScreenRequest()}
            className="absolute inset-0 z-[1000] center w-full h-full text-white text-lg bg-black select-none"
        >
            Nhấn vào để mở toàn màn hình
        </div>
    )
}