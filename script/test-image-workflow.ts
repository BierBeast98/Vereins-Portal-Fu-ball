/** Local-only regression check for the sharp/Drizzle security upgrades. */
import "dotenv/config";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { once } from "node:events";
import express from "express";
import pg from "pg";
import sharp from "sharp";

const url = new URL(process.env.DATABASE_URL ?? "");
assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(url.hostname), "Only local PostgreSQL is allowed");
const control = new pg.Pool({ connectionString: url.toString() });
const schema = `image_test_${randomBytes(8).toString("hex")}`;
await control.query(`CREATE SCHEMA ${schema}`);
url.searchParams.set("options", `-c search_path=${schema}`);
process.env.DATABASE_URL = url.toString();
let database: typeof import("../server/db").db | undefined;
let server: ReturnType<ReturnType<typeof express>["listen"]> | undefined;
try {
  database = (await import("../server/db")).db;
  await database.$client.query(`CREATE TABLE product_images (
    id VARCHAR(36) NOT NULL, variant VARCHAR(20) NOT NULL,
    content_type VARCHAR(100) NOT NULL, data BYTEA NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT now(), UNIQUE (id, variant)
  )`);
  const { processAndUploadImage, serveImage } = await import("../server/imageUpload");
  const app = express();
  app.get("/api/images/:filename", (req, res, next) => {
    void serveImage(req.params.filename, res).catch(next);
  });
  server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}`;
  const source = sharp({ create: { width: 1600, height: 800, channels: 3, background: "#159447" } });
  const inputs = [
    await source.clone().png().toBuffer(),
    await source.clone().jpeg().toBuffer(),
    await source.clone().webp().toBuffer(),
    Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="800"><rect width="1600" height="800" fill="green"/></svg>'),
  ];
  for (const input of inputs) {
    const images = await processAndUploadImage(input, "fixture");
    for (const [variant, dimensions] of Object.entries({ thumbnail: [200, 200], medium: [600, 300], original: [1200, 600] })) {
      const response = await fetch(base + images[variant as keyof typeof images]);
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("content-type"), "image/webp");
      assert.match(response.headers.get("cache-control") ?? "", /immutable/);
      const metadata = await sharp(Buffer.from(await response.arrayBuffer())).metadata();
      assert.deepEqual([metadata.width, metadata.height], dimensions);
    }
  }
  await assert.rejects(processAndUploadImage(Buffer.from("not an image"), "invalid.png"), /Ungültige Bilddatei/);
  assert.equal((await database.$client.query("SELECT count(*) FROM product_images")).rows[0].count, "12");
  assert.equal((await fetch(`${base}/api/images/invalid.webp`)).status, 404);
  assert.equal((await fetch(`${base}/api/images/00000000-0000-0000-0000-000000000000-thumb.webp`)).status, 404);
  console.log("Image workflow passed: PNG/JPEG/WebP/SVG, all sizes, database roundtrip, cache headers, invalid input and missing images.");
} finally {
  server?.closeAllConnections();
  if (server?.listening) await new Promise<void>((resolve, reject) => server!.close(error => error ? reject(error) : resolve()));
  await database?.$client.end();
  await control.query(`DROP SCHEMA ${schema} CASCADE`);
  await control.end();
}
