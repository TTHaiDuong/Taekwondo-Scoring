import jwt from "jsonwebtoken"
import "dotenv/config"

const JWT_SECRET = process.env.JWT_SECRET!

export default function initAuthMiddleWare(io: any) {
    io.use((socket: any, next: any) => {
        const token = socket.handshake.auth?.token

        if (!token) {
            socket.user = null
            return next()
        }

        try {
            const payload = jwt.verify(token, JWT_SECRET) as jwt.JwtPayload
            socket.user = {
                courtId: payload.courtId,
                role: payload.role
            }
            return next()
        } catch {
            next(new Error("INVALID_TOKEN"))
        }
    })
}