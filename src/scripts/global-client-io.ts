"use client"
import { io, Socket } from "socket.io-client"

let socket: Socket | null = null
let authToken: string | null = null

/** Nhận đối tượng Socket (Singleton) */
export function getSingletonSocket(): Socket {
    if (!socket) {
        const proto = window.location.protocol
        const host = window.location.hostname
        const port = proto === "https:" ? "" : ":" + 3001
        socket = io(`${proto}//${host}${port}`, {
            path: "/api/socket.io",
            // transports: ["websocket"],
            auth: (cb) => cb({ token: authToken }),
            reconnection: true,
            reconnectionAttempts: Infinity,
            reconnectionDelay: 1000,
            reconnectionDelayMax: 5000,
        })
    }
    return socket
}

/** Lưu JWT token nhận được từ server sau court:create */
export function setAuthToken(token: string) {
    authToken = token
    // Cập nhật auth trên socket hiện tại nếu đã kết nối
    if (socket) {
        (socket as any).auth = { token }
    }
}