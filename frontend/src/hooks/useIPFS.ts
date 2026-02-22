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

/**
 * Convert an IPFS CID string to a bytes32 hex string.
 * We store a keccak256-like truncation for on-chain use.
 */
export function cidToBytes32(cid: string): `0x${string}` {
  // Encode the CID as UTF-8 bytes, then take first 32 bytes as hex
  const encoder = new TextEncoder();
  const bytes = encoder.encode(cid);
  const padded = new Uint8Array(32);
  padded.set(bytes.slice(0, 32));
  return (
    "0x" +
    Array.from(padded)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")
  ) as `0x${string}`;
}

/**
 * Decode a bytes32 hex string back to a CID string.
 */
export function bytes32ToCid(hex: string): string {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  const bytes = new Uint8Array(
    clean.match(/.{2}/g)!.map((b) => parseInt(b, 16))
  );
  const decoder = new TextDecoder();
  return decoder.decode(bytes).replace(/\0/g, "");
}

export function useIPFS() {
  const apiKey = import.meta.env.VITE_PINATA_API_KEY as string;
  const secretKey = import.meta.env.VITE_PINATA_SECRET_KEY as string;

  /**
   * Upload post content to IPFS via Pinata.
   * Returns the CID as a bytes32 hex string suitable for the contract.
   */
  const uploadToIPFS = useCallback(
    async (content: string): Promise<`0x${string}`> => {
      if (!apiKey || !secretKey) {
        throw new Error(
          "Pinata API keys not configured. Set VITE_PINATA_API_KEY and VITE_PINATA_SECRET_KEY in .env"
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
      return cidToBytes32(data.IpfsHash);
    },
    [apiKey, secretKey]
  );

  /**
   * Fetch post content from IPFS given a bytes32 hex hash.
   */
  const fetchFromIPFS = useCallback(
    async (bytes32Hash: string): Promise<PostContent | null> => {
      try {
        const cid = bytes32ToCid(bytes32Hash);
        if (!cid) return null;

        const response = await fetch(`${IPFS_GATEWAY}/${cid}`);
        if (!response.ok) return null;

        const data: PostContent = await response.json();
        return data;
      } catch {
        return null;
      }
    },
    []
  );

  return { uploadToIPFS, fetchFromIPFS, cidToBytes32, bytes32ToCid };
}
