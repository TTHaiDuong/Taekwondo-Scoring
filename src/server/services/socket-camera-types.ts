export type CameraJoinPayload = {
    courtId: string
    cameraId: string
}

export type CameraChunkPayload = {
    courtId: string
    cameraId: string
    // ArrayBuffer của chunk webm từ MediaRecorder
    data: ArrayBuffer
}

export type CameraControlAction = "pause" | "resume" | "stop" | "zoom"

export type CameraControlPayload = {
    courtId: string
    cameraId: string
    action: CameraControlAction
    zoom?: number
}

export type CameraInfo = {
    courtId: string
    cameraId: string
    paused: boolean
    zoom: number
    startedAt: number
    masterPlaylistUrl: string
}

