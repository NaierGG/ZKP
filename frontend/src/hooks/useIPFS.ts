import { useCallback } from "react";

const PINATA_API_URL = "https://api.pinata.cloud/pinning/pinJSONToIPFS";
const IPFS_GATEWAY = "https://gateway.pinata.cloud/ipfs";

interface PinataResponse {
  IpfsHash: string;
  PinSize: number;
  Timestamp: string;
}

interface PostContent {
  text: string;
  createdAt: string;
  version: string;
}

const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const BASE32_ALPHABET = "abcdefghijklmnopqrstuvwxyz234567";

function base58Decode(input: string): Uint8Array {
  if (input.length === 0) return new Uint8Array();

  let value = 0n;
  for (const ch of input) {
    const idx = BASE58_ALPHABET.indexOf(ch);
    if (idx === -1) throw new Error("Invalid base58 CID");
    value = value * 58n + BigInt(idx);
  }

  const bytes: number[] = [];
  while (value > 0n) {
    bytes.push(Number(value % 256n));
    value /= 256n;
  }
  bytes.reverse();

  let leadingZeroes = 0;
  for (const ch of input) {
    if (ch === "1") leadingZeroes += 1;
    else break;
  }

  return new Uint8Array([...new Array(leadingZeroes).fill(0), ...bytes]);
}

function base58Encode(bytes: Uint8Array): string {
  if (bytes.length === 0) return "";

  let value = 0n;
  for (const byte of bytes) {
    value = value * 256n + BigInt(byte);
  }

  let out = "";
  while (value > 0n) {
    const mod = Number(value % 58n);
    out = BASE58_ALPHABET[mod] + out;
    value /= 58n;
  }

  let leadingZeroes = 0;
  for (const byte of bytes) {
    if (byte === 0) leadingZeroes += 1;
    else break;
  }

  return "1".repeat(leadingZeroes) + (out || "1");
}

function base32Decode(input: string): Uint8Array {
  let bits = 0;
  let value = 0;
  const out: number[] = [];

  for (const ch of input.toLowerCase()) {
    const idx = BASE32_ALPHABET.indexOf(ch);
    if (idx === -1) throw new Error("Invalid base32 CID");

    value = (value << 5) | idx;
    bits += 5;

    while (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }

  return new Uint8Array(out);
}

function readVarint(bytes: Uint8Array, offset: number): { value: number; next: number } {
  let result = 0;
  let shift = 0;
  let i = offset;

  while (i < bytes.length) {
    const byte = bytes[i];
    result |= (byte & 0x7f) << shift;
    i += 1;

    if ((byte & 0x80) === 0) return { value: result, next: i };
    shift += 7;
  }

  throw new Error("Invalid CID varint");
}

function extractSha256DigestFromCid(cid: string): Uint8Array {
  if (cid.startsWith("Qm")) {
    const decoded = base58Decode(cid);
    if (decoded.length !== 34 || decoded[0] !== 0x12 || decoded[1] !== 0x20) {
      throw new Error("Unsupported CIDv0 multihash format");
    }
    return decoded.slice(2);
  }

  if (cid.startsWith("b")) {
    const decoded = base32Decode(cid.slice(1));
    let cursor = 0;

    const version = readVarint(decoded, cursor);
    cursor = version.next;
    if (version.value !== 1) throw new Error("Unsupported CID version");

    const codec = readVarint(decoded, cursor);
    cursor = codec.next;
    if (codec.value === 0) throw new Error("Invalid CID codec");

    const hashCode = readVarint(decoded, cursor);
    cursor = hashCode.next;
    const hashLen = readVarint(decoded, cursor);
    cursor = hashLen.next;

    if (hashCode.value !== 0x12 || hashLen.value !== 32) {
      throw new Error("Only sha2-256 32-byte CID is supported");
    }

    const digest = decoded.slice(cursor, cursor + hashLen.value);
    if (digest.length !== 32) throw new Error("Invalid CID digest length");
    return digest;
  }

  throw new Error("Unsupported CID format");
}

export function cidToBytes32(cid: string): `0x${string}` {
  const digest = extractSha256DigestFromCid(cid);
  return `0x${Array.from(digest)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")}` as `0x${string}`;
}

export function bytes32ToCid(hex: string): string {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  if (clean.length !== 64) throw new Error("Expected bytes32 hex value");

  const digest = new Uint8Array(clean.match(/.{2}/g)!.map((b) => parseInt(b, 16)));
  const multihash = new Uint8Array(34);
  multihash[0] = 0x12; // sha2-256
  multihash[1] = 0x20; // 32 bytes
  multihash.set(digest, 2);

  return base58Encode(multihash);
}

export function useIPFS() {
  const apiKey = import.meta.env.VITE_PINATA_API_KEY as string;
  const secretKey = import.meta.env.VITE_PINATA_SECRET_KEY as string;

  const uploadToIPFS = useCallback(
    async (content: string): Promise<`0x${string}`> => {
      if (!apiKey || !secretKey) {
        throw new Error(
          "Pinata API keys not configured. Set VITE_PINATA_API_KEY and VITE_PINATA_SECRET_KEY in frontend/.env"
        );
      }

      const body: PostContent = {
        text: content,
        createdAt: new Date().toISOString(),
        version: "1",
      };

      const response = await fetch(PINATA_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          pinata_api_key: apiKey,
          pinata_secret_api_key: secretKey,
        },
        body: JSON.stringify({
          pinataContent: body,
          pinataMetadata: { name: `anon-social-post-${Date.now()}` },
        }),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`IPFS upload failed: ${response.status} ${text}`);
      }

      const data: PinataResponse = await response.json();
      const bytes32 = cidToBytes32(data.IpfsHash);
      const roundTripCid = bytes32ToCid(bytes32);

      if (data.IpfsHash.startsWith("Qm") && roundTripCid !== data.IpfsHash) {
        throw new Error("CID conversion round-trip check failed");
      }

      return bytes32;
    },
    [apiKey, secretKey]
  );

  const fetchFromIPFS = useCallback(async (bytes32Hash: string): Promise<PostContent | null> => {
    try {
      const cid = bytes32ToCid(bytes32Hash);
      const response = await fetch(`${IPFS_GATEWAY}/${cid}`);
      if (!response.ok) return null;
      return (await response.json()) as PostContent;
    } catch {
      return null;
    }
  }, []);

  return { uploadToIPFS, fetchFromIPFS, cidToBytes32, bytes32ToCid };
}
