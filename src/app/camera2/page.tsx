"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { io, Socket } from "socket.io-client";
import { Room, LocalVideoTrack, LocalAudioTrack, Track } from "livekit-client";

// ============================================================
// CAMERA PUBLISHER — HYBRID
// Truy cập: /camera2?courtId=1&cameraId=front
//
// Publish SONG SONG 2 kênh từ CÙNG 1 getUserMedia stream:
//   1) LiveKit (WebRTC)   → xem LIVE độ trễ thấp (<1s) trên VIR
//   2) Socket.IO → FFmpeg → HLS → chỉ dùng để TUA LẠI / LƯU CLIP
//      (không dùng để xem live nữa — đã tách hẳn ra LiveKit)
//
// Zoom (crop qua canvas) áp dụng ĐỒNG THỜI cho cả 2 kênh — khi VIR yêu
// cầu zoom, publish lại track LiveKit bằng track canvas + đổi nguồn
// MediaRecorder cùng lúc, để live và bản ghi luôn khớp hình.
// ============================================================

type Status = "connecting" | "live" | "paused" | "stopped" | "error";

const RECORDER_TIMESLICE_MS = 500;

const supportsRVFC =
    typeof window !== "undefined" &&
    typeof (HTMLVideoElement.prototype as any).requestVideoFrameCallback === "function";

function pickMimeType(): string {
    const candidates = [
        "video/webm;codecs=h264",   // H.264-trong-WebM: fragment được như VP8/9 nhưng vẫn có thể hardware-encode trên 1 số máy Android
        "video/webm;codecs=vp9,opus",
        "video/webm;codecs=vp8,opus",
        "video/webm",
    ];
    for (const c of candidates) {
        if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(c)) return c;
    }
    return "video/webm";
}

export default function Camera() {
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const socketRef = useRef<Socket | null>(null);
    const roomRef = useRef<Room | null>(null);
    const recorderRef = useRef<MediaRecorder | null>(null);
    const rafRef = useRef<number | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const zoomRef = useRef(1);
    const pausedRef = useRef(false); // chỉ ảnh hưởng kênh HLS (ghi/tua lại) — KHÔNG ảnh hưởng live LiveKit
    const publishedVideoTrackRef = useRef<LocalVideoTrack | null>(null);

    const [status, setStatus] = useState<Status>("connecting");
    const [zoomDisplay, setZoomDisplay] = useState(1);

    const params = useSearchParams();
    const courtId = params.get("courtId") || "1";
    const cameraId = params.get("cameraId") || "main";
    const facing = params.get("facing") || "environment";

    const drawFrame = useCallback(() => {
        const video = videoRef.current;
        const canvas = canvasRef.current;
        if (video && canvas && video.videoWidth > 0) {
            if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
                canvas.width = video.videoWidth;
                canvas.height = video.videoHeight;
            }
            const ctx = canvas.getContext("2d");
            if (ctx) {
                const z = zoomRef.current;
                const sw = canvas.width / z;
                const sh = canvas.height / z;
                const sx = (canvas.width - sw) / 2;
                const sy = (canvas.height - sh) / 2;
                ctx.drawImage(video, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
            }
        }
    }, []);

    const drawLoop = useCallback(() => {
        const video = videoRef.current;
        if (!video) return;
        drawFrame();
        if (supportsRVFC) {
            rafRef.current = (video as any).requestVideoFrameCallback(drawLoop);
        } else {
            rafRef.current = requestAnimationFrame(drawLoop);
        }
    }, [drawFrame]);

    useEffect(() => {
        let localStream: MediaStream | undefined;
        let socket: Socket | undefined;
        let room: Room | undefined;

        async function init() {
            try {
                if (!navigator.mediaDevices?.getUserMedia) {
                    setStatus("error");
                    return;
                }

                localStream = await navigator.mediaDevices.getUserMedia({
                    video: {
                        facingMode: { ideal: facing as VideoFacingModeEnum },
                        width: { ideal: 1920 },
                        height: { ideal: 1080 },
                        frameRate: { ideal: 30 },
                    },
                    audio: { echoCancellation: true, noiseSuppression: true },
                });
                streamRef.current = localStream;

                const video = videoRef.current!;
                video.srcObject = localStream;
                video.muted = true;
                await video.play();

                // Log để xác nhận độ phân giải/fps THỰC SỰ máy đáp ứng được
                // (khác "ideal" đã xin) — hữu ích khi chẩn đoán CPU quá tải.
                console.log("[Camera] Video settings:", localStream.getVideoTracks()[0]?.getSettings());

                const localVideoTrack = localStream.getVideoTracks()[0];
                const audioTrack = localStream.getAudioTracks()[0];

                // ── (1) Kết nối LiveKit — kênh XEM LIVE độ trễ thấp ──
                // QUAN TRỌNG: URL LiveKit KHÁC HẲN URL backend Express (kênh
                // HLS bên dưới). LiveKit là 1 tiến trình riêng (thường cổng
                // 7880 với `livekit-server --dev`). Dùng chung host/port với
                // Express (như code cũ) khiến room.connect()/publishTrack()
                // nối nhầm sang server không có engine LiveKit thật, gây lỗi
                // "publication of local track timed out, no response from
                // server". Khai báo tường minh qua env — xem .env.
                const backendProto = process.env.NEXT_PUBLIC_SERVER_PROTOCOL || "https";
                const backendPort = process.env.NEXT_PUBLIC_SERVER_PORT;
                const host = window.location.hostname;
                const backendOrigin = `${backendProto}://${host}${backendPort ? ":" + backendPort : ""}`;

                const lkProto = process.env.NEXT_PUBLIC_LIVEKIT_WS_PROTOCOL || "wss";
                const lkHost = process.env.NEXT_PUBLIC_LIVEKIT_HOST || host;
                const lkPort = process.env.NEXT_PUBLIC_LIVEKIT_PORT;
                const livekitUrl = `${lkProto}://${lkHost}${lkPort ? ":" + lkPort : ""}`;

                ; (async () => {
                    try {
                        room = new Room();
                        roomRef.current = room;
                        const token = await fetch(`${backendOrigin}/api/livekit/token?courtId=${courtId}&cameraId=${cameraId}`).then(r => r.text());
                        await room.connect(livekitUrl, token);
                        const lkAudioTrack = audioTrack ? new LocalAudioTrack(audioTrack) : null;
                        if (lkAudioTrack) await room.localParticipant.publishTrack(lkAudioTrack);
                        await publishVideo(localVideoTrack);

                        room.on("disconnected", () => {
                            // Kênh live rớt không có nghĩa là dừng ghi hình — chỉ log,
                            // không đổi status (status phản ánh kênh ghi hình là chính,
                            // vì đó là kênh camera vẫn còn "sống" để phục vụ tua lại).
                            console.warn("[Camera] LiveKit disconnected — kênh ghi hình vẫn tiếp tục nếu còn socket");
                        });

                    } catch (err) {
                        console.error("[Camera] LiveKit publish thất bại (kênh live) — kênh ghi hình vẫn tiếp tục:", err);
                    }
                })();

                async function publishVideo(track: MediaStreamTrack) {
                    if (!roomRef.current || roomRef.current.state !== "connected") return
                    const old = publishedVideoTrackRef.current;
                    const lkTrack = new LocalVideoTrack(track);
                    await room!.localParticipant.publishTrack(lkTrack, {
                        source: Track.Source.Camera,
                        simulcast: false, // 1 nguồn duy nhất, không cần nhiều lớp — giảm tải CPU encode
                        videoEncoding: { maxBitrate: 3_000_000, maxFramerate: 30 },
                    });
                    publishedVideoTrackRef.current = lkTrack;
                    if (old) {
                        try { await room!.localParticipant.unpublishTrack(old); old.stop(); } catch { }
                    }
                }

                await publishVideo(localVideoTrack);

                // ── (2) Kết nối Socket.IO — kênh GHI HÌNH cho tua lại/lưu clip ──
                // `path` PHẢI khớp CHÍNH XÁC với path đã cấu hình ở server khi
                // tạo `new Server(httpServer, { path: ... })` — path này là
                // TOÀN CỤC cho cả instance Socket.IO (không phải theo namespace).
                // Nếu server không set path này, handshake sẽ 404 âm thầm,
                // client tự retry vô tận và KHÔNG BAO GIỜ connect — hệ quả là
                // không có phiên HLS nào được tạo, /api/hls/cameras luôn trả
                // rỗng, và menu điều khiển trên VIR sẽ không bao giờ hiện.
                console.log(`${backendOrigin}/api/camera`)
                socket = io(`${backendOrigin}/api/camera`, {
                    path: "/api/socket.io",
                    // Gửi kèm mimeType MediaRecorder đang dùng để server truyền
                    // "-f <format>" tường minh cho FFmpeg thay vì để nó tự
                    // auto-probe qua pipe (không seek được) — auto-probe với
                    // MP4 phân mảnh trôi từng đoạn nhỏ rất dễ fail ngay từ đầu,
                    // khiến FFmpeg thoát ngay và master.m3u8 không bao giờ
                    // được tạo ra.
                    query: { courtId, cameraId, mime: pickMimeType() },
                    transports: ["websocket"],
                    reconnection: true,
                    reconnectionAttempts: Infinity,
                    reconnectionDelay: 1000,
                    reconnectionDelayMax: 5000,
                });
                socketRef.current = socket;

                function buildRawStream(): MediaStream {
                    return new MediaStream([
                        ...(localVideoTrack ? [localVideoTrack] : []),
                        ...(audioTrack ? [audioTrack] : []),
                    ]);
                }

                function buildCanvasStream(): MediaStream {
                    const canvas = canvasRef.current!;
                    const canvasStream = canvas.captureStream(30);
                    return new MediaStream([
                        ...canvasStream.getVideoTracks(),
                        ...(audioTrack ? [audioTrack] : []),
                    ]);
                }

                let usingCanvas: boolean | null = null;

                function startRecorder(stream: MediaStream) {
                    if (recorderRef.current && recorderRef.current.state !== "inactive") {
                        recorderRef.current.stop();
                    }
                    const mimeType = pickMimeType();
                    const recorder = new MediaRecorder(stream, {
                        mimeType,
                        videoBitsPerSecond: 6_000_000,
                    });
                    recorderRef.current = recorder;

                    recorder.ondataavailable = (e) => {
                        if (e.data.size === 0) return;
                        if (pausedRef.current) return;
                        // QUAN TRỌNG: recorder CŨ vẫn có thể bắn 1 chunk cuối (bất đồng bộ,
                        // sau khi .stop() đã gọi) — nếu lúc đó recorderRef.current đã trỏ
                        // sang recorder MỚI, đây là dữ liệu "mồ côi" của phiên cũ, KHÔNG
                        // được gửi lên (nó không phải header, sẽ làm hỏng phiên FFmpeg mới).
                        if (recorderRef.current !== recorder) return;
                        if (socket && socket.connected) {
                            e.data.arrayBuffer().then((buf) => socket!.emit("chunk", buf));
                        }
                    };
                    recorder.start(RECORDER_TIMESLICE_MS);
                }

                async function switchSource(toCanvas: boolean) {
                    if (toCanvas === usingCanvas) return;
                    const isFirstActivation = usingCanvas === null
                    usingCanvas = toCanvas;

                    // QUAN TRỌNG: một MediaRecorder MỚI luôn phát ra header
                    // container mới ngay từ chunk đầu (ftyp/moov cho MP4, EBML
                    // header cho WebM). Nếu cứ ghi thẳng vào pipe FFmpeg ĐANG
                    // CHẠY (đã demux dở dang dòng byte cũ), FFmpeg gặp header
                    // lạ giữa chừng sẽ báo "Invalid data found..." và THOÁT
                    // NGAY — hệ quả: master.m3u8 không bao giờ được tạo (hoặc
                    // ngừng cập nhật) sau lần đổi nguồn đầu tiên (vd: bấm zoom).
                    // Phải báo server RESPAWN FFmpeg mới (phiên con mới, dùng
                    // đúng cơ chế startedAt/hlsDir đã có cho reconnect) TRƯỚC
                    // khi bắt đầu ghi dữ liệu từ MediaRecorder mới.
                    if (!isFirstActivation && socket && socket.connected) {   // ← chỉ restart khi KHÔNG phải lần đầu
                        socket.emit("restart");
                    }

                    if (toCanvas) {
                        if (rafRef.current === null) {
                            drawFrame();
                            rafRef.current = supportsRVFC
                                ? (videoRef.current as any).requestVideoFrameCallback(drawLoop)
                                : requestAnimationFrame(drawLoop);
                        }
                        const canvas = canvasRef.current!;
                        const canvasVideoTrack = canvas.captureStream(30).getVideoTracks()[0];
                        await publishVideo(canvasVideoTrack);   // đồng bộ zoom sang kênh live
                        startRecorder(buildCanvasStream());     // và sang kênh ghi hình (pipe MỚI)
                    } else {
                        if (rafRef.current !== null) {
                            if (supportsRVFC && videoRef.current) {
                                (videoRef.current as any).cancelVideoFrameCallback(rafRef.current);
                            } else {
                                cancelAnimationFrame(rafRef.current);
                            }
                            rafRef.current = null;
                        }
                        await publishVideo(localVideoTrack);
                        startRecorder(buildRawStream());
                    }
                }

                socket.on("connect", () => {
                    if (recorderRef.current && recorderRef.current.state !== "inactive") {
                        setStatus(pausedRef.current ? "paused" : "live");
                        return;
                    }
                    switchSource(zoomRef.current > 1);
                    setStatus("live");
                });

                socket.on("control", (msg: { cmd: string; zoom?: number }) => {
                    if (msg.cmd === "pause") {
                        pausedRef.current = true;
                        setStatus("paused");
                    } else if (msg.cmd === "resume") {
                        pausedRef.current = false;
                        setStatus("live");
                    } else if (msg.cmd === "zoom" && typeof msg.zoom === "number") {
                        zoomRef.current = Math.max(1, msg.zoom);
                        setZoomDisplay(zoomRef.current);
                        switchSource(zoomRef.current > 1);
                    } else if (msg.cmd === "stop") {
                        teardown();
                        setStatus("stopped");
                    }
                });

                socket.on("disconnect", () => setStatus("connecting"));
                socket.on("connect_error", () => setStatus("error"));
            } catch (err) {
                console.error("Camera publish error:", err);
                setStatus("error");
            }
        }

        function teardown() {
            if (rafRef.current !== null) {
                if (supportsRVFC && videoRef.current) {
                    (videoRef.current as any).cancelVideoFrameCallback(rafRef.current);
                } else {
                    cancelAnimationFrame(rafRef.current);
                }
                rafRef.current = null;
            }
            recorderRef.current?.stop();
            streamRef.current?.getTracks().forEach((t) => t.stop());
            socketRef.current?.disconnect();
            roomRef.current?.disconnect();
        }

        init();

        return () => teardown();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [courtId, cameraId, facing, drawLoop]);

    const statusMap: Record<Status, { label: string; cls: string; dot?: boolean }> = {
        connecting: { label: "Đang kết nối...", cls: "bg-amber-900/70 text-amber-300" },
        live: { label: "ĐANG PHÁT", cls: "bg-green-900/70 text-green-300", dot: true },
        paused: { label: "TẠM DỪNG GỬI (ghi hình)", cls: "bg-amber-900/70 text-amber-300", dot: true },
        stopped: { label: "ĐÃ DỪNG QUAY", cls: "bg-white/10 text-white/60" },
        error: { label: "Lỗi", cls: "bg-red-900/70 text-red-300" },
    };
    const s = statusMap[status];

    return (
        <div className="relative w-screen h-screen bg-black">
            <div className="absolute inset-0 bg-black flex items-center justify-center">
                <video ref={videoRef} playsInline muted
                    className={`w-full h-full object-contain bg-black ${zoomDisplay > 1 ? "hidden" : ""}`} />
                <canvas ref={canvasRef}
                    className={`w-full h-full object-contain bg-black ${zoomDisplay > 1 ? "" : "hidden"}`} />
            </div>

            <div className="absolute top-0 left-0 right-0 z-10
                flex items-center justify-between px-[16px] py-[10px]
                bg-gradient-to-b from-black/70 to-transparent">
                <span className="px-[10px] py-[4px] rounded-full text-[12px] font-bold bg-black/50 text-white">
                    📷 {cameraId.toUpperCase()} · Sân {courtId}
                    {zoomDisplay > 1 && ` · Zoom ${zoomDisplay.toFixed(1)}×`}
                </span>
                <span className={`px-[10px] py-[4px] rounded-full text-[11px] font-semibold
                    flex items-center gap-[6px] ${s.cls}`}>
                    {s.dot && <span className="w-[6px] h-[6px] rounded-full bg-current animate-pulse" />}
                    {s.label}
                </span>
            </div>

            {status === "stopped" && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/70">
                    <p className="text-white/70 text-[14px]">Điều khiển viên đã dừng camera này.</p>
                </div>
            )}
        </div>
    );
}