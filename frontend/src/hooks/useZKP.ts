import { useState, useCallback } from "react";
import { useAccount, useSignMessage } from "wagmi";
import {
  Identity,
  Group,
  createIdentityFromSignature,
  generateSemaphoreProof,
  proofToContractArgs,
} from "../utils/semaphore";
import type { SemaphoreProof } from "../utils/semaphore";

const ZK_SIGN_MESSAGE =
  "Sign this message to generate your AnonSocial ZK identity.\n\nThis signature is your private key; never share it.";

interface ZKPState {
  identity: Identity | null;
  isGeneratingIdentity: boolean;
  isGeneratingProof: boolean;
  error: string | null;
}

interface GeneratedProof {
  semaphoreProof: SemaphoreProof;
  contractArgs: ReturnType<typeof proofToContractArgs>;
}

export function useZKP() {
  const { address } = useAccount();
  const { signMessageAsync } = useSignMessage();

  const [state, setState] = useState<ZKPState>({
    identity: null,
    isGeneratingIdentity: false,
    isGeneratingProof: false,
    error: null,
  });

  const generateIdentity = useCallback(async (): Promise<Identity> => {
    if (state.identity) return state.identity;
    if (!address) throw new Error("Wallet not connected");

    setState((s) => ({ ...s, isGeneratingIdentity: true, error: null }));

    try {
      const signature = await signMessageAsync({ message: ZK_SIGN_MESSAGE });
      const identity = createIdentityFromSignature(signature);
      setState((s) => ({ ...s, identity, isGeneratingIdentity: false }));
      return identity;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to generate identity";
      setState((s) => ({ ...s, isGeneratingIdentity: false, error: message }));
      throw err;
    }
  }, [address, signMessageAsync, state.identity]);

  const generateProof = useCallback(
    async (
      groupMembers: bigint[],
      scope: string | bigint,
      message: bigint
    ): Promise<GeneratedProof> => {
      setState((s) => ({ ...s, isGeneratingProof: true, error: null }));

      try {
        const identity = await generateIdentity();
        const group = new Group(groupMembers);
        const semaphoreProof = await generateSemaphoreProof(identity, group, scope, message);
        const contractArgs = proofToContractArgs(semaphoreProof);

        setState((s) => ({ ...s, isGeneratingProof: false }));
        return { semaphoreProof, contractArgs };
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to generate proof";
        setState((s) => ({ ...s, isGeneratingProof: false, error: message }));
        throw err;
      }
    },
    [generateIdentity]
  );

  const getCommitment = useCallback(async (): Promise<bigint> => {
    const identity = await generateIdentity();
    return identity.commitment;
  }, [generateIdentity]);

  return {
    identity: state.identity,
    isGeneratingIdentity: state.isGeneratingIdentity,
    isGeneratingProof: state.isGeneratingProof,
    error: state.error,
    generateIdentity,
    generateProof,
    getCommitment,
  };
}
