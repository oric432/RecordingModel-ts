import * as Minio from "minio";
import { Buffer } from "buffer";
import * as dotenv from "dotenv";
import { createWavHeader } from "./utils.js";

dotenv.config();

const minioClient = new Minio.Client({
    endPoint: process.env.MINIO_ENDPOINT!,
    port: parseInt(process.env.MINIO_PORT!),
    accessKey: process.env.MINIO_ACCESS_KEY!,
    secretKey: process.env.MINIO_SECRET_KEY!,
    useSSL: false,
} as Minio.ClientOptions);

export const saveRecording = async (
    sessionId: string,
    recordingCount: number,
    audioBuffer: Buffer
): Promise<{ success: boolean; name: string }> => {
    const objectName = `${sessionId}_${recordingCount}.wav`;
    const bucketName = "recordings-bucket";

    try {
        const header = createWavHeader(audioBuffer.length, 1, 44100, 16);
        const wavBuffer = Buffer.concat([header, audioBuffer]);
        await minioClient.putObject(bucketName, objectName, wavBuffer, {
            "Content-Type": "audio/wav",
        });

        return { success: true, name: objectName };
    } catch (error) {
        return { success: false, name: error as string }; // Type assertion as error might not always be a string
    }
};
