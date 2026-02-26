/**
 * Parser tests for BFV importer (run with: npx tsx server/bfvImporter.test.ts)
 */

import {
  buildStableKey,
  pitchFromLocationText,
  parseICS,
  parseHTML,
} from "./bfvImporter";

const DEFAULT_DURATION = 120;

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

// ----- buildStableKey -----
const key1 = buildStableKey("Kreisliga", "TSV Greding", "SV Töging", "2026-02-27");
const key2 = buildStableKey("Kreisliga", "TSV Greding", "SV Töging", "2026-02-27");
assert(key1 === key2, "stable_key deterministic");
assert(key1.length === 32, "stable_key length 32");

// ----- pitchFromLocationText -----
assert(pitchFromLocationText("Sportanlage Greding, Platz 1") === "a-platz", "Platz 1 → a-platz");
assert(pitchFromLocationText("Platz 2 | Am Hallenbad") === "b-platz", "Platz 2 → b-platz");
assert(pitchFromLocationText("Auswärts Stadion XY") === null, "no Platz → null");
assert(pitchFromLocationText(null) === null, "null → null");

// ----- parseICS -----
const icsFixture = `
BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:bfv-123
SUMMARY:TSV Greding - SV Töging
DTSTART:20260227T190000
DTEND:20260227T210000
LOCATION:Sportanlage Greding, Platz 1
END:VEVENT
END:VCALENDAR
`;
const icsMatches = parseICS(icsFixture, DEFAULT_DURATION);
assert(icsMatches.length >= 1, "ICS yields at least one event");
assert(icsMatches[0].sourceId === "bfv-123" || icsMatches[0].title.includes("Greding"), "ICS UID or title");
assert(icsMatches[0].pitch === "a-platz", "ICS location → pitch A");

// ----- parseHTML -----
const htmlFixture = `
27.02.2026 /19:00 Uhr  TSV Greding  -  :  -  SV Töging Zum Spiel
Sportanlage Greding Am Hallenbad, Platz 2 | 91171 Greding
01.03.2026 /15:00 Uhr  TSV Greding II  -  :  -  SV Töging II Zum Spiel
Sportanlage Greding Am Hallenbad, Platz 1
`;
const htmlMatches = parseHTML(htmlFixture, DEFAULT_DURATION);
assert(htmlMatches.length >= 1, "HTML yields at least one event");
const first = htmlMatches[0];
assert(first.teamHome.includes("Greding") && first.teamAway.includes("Töging"), "HTML home/away");
assert(first.stableKey.length === 32, "HTML stableKey");

console.log("All parser tests passed.");
process.exit(0);
