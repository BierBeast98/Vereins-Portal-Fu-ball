/**
 * Test: BFV Vereinsspielplan abrufen und Spiele parsen.
 * Run: npx tsx script/test-bfv-pdf.ts
 */
import { config } from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: join(__dirname, "..", ".env") });

const clubId = "00ES8GNKJO000005VV0AG08LVUPGND5I";
const pdfUrl = `https://service.bfv.de/rest/pdfexport/vereinsspiele?id=${clubId}`;

async function main() {
  console.log("Fetching", pdfUrl);
  const res = await fetch(pdfUrl, {
    headers: { "User-Agent": "TSV-Greding-Test/1.0", Accept: "application/pdf, text/plain, */*" },
  });
  console.log("Status:", res.status, "Content-Type:", res.headers.get("content-type"));
  const buffer = Buffer.from(await res.arrayBuffer());
  console.log("Size:", buffer.length, "bytes, starts with PDF:", buffer.slice(0, 5).toString() === "%PDF-");

  let text = "";
  if (!buffer.slice(0, 5).toString().startsWith("%PDF-")) {
    text = buffer.toString("utf-8");
    console.log("Treated as text, length:", text.length);
  } else {
    try {
      const { PDFParse } = await import("pdf-parse");
      const parser = new PDFParse({ data: buffer });
      const result = await parser.getText();
      text = result?.text ?? "";
      await parser.destroy();
      console.log("PDFParse ok, text length:", text.length);
    } catch (e) {
      console.error("PDFParse failed:", (e as Error).message);
      process.exit(1);
    }
  }

  const { parsePDFText } = await import("../server/bfvImporter");
  const matches = parsePDFText(text, 120);
  console.log("Parsed matches:", matches.length);
  matches.slice(0, 5).forEach((m, i) => console.log(i + 1, m.startAt?.toISOString?.() ?? m.startAt, m.title));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
