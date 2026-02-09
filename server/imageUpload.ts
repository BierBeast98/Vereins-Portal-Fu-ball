import sharp from "sharp";
import { randomUUID } from "crypto";
import { objectStorageClient } from "./replit_integrations/object_storage/objectStorage";

function parseObjectPath(path: string): { bucketName: string; objectName: string } {
  if (!path.startsWith("/")) {
    path = `/${path}`;
  }
  const pathParts = path.split("/");
  if (pathParts.length < 3) {
    throw new Error("Invalid path: must contain at least a bucket name");
  }
  return {
    bucketName: pathParts[1],
    objectName: pathParts.slice(2).join("/"),
  };
}

interface ProcessedImage {
  thumbnail: string;
  medium: string;
  original: string;
}

async function uploadBuffer(
  buffer: Buffer,
  objectPath: string,
  contentType: string
): Promise<void> {
  const { bucketName, objectName } = parseObjectPath(objectPath);
  const bucket = objectStorageClient.bucket(bucketName);
  const file = bucket.file(objectName);
  await file.save(buffer, {
    contentType,
    metadata: {
      metadata: {
        "custom:aclPolicy": JSON.stringify({
          owner: "admin",
          visibility: "public",
        }),
      },
    },
  });
}

export async function processAndUploadImage(
  fileBuffer: Buffer,
  originalName: string
): Promise<ProcessedImage> {
  const id = randomUUID();
  const publicDir = (process.env.PUBLIC_OBJECT_SEARCH_PATHS || "").split(",")[0]?.trim();
  if (!publicDir) {
    throw new Error("PUBLIC_OBJECT_SEARCH_PATHS not configured");
  }

  const basePath = `${publicDir}/images/${id}`;

  let sharpInstance;
  try {
    sharpInstance = sharp(fileBuffer).rotate();
    await sharpInstance.metadata();
  } catch (err) {
    throw new Error("Ungültige Bilddatei. Die Datei konnte nicht verarbeitet werden.");
  }

  const thumbnail = await sharpInstance
    .clone()
    .resize(200, 200, { fit: "cover" })
    .webp({ quality: 80 })
    .toBuffer();

  const medium = await sharpInstance
    .clone()
    .resize(600, 600, { fit: "inside", withoutEnlargement: true })
    .webp({ quality: 85 })
    .toBuffer();

  const original = await sharpInstance
    .clone()
    .resize(1200, 1200, { fit: "inside", withoutEnlargement: true })
    .webp({ quality: 90 })
    .toBuffer();

  await Promise.all([
    uploadBuffer(thumbnail, `${basePath}-thumb.webp`, "image/webp"),
    uploadBuffer(medium, `${basePath}-medium.webp`, "image/webp"),
    uploadBuffer(original, `${basePath}-original.webp`, "image/webp"),
  ]);

  return {
    thumbnail: `/api/images/${id}-thumb.webp`,
    medium: `/api/images/${id}-medium.webp`,
    original: `/api/images/${id}-original.webp`,
  };
}

export async function serveImage(
  imagePath: string,
  res: import("express").Response
): Promise<void> {
  const publicPaths = (process.env.PUBLIC_OBJECT_SEARCH_PATHS || "")
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);

  for (const searchPath of publicPaths) {
    const fullPath = `${searchPath}/images/${imagePath}`;
    const { bucketName, objectName } = parseObjectPath(fullPath);
    const bucket = objectStorageClient.bucket(bucketName);
    const file = bucket.file(objectName);
    const [exists] = await file.exists();

    if (exists) {
      const [metadata] = await file.getMetadata();
      res.set({
        "Content-Type": metadata.contentType || "image/webp",
        "Cache-Control": "public, max-age=31536000, immutable",
      });
      file.createReadStream().pipe(res);
      return;
    }
  }

  res.status(404).json({ error: "Image not found" });
}
