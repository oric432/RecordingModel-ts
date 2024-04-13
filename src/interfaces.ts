export interface RtpPacket {
    version: number;
    padding: number;
    extension: number;
    csrcCount: number;
    marker: number;
    payloadType: number;
    sequenceNumber: number;
    timestamp: number;
    ssrc: number;
    payload: Buffer;
}

export interface UdpClient {
    timestamp: number;
    startedDate: Date;
}

export interface RecordingMetadata {
    id: string;
    MCAddress: string;
    name: string;
    date: Date;
    recordingLength: number;
    filePath: string;
    fileSize: string;
    recordingCount: number;
}
