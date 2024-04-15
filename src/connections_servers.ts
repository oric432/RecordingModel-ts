import * as http from "http";
import { Server as SocketIOServer } from "socket.io";
import { AudioRecorder } from "./audio_recording_server.js";

const httpServer = http.createServer();
const ioServer = new SocketIOServer(httpServer, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"],
    },
});

const recordings: Map<string, AudioRecorder> = new Map();

ioServer.on("connection", (socket) => {
    console.log(`new client has connected, id: ${socket.id}`);

    socket.on(
        "startRecording",
        (recordingData: {
            multicastAddress: string;
            port: number;
            id: string;
        }) => {
            const { multicastAddress, port, id } = recordingData;
            console.log(multicastAddress, port, id);
            const audioRecorder = new AudioRecorder(multicastAddress, port, id);
            recordings.set(id, audioRecorder);

            // add recording to temporary running recording table
            ioServer.emit("saveTemporaryRecording", {
                id,
                MCAddress: `${multicastAddress}:${port}`,
            });
        }
    );

    socket.on("stopRecording", async (id) => {
        console.log("recording stopped", id);
        const audioRecorder = recordings.get(id);

        if (audioRecorder) {
            const data = await audioRecorder.handleDisconnect();
            console.log(data);

            // remove recording to temporary running recording table
            ioServer.emit("deleteTemporaryRecording", data);
            recordings.delete(id);
        }
    });
});

export default httpServer;
