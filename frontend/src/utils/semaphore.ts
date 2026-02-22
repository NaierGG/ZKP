import { Identity, Group, generateProof as semGenerateProof } from "@semaphore-protocol/core";
import type { SemaphoreProof } from "@semaphore-protocol/core";

export { Identity, Group };
export type { SemaphoreProof };

export function createIdentityFromSignature(signature: string): Identity {
  return new Identity(signature);
}

export async function generateSemaphoreProof(
  identity: Identity,
  group: Group,
  scope: string | bigint,
  message: bigint
): Promise<SemaphoreProof> {
  return semGenerateProof(identity, group, message, scope);
}

export function ipfsHashToBigInt(hex: string): bigint {
  const normalized = hex.startsWith("0x") ? hex : `0x${hex}`;
  return BigInt(normalized);
}

export function proofToContractArgs(proof: SemaphoreProof): readonly [
  bigint,
  bigint,
  bigint,
  readonly [bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint],
] {
  const points = proof.points.map((value) => BigInt(value)) as unknown as readonly [
    bigint,
    bigint,
    bigint,
    bigint,
    bigint,
    bigint,
    bigint,
    bigint,
  ];

  return [
    BigInt(proof.merkleTreeDepth),
    BigInt(proof.merkleTreeRoot),
    BigInt(proof.nullifier),
    points,
  ];
}
