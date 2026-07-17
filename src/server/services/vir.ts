const rooms: Record<string, string[]> = {}

export default function handleVir(io: any, socket: any) {
    socket.on("join-room", (roomId: string) => {
        rooms[roomId] = rooms[roomId] || []
        rooms[roomId].push(socket.id)
        socket.join(roomId)
    })

    socket.on("offer", (data: { roomId: any, offer: any }) => {
        // gửi offer cho tất cả người trong room trừ sender
        socket.to(data.roomId).emit("offer", data.offer)
    })

    socket.on("answer", (data: { roomId: any, answer: any }) => {
        socket.to(data.roomId).emit("answer", data.answer)
    })

    socket.on("ice-candidate", (data: { roomId: any, candidate: any }) => {
        socket.to(data.roomId).emit("ice-candidate", data.candidate)
    })

    socket.on("disconnect", () => {
        // remove socket from rooms
        Object.keys(rooms).forEach(roomId => {
            rooms[roomId] = rooms[roomId].filter(id => id !== socket.id)
        })
    })
}