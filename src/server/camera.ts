import { AccessToken } from "livekit-server-sdk"

// ============================================================
// CAMERA TOKEN SERVICE
// Hỗ trợ nhiều camera trong cùng 1 phòng (room theo courtId)
// Mỗi camera có cameraId riêng để viewer phân biệt nguồn
// ============================================================

const LIVEKIT_API_KEY = "devkey"
const LIVEKIT_API_SECRET = "secret"

export function initCamera(app: any) {

    /**
     * Cấp token cho thiết bị publish camera.
     * Query params:
     *   - courtId:   sân nào (mặc định "1")
     *   - cameraId:  định danh camera (vd: "front", "side", "behind")
     *                bắt buộc nếu muốn nhiều camera cùng publish 1 sân
     */
    app.get("/api/livekit/token", async (req: any, res: any) => {
        const courtId = req.query.courtId || "1"
        const cameraId = req.query.cameraId || "main"
        const room = `court-${courtId}`

        // Identity phải duy nhất trong room — gắn cameraId + timestamp
        // để client tự reconnect không bị đụng identity cũ
        const identity = `cam:${cameraId}:${Date.now()}`

        const token = new AccessToken(
            LIVEKIT_API_KEY,
            LIVEKIT_API_SECRET,
            {
                identity,
                // metadata giúp viewer đọc được tên camera dễ đọc
                // mà không cần parse identity
                metadata: JSON.stringify({ cameraId, role: "camera" }),
            }
        )

        token.addGrant({
            roomJoin: true,
            room,
            canPublish: true,
            canSubscribe: true,
        })

        const jwt = await token.toJwt()
        res.send(jwt)
    })

    /**
     * Cấp token cho viewer xem tất cả camera trong 1 sân.
     * Query params:
     *   - courtId: sân nào (mặc định "1")
     */
    app.get("/api/livekit/viewer-token", async (req: any, res: any) => {
        const courtId = req.query.courtId || "1"
        const room = `court-${courtId}`
        const identity = `viewer:${Date.now()}`

        const token = new AccessToken(
            LIVEKIT_API_KEY,
            LIVEKIT_API_SECRET,
            {
                identity,
                metadata: JSON.stringify({ role: "viewer" }),
            }
        )

        token.addGrant({
            roomJoin: true,
            room,
            canPublish: false,
            canSubscribe: true,
        })

        const jwt = await token.toJwt()
        res.send(jwt)
    })
}