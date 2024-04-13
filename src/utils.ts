import { RtpPacket } from "./interfaces.js";

export function mergeRecordingBuffers(
    mixedBuffer: Buffer,
    buffer: Buffer,
    start: number,
    end: number
): void {
    console.log(
        `merged -> mixedBufferLength=${mixedBuffer.length}, bufferLength=${buffer.length}, start=${start}, end=${end}`
    );
    for (let i = start, j = 0; i < end && j < buffer.length; i += 2, j += 2) {
        // merge bytes by adding, and clamping them to be in the range of 16-bit signed integers
        let mergedSample = buffer.readInt16LE(j) + mixedBuffer.readInt16LE(i);
        mergedSample = Math.min(
            Math.pow(2, 15) - 1,
            Math.max(-1 * Math.pow(2, 15), mergedSample)
        );

        mixedBuffer.writeInt16LE(mergedSample, i);
    }
}

export const createWavHeader = (
    dataLength: number,
    numChannels: number,
    sampleRate: number,
    bitsPerSample: number
): Buffer => {
    const header = Buffer.alloc(44);

    // RIFF identifier
    header.write("RIFF", 0);

    // File size
    header.writeUInt32LE(36 + dataLength, 4);

    // WAVE identifier
    header.write("WAVE", 8);

    // Format chunk identifier
    header.write("fmt ", 12);

    // Format chunk size
    header.writeUInt32LE(16, 16);

    // Audio format (1 for PCM)
    header.writeUInt16LE(1, 20);

    // Number of channels
    header.writeUInt16LE(numChannels, 22);

    // Sample rate
    header.writeUInt32LE(sampleRate, 24);

    // Byte rate
    header.writeUInt32LE(sampleRate * numChannels * (bitsPerSample / 8), 28);

    // Block align
    header.writeUInt16LE(numChannels * (bitsPerSample / 8), 32);

    // Bits per sample
    header.writeUInt16LE(bitsPerSample, 34);

    // Data chunk identifier
    header.write("data", 36);

    // Data chunk size
    header.writeUInt32LE(dataLength, 40);

    return header;
};

export const formatBytes = (bytes: number): string => {
    if (bytes === 0) return "0 Bytes";

    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB", "TB", "PB", "EB", "ZB", "YB"];

    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
};

export const parseRtpPacket = (packet: Buffer): RtpPacket | null => {
    // Basic RTP header structure (assumes 12-byte header)
    if (packet.length < 12) {
        return null; // Not a complete RTP packet
    }

    const version = (packet[0] >> 6) & 0x03;
    const padding = (packet[0] >> 5) & 0x01;
    const extension = (packet[0] >> 4) & 0x01;
    const csrcCount = packet[0] & 0x0f;
    const marker = (packet[1] >> 7) & 0x01;
    const payloadType = packet[1] & 0x7f;
    const sequenceNumber = (packet[2] << 8) | packet[3];
    const timestamp =
        (packet[4] << 24) | (packet[5] << 16) | (packet[6] << 8) | packet[7];
    const ssrc =
        (packet[8] << 24) | (packet[9] << 16) | (packet[10] << 8) | packet[11];
    const payload = packet.subarray(12, packet.length);

    return {
        version,
        padding,
        extension,
        csrcCount,
        marker,
        payloadType,
        sequenceNumber,
        timestamp,
        ssrc,
        payload,
    };
};
