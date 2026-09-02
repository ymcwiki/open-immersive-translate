const encoder = new TextEncoder();

function bytes(
  value: string | ArrayBuffer | Uint8Array,
): Uint8Array<ArrayBuffer> {
  if (typeof value === "string") return new Uint8Array(encoder.encode(value));
  return new Uint8Array(value instanceof Uint8Array ? value : value.slice(0));
}

export function hex(value: ArrayBuffer | Uint8Array): string {
  return Array.from(bytes(value), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

export async function sha256(value: string): Promise<ArrayBuffer> {
  return crypto.subtle.digest("SHA-256", encoder.encode(value));
}

export async function sha256Hex(value: string): Promise<string> {
  return hex(await sha256(value));
}

export async function hmac(
  algorithm: "SHA-1" | "SHA-256",
  key: string | ArrayBuffer | Uint8Array,
  value: string,
): Promise<ArrayBuffer> {
  const imported = await crypto.subtle.importKey(
    "raw",
    bytes(key),
    { name: "HMAC", hash: algorithm },
    false,
    ["sign"],
  );
  return crypto.subtle.sign("HMAC", imported, encoder.encode(value));
}

export async function hmacHex(
  algorithm: "SHA-1" | "SHA-256",
  key: string | ArrayBuffer | Uint8Array,
  value: string,
): Promise<string> {
  return hex(await hmac(algorithm, key, value));
}

export function base64(value: ArrayBuffer): string {
  let binary = "";
  for (const byte of new Uint8Array(value)) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function rotateLeft(value: number, amount: number): number {
  return (value << amount) | (value >>> (32 - amount));
}

function add(...values: number[]): number {
  return values.reduce((sum, value) => (sum + value) | 0, 0);
}

/** Small UTF-8 MD5 implementation for Baidu's legacy signing scheme. */
export function md5(value: string): string {
  const input = Array.from(encoder.encode(value));
  const bitLength = input.length * 8;
  input.push(0x80);
  while (input.length % 64 !== 56) input.push(0);
  for (let index = 0; index < 8; index += 1) {
    input.push(index < 4 ? (bitLength >>> (index * 8)) & 0xff : 0);
  }

  let a0 = 0x67452301;
  let b0 = 0xefcdab89;
  let c0 = 0x98badcfe;
  let d0 = 0x10325476;
  const shifts = [7, 12, 17, 22, 5, 9, 14, 20, 4, 11, 16, 23, 6, 10, 15, 21];
  const constants = Array.from(
    { length: 64 },
    (_, index) => Math.floor(Math.abs(Math.sin(index + 1)) * 2 ** 32) | 0,
  );

  for (let offset = 0; offset < input.length; offset += 64) {
    const words = Array.from({ length: 16 }, (_, index) => {
      const start = offset + index * 4;
      return (
        (input[start] ?? 0) |
        ((input[start + 1] ?? 0) << 8) |
        ((input[start + 2] ?? 0) << 16) |
        ((input[start + 3] ?? 0) << 24)
      );
    });
    let a = a0;
    let b = b0;
    let c = c0;
    let d = d0;
    for (let index = 0; index < 64; index += 1) {
      let f: number;
      let word: number;
      if (index < 16) {
        f = (b & c) | (~b & d);
        word = index;
      } else if (index < 32) {
        f = (d & b) | (~d & c);
        word = (5 * index + 1) % 16;
      } else if (index < 48) {
        f = b ^ c ^ d;
        word = (3 * index + 5) % 16;
      } else {
        f = c ^ (b | ~d);
        word = (7 * index) % 16;
      }
      const shift = shifts[Math.floor(index / 16) * 4 + (index % 4)] ?? 0;
      const next = d;
      d = c;
      c = b;
      b = add(
        b,
        rotateLeft(add(a, f, constants[index] ?? 0, words[word] ?? 0), shift),
      );
      a = next;
    }
    a0 = add(a0, a);
    b0 = add(b0, b);
    c0 = add(c0, c);
    d0 = add(d0, d);
  }

  return [a0, b0, c0, d0]
    .flatMap((word) => [0, 8, 16, 24].map((shift) => (word >>> shift) & 0xff))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function percentEncode(value: string): string {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}
