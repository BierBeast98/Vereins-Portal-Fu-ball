import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";

const CURRENT = { N: 32768, r: 8, p: 3 } as const;
const MAX_MEMORY = 64 * 1024 * 1024;
type ParsedHash = { salt: string; key: Buffer; N: number; r: number; p: number };

// Accept only known bounded profiles, rather than trusting work factors from storage.
function parseHash(value: string): ParsedHash | null {
  if (value.length > 255) return null;
  const current = /^scrypt\$v1\$32768\$8\$3\$([a-f0-9]{32})\$([a-f0-9]{128})$/.exec(value);
  if (current && current[0] === value) return { salt: current[1], key: Buffer.from(current[2], "hex"), ...CURRENT };
  const legacy = /^scrypt:([a-f0-9]{32}):([a-f0-9]{128})$/.exec(value);
  if (legacy && legacy[0] === value) return { salt: legacy[1], key: Buffer.from(legacy[2], "hex"), N: 16384, r: 8, p: 1 };
  return null;
}

function derive(password: string, salt: string, profile: { N: number; r: number; p: number }): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, 64, { N: profile.N, r: profile.r, p: profile.p, maxmem: MAX_MEMORY }, (error, key) => error ? reject(error) : resolve(key));
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const key = await derive(password, salt, CURRENT);
  return `scrypt$v1$${CURRENT.N}$${CURRENT.r}$${CURRENT.p}$${salt}$${key.toString("hex")}`;
}

export async function verifyPassword(password: string, encoded: string | null | undefined): Promise<boolean> {
  if (typeof password !== "string" || Buffer.byteLength(password, "utf8") > 1024) return false;
  if (typeof encoded !== "string") return false;
  const parsed = parseHash(encoded);
  if (!parsed) return false;
  try {
    const actual = await derive(password, parsed.salt, parsed);
    return timingSafeEqual(actual, parsed.key);
  } catch {
    return false;
  }
}

export function isPasswordHash(value: string): boolean {
  return parseHash(value) !== null;
}

export function passwordVersion(encoded: string): string {
  return createHash("sha256").update(encoded).digest("hex");
}
