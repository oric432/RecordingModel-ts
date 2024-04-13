import * as dgram from "dgram";
import { formatBytes, mergeRecordingBuffers, parseRtpPacket } from "./utils.js";
import { saveRecording } from "./minio_client.js";
import { RecordingMetadata, RtpPacket, UdpClient } from "./interfaces.js";

export class AudioRecorder {
    // constants
    private readonly SAMPLE_RATE: number = 44100;
    private readonly BIT_PER_SAMPLE: number = 16;
    private readonly RECORDING_DURATION: number = 5 * 1000; // 5 seconds in ms
    private readonly BPMS: number =
        (this.SAMPLE_RATE * this.BIT_PER_SAMPLE) / 8 / 1000;

    // server variables
    private multicastAddress: string;
    private port: number;
    private sessionID: string;
    private recordingCount: number = 0;
    private udpServer: dgram.Socket;
    private buffer: Buffer;
    private startedDate: Date;
    private count: number = 0;
    private clients: Map<string, UdpClient>;

    constructor(multicastAddress: string, port: number, id: string) {
        this.multicastAddress = multicastAddress;
        this.port = port;
        this.sessionID = id;
        this.udpServer = dgram.createSocket({ type: "udp4", reuseAddr: true });
        this.buffer = Buffer.alloc(this.BPMS * this.RECORDING_DURATION); // Allocating buffer space
        this.startedDate = new Date();
        this.clients = new Map();
    }

    setupServer(): void {
        this.udpServer.on("error", (err) => {
            console.log(`Server error:\n${err.stack}`);
            ///// TODO Check if socket needs to be closed after error
            this.udpServer.close();
        });

        this.udpServer.on("message", (msg: Buffer) => {
            this.handleMessage(msg);
        });

        this.udpServer.bind(this.port, this.multicastAddress);

        ///// TODO Handle on a global app level
        process.on("SIGINT", () => {
            this.handleDisconnect();
        });
    }

    handleMessage(msg: Buffer): void {
        ///// TODO Include rtp payload in rtpPacket and avoid subarry call in processData()
        const rtpPacket: RtpPacket | null = parseRtpPacket(msg);

        if (rtpPacket) {
            const client: UdpClient | undefined = this.clients.get(
                rtpPacket.ssrc.toString()
            );

            if (!client) {
                console.log("Client is undefined");
                return;
            }

            this.updateClient(rtpPacket, client);
            this.processData(rtpPacket, client);
        } else {
            console.log("Received non-RTP packet");
        }
    }

    updateClient(rtpPacket: RtpPacket, client: UdpClient) {
        if (!client) {
            this.clients.set(rtpPacket.ssrc.toString(), {
                timestamp: 0,
                startedDate: new Date(),
            });
        } else {
            this.clients.set(rtpPacket.ssrc.toString(), {
                timestamp: rtpPacket.timestamp,
                startedDate: client.startedDate,
            });
        }
    }

    async processData(rtpPacket: RtpPacket, client: UdpClient) {
        console.log("ssrc: ", rtpPacket.ssrc);
        console.log("sequence number: ", rtpPacket.sequenceNumber);
        console.log("timestamp: ", rtpPacket.timestamp);

        // remove header to get only the required data
        let data: Buffer = rtpPacket.payload;
        // calculate how much time it took for the data to move : (data[bytes] / BPMS[bytes/ms] = transfer-rate[ms])
        const bpmsg: number = Math.round(data.length / this.BPMS);

        if (this.count === 0) {
            const elapsedTime =
                new Date().getTime() - this.startedDate.getTime();
            this.count = Math.round((elapsedTime / bpmsg) * data.length);
        } else {
            this.count += data.length;
        }

        // calculate the time that has passed since the recording was up : (client-joined[date] - recording-started[date] = ms-offset[ms])
        const currentTime: number =
            client.startedDate.getTime() - this.startedDate.getTime();
        console.log("time offset: ", currentTime);

        let start = Math.round(
            ((currentTime + rtpPacket.timestamp) / bpmsg) * data.length -
                this.buffer.length * this.recordingCount
        );

        if (start < 0) {
            return;
        }

        if (start + data.length > this.buffer.length) {
            let left = this.buffer.length - start;
            left = left % 2 !== 0 ? left - 1 : left;
            mergeRecordingBuffers(
                this.buffer,
                data.subarray(0, left),
                start,
                start + left
            );

            data = data.subarray(left, data.length);
            start = 0;

            const recordingBuffer = Buffer.from(this.buffer);
            // normalizeLoudness(recordingBuffer);

            this.count = data.length;
            // write to minio
            await saveRecording(
                this.sessionID,
                this.recordingCount++,
                recordingBuffer
            );

            this.buffer.fill(0);
        }

        mergeRecordingBuffers(this.buffer, data, start, start + data.length);
    }

    async handleDisconnect(): Promise<RecordingMetadata> {
        this.udpServer.close();

        console.log(
            `${this.multicastAddress}:${this.port} audio session has closed`
        );

        const cutBuffer = this.buffer.subarray(0, this.count);
        // normalizeLoudness(cutBuffer);

        await saveRecording(this.sessionID, this.recordingCount, cutBuffer);

        return {
            id: this.sessionID,
            MCAddress: `${this.multicastAddress}:${this.port}`,
            name: `${this.sessionID}`,
            date: this.startedDate,
            recordingLength:
                this.RECORDING_DURATION * this.recordingCount +
                cutBuffer.length / this.BPMS,
            filePath: this.sessionID,
            fileSize: formatBytes(
                this.buffer.length * this.recordingCount + cutBuffer.length
            ),
            recordingCount: this.recordingCount,
        };
    }
}
