"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { io, Socket } from "socket.io-client";

// ============================================================
// CAMERA PUBLISHER — HLS-ONLY
// Truy cập: /camera2?courtId=1&cameraId=front
//
// Đã BỎ HẲN kênh LiveKit (WebRTC) song song. Trước đây máy quay phải
// encode 2 lần CÙNG LÚC (WebRTC cho LiveKit + MediaRecorder cho HLS),
// hai encoder tranh CPU khiến cả hai đều giật/tụt chất lượng — nhất là
// trên điện thoại tầm trung. Vì trọng tài xem lại (IVR) không khắt khe
// độ trễ vài giây, giờ chỉ còn DUY NHẤT 1 pipeline:
//
//   getUserMedia → MediaRecorder → Socket.IO → FFmpeg → HLS
//
// HLS này phục vụ CẢ xem trực tiếp (viewer tự bám sát live edge, giống
// YouTube Live) LẪN tua lại (DVR window) — không cần kênh nào khác.
// Nhờ vậy CPU của máy quay chỉ phải encode 1 lần → dư tài nguyên để giữ
// đúng 1080p/30fps ổn định thay vì bị hụt frame do quá tải.
// ============================================================

type Status = "connecting" | "live" | "paused" | "stopped" | "error";

const RECORDER_TIMESLICE_MS = 500;

// Tỉ lệ khung hình mục tiêu theo hướng cầm máy — CÙNG 1 ống kính, chỉ đổi
// vùng crop yêu cầu từ cảm biến. Portrait: khung tiêu chuẩn, dọc/gần vuông
// hơn (4:3) để không mất chi tiết 2 bên. Landscape: khung RỘNG hơn (21:9)
// để lấy nhiều chiều ngang hơn, giống chế độ "wide" trên camera điện thoại.
const PORTRAIT_ASPECT_RATIO = 4 / 3;
const LANDSCAPE_ASPECT_RATIO = 21 / 9;
const ORIENTATION_DEBOUNCE_MS = 200; // chờ animation xoay máy ổn định trước khi áp constraint

const supportsRVFC =
    typeof window !== "undefined" &&
    typeof (HTMLVideoElement.prototype as any).requestVideoFrameCallback === "function";

function pickMimeType(): string | null {
    const candidates = [
        "video/webm;codecs=vp8,opus",
        "video/webm;codecs=vp9,opus",
        "video/webm",
        // iOS/Safari (và MỌI trình duyệt trên iOS, vì đều dùng chung engine
        // WebKit theo quy định của Apple) KHÔNG hỗ trợ WebM dưới bất kỳ
        // hình thức nào — chỉ hỗ trợ MP4 (H.264/AAC) từ iOS 14.3 trở lên.
        // Đặt các ứng viên này SAU webm vì Android/desktop luôn ưu tiên
        // webm (nhẹ CPU hơn với vp8) — chỉ rơi xuống mp4 khi máy không hỗ
        // trợ webm (tức đang chạy trên iOS).
        "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
        "video/mp4",
    ];
    if (typeof MediaRecorder !== "undefined")
        for (const c of candidates) {
            if (MediaRecorder.isTypeSupported(c)) return c;
        }
    // KHÔNG còn fallback "video/webm" giả — nếu không candidate nào được hỗ
    // trợ, trả về null để nơi gọi biết mà báo lỗi rõ ràng, thay vì gửi lên
    // server một mime KHÔNG THẬT khiến FFmpeg ép sai định dạng và crash.
    return null;
}

const BACKEND_PROTOCOL = process.env.NEXT_PUBLIC_SERVER_PROTOCOL || "https";
const BACKEND_PORT = process.env.NEXT_PUBLIC_SERVER_PORT;

export default function Camera() {
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const socketRef = useRef<Socket | null>(null);
    const recorderRef = useRef<MediaRecorder | null>(null);
    const rafRef = useRef<number | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const zoomRef = useRef(1);
    const pausedRef = useRef(false);
    const videoTrackRef = useRef<MediaStreamTrack | null>(null);

    const [status, setStatus] = useState<Status>("connecting");
    const [zoomDisplay, setZoomDisplay] = useState(1);

    const params = useSearchParams();
    const courtId = params.get("courtId") || "1";
    const cameraId = params.get("cameraId") || "main";
    const facing = params.get("facing") || "environment";

    const searchParams = useSearchParams();

    useEffect(() => {
        const cameraId = searchParams.get("cameraId");
        document.title = cameraId
            ? `Camera - ${cameraId}`
            : "Camera";
    }, [searchParams]);


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

        const mql = window.matchMedia("(orientation: landscape)");
        let orientationDebounceTimer: ReturnType<typeof setTimeout> | null = null;
        let handleOrientationChange: ((e: MediaQueryListEvent | MediaQueryList) => void) | null = null;

        async function init() {
            try {
                if (!navigator.mediaDevices?.getUserMedia) {
                    setStatus("error");
                    return;
                }

                localStream = await navigator.mediaDevices.getUserMedia({
                    video: {
                        facingMode: { ideal: facing as VideoFacingModeEnum },
                        // width: { ideal: 1920 },
                        // height: { ideal: 1080 },
                        width: { ideal: 1280, max: 1280 },
                        height: { ideal: 720, max: 720 },
                        frameRate: { ideal: 60 },
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
                videoTrackRef.current = localVideoTrack ?? null;

                // ── THĂM DÒ mimeType THẬT trước khi báo cho server ──
                // Tạo thử 1 MediaRecorder ngắn để đọc recorder.mimeType — đây là giá trị
                // trình duyệt THỰC SỰ chọn, có thể khác với candidate mà pickMimeType() đề
                // xuất (một số trình duyệt/WebView bỏ qua mimeType yêu cầu và tự chọn định
                // dạng khác mà không báo lỗi). Nếu không tạo được recorder nào cả, nghĩa là
                // thiết bị không hỗ trợ ghi hình — phải dừng lại và báo lỗi ngay, không kết
                // nối server với dữ liệu sai định dạng.
                const proposedMime = pickMimeType();
                if (proposedMime === null) {
                    setStatus("error");
                    alert("Thiết bị/trình duyệt này không hỗ trợ ghi hình (MediaRecorder không hỗ trợ WebM). Vui lòng dùng Chrome hoặc Firefox trên Android, hoặc máy tính.");
                    localStream.getTracks().forEach((t) => t.stop());
                    return;
                }

                let actualMimeType: string = proposedMime;
                try {
                    const probeStream = new MediaStream([
                        ...(localVideoTrack ? [localVideoTrack] : []),
                        ...(audioTrack ? [audioTrack] : []),
                    ]);
                    const probeRecorder = new MediaRecorder(probeStream, { mimeType: proposedMime });
                    // recorder.mimeType là giá trị THẬT trình duyệt xác nhận đang dùng —
                    // có thể khác proposedMime nếu trình duyệt tự động điều chỉnh.
                    actualMimeType = probeRecorder.mimeType || proposedMime;
                    probeRecorder.stop();
                } catch (err) {
                    console.error("[Camera] Thăm dò MediaRecorder thất bại:", err);
                    setStatus("error");
                    alert("Thiết bị/trình duyệt này không hỗ trợ ghi hình: " + (err as Error).message);
                    localStream.getTracks().forEach((t) => t.stop());
                    return;
                }

                console.log("[Camera] mimeType THẬT sẽ dùng:", actualMimeType);

                const host = window.location.hostname;
                const backendOrigin = `${BACKEND_PROTOCOL}://${host}${BACKEND_PORT ? ":" + BACKEND_PORT : ""}`;
                // ── Kết nối Socket.IO — kênh DUY NHẤT, phục vụ cả live lẫn ghi hình ──
                // `path` PHẢI khớp CHÍNH XÁC với path server cấu hình khi tạo
                // `new Server(httpServer, { path: ... })` — path này là TOÀN CỤC
                // cho cả instance Socket.IO (không phải theo namespace). Nếu
                // server không set path này, handshake sẽ 404 âm thầm, client
                // tự retry vô tận và KHÔNG BAO GIỜ connect.
                socket = io(`${backendOrigin}/api/camera`, {
                    path: "/api/socket.io",
                    // Gửi kèm mimeType MediaRecorder đang dùng để server truyền
                    // "-f <format>" tường minh cho FFmpeg thay vì để nó tự
                    // auto-probe qua pipe (không seek được).
                    query: { courtId, cameraId, mime: actualMimeType },
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
                    // Dùng LẠI actualMimeType đã thăm dò 1 lần lúc đầu — không gọi
                    // pickMimeType() lại ở đây, tránh nguy cơ ra kết quả khác lần thăm dò
                    // ban đầu (dù hiếm, nhưng đảm bảo NHẤT QUÁN với giá trị đã báo cho server).
                    let recorder: MediaRecorder;
                    try {
                        recorder = new MediaRecorder(stream, {
                            mimeType: actualMimeType,
                            videoBitsPerSecond: 3_000_000,
                        });
                    } catch (err) {
                        console.error("[Camera] MediaRecorder init lỗi:", err);
                        setStatus("error");
                        alert("MediaRecorder lỗi: " + (err as Error).message + " | mime=" + actualMimeType);
                        return;
                    }
                    recorderRef.current = recorder;

                    recorder.ondataavailable = (e) => {
                        if (e.data.size === 0) return;
                        if (pausedRef.current) return;
                        // recorder CŨ vẫn có thể bắn 1 chunk cuối bất đồng bộ sau khi
                        // .stop() đã gọi — nếu recorderRef.current đã trỏ sang recorder
                        // MỚI, đây là dữ liệu "mồ côi" của phiên cũ, KHÔNG được gửi lên
                        // (không phải header, sẽ làm hỏng phiên FFmpeg mới).
                        if (recorderRef.current !== recorder) return;
                        if (socket && socket.connected) {
                            e.data.arrayBuffer().then((buf) => {
                                socket!.emit("chunk", buf)
                            });
                        }
                    };
                    recorder.start(RECORDER_TIMESLICE_MS);
                }

                async function switchSource(toCanvas: boolean) {
                    if (toCanvas === usingCanvas) return;
                    const isFirstActivation = usingCanvas === null;
                    usingCanvas = toCanvas;

                    // Một MediaRecorder MỚI luôn phát ra header container mới ngay
                    // từ chunk đầu — nếu ghi thẳng vào pipe FFmpeg ĐANG CHẠY, FFmpeg
                    // sẽ báo lỗi "Invalid data found..." và THOÁT NGAY. Phải báo
                    // server RESPAWN FFmpeg mới TRƯỚC khi bắt đầu ghi dữ liệu từ
                    // MediaRecorder mới (dùng cơ chế startedAt/hlsDir mới cho phiên).
                    if (!isFirstActivation && socket && socket.connected) {
                        socket.emit("restart");
                    }

                    if (toCanvas) {
                        if (rafRef.current === null) {
                            drawFrame();
                            rafRef.current = supportsRVFC
                                ? (videoRef.current as any).requestVideoFrameCallback(drawLoop)
                                : requestAnimationFrame(drawLoop);
                        }
                        startRecorder(buildCanvasStream());
                    } else {
                        if (rafRef.current !== null) {
                            if (supportsRVFC && videoRef.current) {
                                (videoRef.current as any).cancelVideoFrameCallback(rafRef.current);
                            } else {
                                cancelAnimationFrame(rafRef.current);
                            }
                            rafRef.current = null;
                        }
                        startRecorder(buildRawStream());
                    }
                }

                // ── Đổi khung hình (aspect ratio) theo hướng cầm máy ──────────
                // Khác với applyConstraints() đơn thuần: ở đây ta CẦN buộc FFmpeg phía
                // server tạo phiên MỚI, vì libx264 cố định kích thước khung hình ngay từ
                // frame đầu nó nhận — không thể tự đổi W×H giữa chừng khi track đổi
                // aspectRatio. Ta tái dùng ĐÚNG cơ chế đã có cho việc đổi zoom: tạo
                // MediaRecorder mới (phát sinh header WebM mới) + báo server "restart"
                // TRƯỚC khi ghi dữ liệu mới — viewer tự nhận ra phiên mới (startedAt đổi)
                // qua polling /api/hls/cameras, không cần sửa gì ở phía Viewer.
                let currentAspectIsLandscape: boolean | null = null;
                let isFirstOrientationApply = true;

                async function applyOrientationAndRestart(isLandscape: boolean) {
                    if (isLandscape === currentAspectIsLandscape) return;
                    const track = videoTrackRef.current;
                    if (!track) return;

                    try {
                        await track.applyConstraints({
                            aspectRatio: isLandscape ? LANDSCAPE_ASPECT_RATIO : PORTRAIT_ASPECT_RATIO,
                            width: 1280,
                            height: 720,
                        });
                    } catch (err) {
                        console.warn("[Camera] Không đổi được khung hình (thiết bị có thể không hỗ trợ):", err);
                        return;
                    }

                    currentAspectIsLandscape = isLandscape;
                    console.log("[Camera] Đổi khung hình:", isLandscape ? "RỘNG (ngang)" : "chuẩn (dọc)");

                    if (isFirstOrientationApply) {
                        // Lần áp dụng ĐẦU TIÊN: chỉ set đúng aspect ratio cho track TRƯỚC
                        // khi switchSource() tạo recorder — không cần restart vì chưa có
                        // recorder/session nào đang chạy dở để phải thay thế.
                        isFirstOrientationApply = false;
                        return;
                    }

                    // Từ lần thứ 2 trở đi (người dùng THỰC SỰ xoay máy giữa chừng): mới
                    // cần buộc FFmpeg respawn vì aspect ratio đổi giữa lúc đang stream.
                    if (socket && socket.connected) {
                        socket.emit("restart");
                    }
                    startRecorder(usingCanvas ? buildCanvasStream() : buildRawStream());
                }

                handleOrientationChange = (e: MediaQueryListEvent | MediaQueryList) => {
                    if (orientationDebounceTimer) clearTimeout(orientationDebounceTimer);
                    orientationDebounceTimer = setTimeout(() => applyOrientationAndRestart(e.matches), ORIENTATION_DEBOUNCE_MS);
                };
                mql.addEventListener("change", handleOrientationChange);

                socket.on("connect", () => {
                    if (recorderRef.current && recorderRef.current.state !== "inactive") {
                        setStatus(pausedRef.current ? "paused" : "live");
                        return;
                    }
                    switchSource(zoomRef.current > 1);
                    applyOrientationAndRestart(mql.matches);
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
            if (handleOrientationChange) mql.removeEventListener("change", handleOrientationChange);
            if (orientationDebounceTimer) clearTimeout(orientationDebounceTimer);
            recorderRef.current?.stop();
            streamRef.current?.getTracks().forEach((t) => t.stop());
            socketRef.current?.disconnect();
        }

        init();

        return () => teardown();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [courtId, cameraId, facing, drawLoop]);

    const statusMap: Record<Status, { label: string; cls: string; dot?: boolean }> = {
        connecting: { label: "Đang kết nối...", cls: "bg-amber-900/70 text-amber-300" },
        live: { label: "ĐANG PHÁT", cls: "bg-green-900/70 text-green-300", dot: true },
        paused: { label: "TẠM DỪNG GỬI", cls: "bg-amber-900/70 text-amber-300", dot: true },
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