import express from 'express'
import https from 'https'
import http from 'http'
import fs from 'fs'
import cors from 'cors'
import jwt from 'jsonwebtoken'
import 'dotenv/config'
import { Server } from 'socket.io'
import Style, { printLines } from './terminal-styles.js'
import handleVir from './services/vir.js'
import initAuthMiddleWare from './services/middleware.js'
import initMatchChannel from './services/match.js'
import initScoreChannel from './services/score.js'
import initTestModeChannel from './services/testmode.js'
import initTimerChannel from './services/timer.js'
import { getWifiIP } from './services/get-ip.js'
import { initCamera } from './camera.js'
import { initHls } from './services/hls.js'

const useHttps = process.env.USE_HTTPS === 'true'
const protocol = useHttps ? "https" : "http"
const PORT = process.env.EXPRESS_PORT || 3001
const app = express()

// == EXPRESS ==
app.use(cors({ origin: '*' }))
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

// ── DEBUG: lấy token tạm thời để test (chỉ dùng khi dev) ──
if (process.env.NODE_ENV !== 'production') {
    app.get('/dev/token', (req, res) => {
        const JWT_SECRET = process.env.JWT_SECRET!
        const courtId = (req.query.courtId as string) || '1'
        const role = (req.query.role as string) || 'control'
        const token = jwt.sign({ courtId, role }, JWT_SECRET)
        res.json({
            token, courtId, role,
            usage: `setAuthToken("${token}")`
        })
    })
}

let server
if (useHttps) {
    server = https.createServer(
        {
            key: fs.readFileSync('./certificates/localhost-key.pem'),
            cert: fs.readFileSync('./certificates/localhost.pem')
        },
        app
    )
}
else {
    server = http.createServer(app)
}

initCamera(app)

// == WEBSOCKET (Socket.IO) ==
// Tạo io TRƯỚC initHls vì initHls cần io để mở namespace "/camera",
// và initHls phải chạy TRƯỚC middleware fallback "/" bên dưới (fallback
// bắt mọi path nên các route /hls, /api/hls/* phải đăng ký trước nó).

// `path` là cấu hình TOÀN CỤC cho engine.io — PHẢI khớp với `path` mà
// client truyền vào io(...) (camera2/page.tsx). Nếu thiếu dòng này, mọi
// client dùng path tuỳ chỉnh (kể cả /api/camera) sẽ handshake 404 âm thầm,
// tự retry vô tận, không bao giờ connect được — không có ngoại lệ theo
// namespace, path áp dụng cho MỌI namespace trên cùng 1 instance io.
const io = new Server(server, {
    path: "/api/socket.io",
    maxHttpBufferSize: 1e8,
    cors: { origin: "*" }
})

// Auth middleware phải đăng ký TRƯỚC io.on("connection")
// (chỉ áp dụng cho namespace mặc định — namespace "/camera" trong initHls
// không cần JWT, giữ đúng mức bảo mật như raw ws trước đây: courtId/cameraId
// trong query là đủ để phân biệt phiên)
initAuthMiddleWare(io)

// initHls tự tạo namespace "/camera" trên io, đồng thời đăng ký route Express
initHls(io, app)

app.use("/", (req, res) =>
    res.json({
        message: "Path not found"
    })
)

io.on("connection", (socket) => {
    handleVir(io, socket)
    initMatchChannel(io, socket)
    initScoreChannel(io, socket)
    initTestModeChannel(io, socket)
    initTimerChannel(io, socket)
})

server.listen(PORT, () => {
    printLines([
        Style.apply("   ▲ Express Server", ["blue", "bold"]),
        `   - Local:        ${protocol}://localhost:${PORT}`,
        `   - Network:      ${protocol}://${getWifiIP()}:${PORT}`,
        ""
    ])
})