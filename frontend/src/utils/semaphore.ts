import { Identity, Group, generateProof as semGenerateProof } from "@semaphore-protocol/core";
import type { SemaphoreProof } from "@semaphore-protocol/core";

export { Identity, Group };
export type { SemaphoreProof };

/**
 * Create a deterministic Semaphore Identity from a wallet signature.
 * The signature acts as the secret — never expose it.
 */
export function createIdentityFromSignature(signature: string): Identity {
  return new Identity(signature);
}

/**
 * Build a Semaphore proof for a given group, scope, and message.
 *
 * @param identity   - Semaphore identity
 * @param group      - Semaphore group containing member commitments
 * @param scope      - Unique context string (prevents cross-context replay)
 * @param message    - Signal / message to prove knowledge of (e.g. ipfsHash as bigint)
 * @returns          SemaphoreProof ready for contract submission
 */
export async function generateSemaphoreProof(
  identity: Identity,
  group: Group,
  scope: string,
  message: bigint
): Promise<SemaphoreProof> {
  const proof = await semGenerateProof(identity, group, message, scope);
  return proof;
}

/**
 * Convert an IPFS CIDv0 / hex string to a bytes32-compatible bigint for use
 * as the Semaphore message field.
 */
export function ipfsHashToBigInt(hex: string): bigint {
  // Pinata returns a hex string prefixed with 0x or without
  const normalised = hex.startsWith("0x") ? hex : `0x${hex}`;
  return BigInt(normalised);
}

/**
 * Convert a Semaphore SemaphoreProof's points array into the uint256[8] format
 * expected by the Solidity contract.
 */
export function proofToContractArgs(proof: SemaphoreProof): readonly [
  bigint, // merkleTreeDepth
  bigint, // merkleTreeRoot
  bigint, // nullifier
  readonly [bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint], // points
] {
  return [
    BigInt(proof.merkleTreeDepth),
    BigInt(proof.merkleTreeRoot),
    BigInt(proof.nullifier),
    proof.points as readonly [bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint],
  ];
}
