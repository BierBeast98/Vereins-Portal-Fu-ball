import sharp from "sharp";
import { randomUUID } from "crypto";
import { and, eq } from "drizzle-orm";
import type { Response } from "express";
import { db } from "./db";
import { productImagesTable } from "@shared/schema";

interface ProcessedImage {
  thumbnail: string;
  medium: string;
  original: string;
}

type Variant = "thumb" | "medium" | "original";

const CONTENT_TYPE = "image/webp";

function parseFilename(filename: string): { id: string; variant: Variant } | null {
  const match = filename.match(/^([0-9a-f-]{36})-(thumb|medium|original)\.webp$/i);
  if (!match) return null;
  return { id: match[1], variant: match[2] as Variant };
}

export async function processAndUploadImage(
  fileBuffer: Buffer,
  _originalName: string,
): Promise<ProcessedImage> {
  const id = randomUUID();

  let sharpInstance;
  try {
    sharpInstance = sharp(fileBuffer).rotate();
    await sharpInstance.metadata();
  } catch {
    throw new Error("Ungültige Bilddatei. Die Datei konnte nicht verarbeitet werden.");
  }

  const [thumbBuf, mediumBuf, originalBuf] = await Promise.all([
    sharpInstance.clone().resize(200, 200, { fit: "cover" }).webp({ quality: 80 }).toBuffer(),
    sharpInstance.clone().resize(600, 600, { fit: "inside", withoutEnlargement: true }).webp({ quality: 85 }).toBuffer(),
    sharpInstance.clone().resize(1200, 1200, { fit: "inside", withoutEnlargement: true }).webp({ quality: 90 }).toBuffer(),
  ]);

  await db.insert(productImagesTable).values([
    { id, variant: "thumb", contentType: CONTENT_TYPE, data: thumbBuf },
    { id, variant: "medium", contentType: CONTENT_TYPE, data: mediumBuf },
    { id, variant: "original", contentType: CONTENT_TYPE, data: originalBuf },
  ]);

  return {
    thumbnail: `/api/images/${id}-thumb.webp`,
    medium: `/api/images/${id}-medium.webp`,
    original: `/api/images/${id}-original.webp`,
  };
}

export async function serveImage(
  imagePath: string,
  res: Response,
): Promise<void> {
  const parsed = parseFilename(imagePath);
  if (!parsed) {
    res.status(404).json({ error: "Image not found" });
    return;
  }

  const rows = await db
    .select()
    .from(productImagesTable)
    .where(and(eq(productImagesTable.id, parsed.id), eq(productImagesTable.variant, parsed.variant)))
    .limit(1);

  const row = rows[0];
  if (!row) {
    res.status(404).json({ error: "Image not found" });
    return;
  }

  res.set({
    "Content-Type": row.contentType,
    "Content-Length": String(row.data.length),
    "Cache-Control": "public, max-age=31536000, immutable",
  });
  res.send(row.data);
}
