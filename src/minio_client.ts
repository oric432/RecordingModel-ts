import * as Minio from "minio";
import { Buffer } from "buffer";
import * as dotenv from "dotenv";
import { createWavHeader } from "./utils.js";
import { FileWriter } from "wav";
import path from "path";

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

export const concatRecordingAndSave = async (
    sessionId: string,
    recordingCount: number
) => {
    const bucketName = process.env.RECORDING_BUCKET_NAME || "";
    const objectNames = Array.from(
        { length: recordingCount + 1 },
        (_, index) => `${sessionId}_${index}.wav`
    );
    const outputFile = "concatenated_recording.wav";
    const writer = new FileWriter(outputFile, {
        channels: 1,
        sampleRate: 44100,
        bitDepth: 16,
    });

    try {
        // Iterate over each file and append its data to the FileWriter
        for (const file of objectNames) {
            const dataStream = await minioClient.getObject(bucketName, file);
            dataStream.on("data", (chunk: Buffer) => {
                writer.write(chunk);
            });

            dataStream.on("end", () => {
                if (file === objectNames[objectNames.length - 1]) {
                    writer.end();
                }
            });
        }

        console.log("something");

        writer.on("done", async () => {
            try {
                console.log(path.join(process.cwd(), outputFile));
                await minioClient.fPutObject(
                    bucketName,
                    `${sessionId}.wav`,
                    path.join(process.cwd(), outputFile),
                    {
                        "Content-Type": "audio/wav",
                    }
                );

                console.log("added concat file to minio");

                await deleteObjectsByPrefix(bucketName, `${sessionId}_`);
            } catch (error) {
                console.log("error adding concat file to minio ", error);
            }
        });
    } catch (err) {
        console.error("Error streaming files:", err);
    }
};

async function deleteObjectsByPrefix(bucketName: string, prefix: string) {
    try {
        // List objects in the bucket
        const stream = minioClient.listObjectsV2(bucketName, prefix, true);

        const objectsToDelete: string[] = [];

        // Iterate through the objects
        for await (const obj of stream) {
            objectsToDelete.push(obj.name);
        }

        if (objectsToDelete.length > 0) {
            // Delete the filtered objects
            await minioClient.removeObjects(bucketName, objectsToDelete);
            console.log("Deleted objects:", objectsToDelete);
        } else {
            console.log("No objects found to delete.");
        }
    } catch (err) {
        console.error("Error:", err);
    }
}
