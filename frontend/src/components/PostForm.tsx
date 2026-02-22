import { useState, useCallback } from "react";
import { useWriteContract, useWaitForTransactionReceipt, usePublicClient } from "wagmi";
import { keccak256, toBytes, parseAbiItem } from "viem";
import type { CSSProperties } from "react";
import { useZKP } from "../hooks/useZKP";
import { useIPFS } from "../hooks/useIPFS";
import { ipfsHashToBigInt } from "../utils/semaphore";
import contractData from "../contracts/AnonSocial.json";

const MAX_CHARS = 280;
const POST_SCOPE = BigInt(keccak256(toBytes("anon-social-post")));
const MEMBER_JOINED_EVENT = parseAbiItem("event MemberJoined(uint256 identityCommitment)");

type Step = "idle" | "joining" | "uploading" | "proving" | "sending" | "done" | "error";

const STEP_LABELS: Record<Step, string> = {
  idle: "",
  joining: "Joining group...",
  uploading: "Uploading to IPFS...",
  proving: "Generating ZK proof...",
  sending: "Sending transaction...",
  done: "Posted successfully",
  error: "Error",
};

async function ensureWalletAccess() {
  const ethereum = (window as Window & {
    ethereum?: { request: (args: { method: string }) => Promise<unknown> };
  }).ethereum;

  if (!ethereum) {
    throw new Error("MetaMask is not installed.");
  }

  await ethereum.request({ method: "eth_requestAccounts" });
}

export function PostForm() {
  const [content, setContent] = useState("");
  const [step, setStep] = useState<Step>("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [txHash, setTxHash] = useState<`0x${string}` | undefined>();

  const { generateProof, getCommitment } = useZKP();
  const { uploadToIPFS } = useIPFS();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();

  const configuredAddress =
    (import.meta.env.VITE_CONTRACT_ADDRESS as `0x${string}` | undefined) ||
    (contractData.address as `0x${string}`);

  const contractConfig = {
    address: configuredAddress,
    abi: contractData.abi,
  } as const;

  const { isLoading: isTxLoading } = useWaitForTransactionReceipt({ hash: txHash });
  const isSubmitting = step !== "idle" && step !== "done" && step !== "error";

  const loadCommitments = useCallback(async (): Promise<bigint[]> => {
    if (!publicClient) return [];

    const logs = await publicClient.getLogs({
      address: contractConfig.address,
      event: MEMBER_JOINED_EVENT,
      fromBlock: "earliest",
      toBlock: "latest",
    });

    const unique = new Set(logs.map((log) => log.args.identityCommitment).filter(Boolean));
    return [...unique] as bigint[];
  }, [publicClient, contractConfig.address]);

  const handleSubmit = useCallback(async () => {
    if (!content.trim()) return;
    if (!publicClient) {
      setErrorMsg("Wallet client not ready");
      setStep("error");
      return;
    }

    setStep("idle");
    setErrorMsg("");

    try {
      await ensureWalletAccess();

      setStep("joining");
      const commitment = await getCommitment();
      let commitments = await loadCommitments();

      const alreadyMember = commitments.some((member) => member === commitment);
      if (!alreadyMember) {
        const joinHash = await writeContractAsync({
          ...contractConfig,
          functionName: "joinGroup",
          args: [commitment],
        });

        await publicClient.waitForTransactionReceipt({ hash: joinHash });
        commitments = [...commitments, commitment];
      }

      setStep("uploading");
      const ipfsBytes32 = await uploadToIPFS(content);
      const message = ipfsHashToBigInt(ipfsBytes32);

      setStep("proving");
      const { contractArgs } = await generateProof(commitments, POST_SCOPE, message);
      const [depth, root, nullifier, points] = contractArgs;

      setStep("sending");
      const hash = await writeContractAsync({
        ...contractConfig,
        functionName: "postAnonymous",
        args: [depth, root, nullifier, ipfsBytes32, points],
      });
      setTxHash(hash);

      setContent("");
      setStep("done");
      setTimeout(() => setStep("idle"), 3000);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      setErrorMsg(msg);
      setStep("error");
    }
  }, [content, publicClient, getCommitment, loadCommitments, writeContractAsync, contractConfig, uploadToIPFS, generateProof]);

  const charsLeft = MAX_CHARS - content.length;
  const isOverLimit = charsLeft < 0;

  return (
    <div style={styles.card}>
      <div style={styles.header}>
        <span style={styles.anon}>Anonymous posting</span>
        <span style={styles.hint}>Protected by Semaphore ZK</span>
      </div>

      <textarea
        style={{
          ...styles.textarea,
          borderColor: isOverLimit ? "#f87171" : "#1e293b",
        }}
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="Write your anonymous post..."
        rows={4}
        maxLength={MAX_CHARS + 50}
        disabled={isSubmitting}
      />

      <div style={styles.footer}>
        <span
          style={{
            ...styles.counter,
            color: isOverLimit ? "#f87171" : charsLeft < 30 ? "#fbbf24" : "#475569",
          }}
        >
          {charsLeft}
        </span>

        <div style={styles.right}>
          {isSubmitting && <span style={styles.stepLabel}>{STEP_LABELS[step]}</span>}
          {step === "done" && <span style={styles.successLabel}>{STEP_LABELS.done}</span>}
          {step === "error" && (
            <span style={styles.errorLabel} title={errorMsg}>
              {STEP_LABELS.error}
            </span>
          )}
          <button
            style={{
              ...styles.btn,
              opacity: isSubmitting || isOverLimit || !content.trim() ? 0.5 : 1,
              cursor: isSubmitting || isOverLimit || !content.trim() ? "not-allowed" : "pointer",
            }}
            onClick={handleSubmit}
            disabled={isSubmitting || isOverLimit || !content.trim() || isTxLoading}
          >
            {isSubmitting ? "..." : "Post Anonymously"}
          </button>
        </div>
      </div>

      {step === "error" && errorMsg && <p style={styles.errorDetail}>{errorMsg}</p>}
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  card: {
    background: "#111827",
    border: "1px solid #1e293b",
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  anon: { fontWeight: 600, fontSize: 14, color: "#94a3b8" },
  hint: {
    fontSize: 11,
    color: "#334155",
    background: "#0f172a",
    padding: "2px 8px",
    borderRadius: 20,
    border: "1px solid #1e293b",
  },
  textarea: {
    width: "100%",
    background: "#0f172a",
    border: "1px solid #1e293b",
    borderRadius: 10,
    color: "#e2e8f0",
    fontSize: 15,
    lineHeight: 1.6,
    padding: "12px 14px",
    resize: "vertical",
    outline: "none",
    fontFamily: "inherit",
    transition: "border-color 0.2s",
  },
  footer: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 10,
  },
  counter: { fontSize: 13, fontVariantNumeric: "tabular-nums" },
  right: { display: "flex", alignItems: "center", gap: 10 },
  stepLabel: { fontSize: 12, color: "#22d3ee" },
  successLabel: { fontSize: 12, color: "#4ade80" },
  errorLabel: { fontSize: 12, color: "#f87171", cursor: "help" },
  btn: {
    background: "linear-gradient(135deg, #4ade80, #22d3ee)",
    color: "#000",
    fontWeight: 700,
    fontSize: 13,
    padding: "8px 18px",
    borderRadius: 20,
    border: "none",
    cursor: "pointer",
    transition: "opacity 0.2s",
  },
  errorDetail: {
    marginTop: 8,
    fontSize: 12,
    color: "#f87171",
    background: "#1c0a0a",
    padding: "8px 12px",
    borderRadius: 8,
    wordBreak: "break-all",
  },
};
