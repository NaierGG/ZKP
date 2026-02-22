import { useState, useCallback } from "react";
import { useWriteContract, useWaitForTransactionReceipt, useReadContract } from "wagmi";
import { useZKP } from "../hooks/useZKP";
import { useIPFS } from "../hooks/useIPFS";
import { ipfsHashToBigInt } from "../utils/semaphore";
import contractData from "../contracts/AnonSocial.json";

const MAX_CHARS = 280;

type Step = "idle" | "joining" | "uploading" | "proving" | "sending" | "done" | "error";

const STEP_LABELS: Record<Step, string> = {
  idle: "",
  joining: "🔑 그룹에 참여 중...",
  uploading: "📡 IPFS에 업로드 중...",
  proving: "🔐 ZK Proof 생성 중...",
  sending: "📨 트랜잭션 전송 중...",
  done: "✅ 게시 완료!",
  error: "❌ 오류 발생",
};

export function PostForm() {
  const [content, setContent] = useState("");
  const [step, setStep] = useState<Step>("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [txHash, setTxHash] = useState<`0x${string}` | undefined>();

  const { generateProof, getCommitment, isGeneratingIdentity } = useZKP();
  const { uploadToIPFS } = useIPFS();

  const { writeContractAsync } = useWriteContract();

  // Fetch current group members (MemberJoined events via contract reads would be ideal;
  // here we read the groupId and trust the ZK proof builder)
  const { data: groupId } = useReadContract({
    address: contractData.address as `0x${string}`,
    abi: contractData.abi,
    functionName: "groupId",
  });

  const { isLoading: isTxLoading } = useWaitForTransactionReceipt({ hash: txHash });

  const isSubmitting = step !== "idle" && step !== "done" && step !== "error";

  const handleSubmit = useCallback(async () => {
    if (!content.trim()) return;

    setStep("idle");
    setErrorMsg("");

    try {
      // Step 1 – Join group (register identity commitment on-chain if not yet done)
      setStep("joining");
      const commitment = await getCommitment();
      await writeContractAsync({
        address: contractData.address as `0x${string}`,
        abi: contractData.abi,
        functionName: "joinGroup",
        args: [commitment],
      }).catch((e) => {
        // Ignore "already member" reverts
        if (!e.message?.includes("already")) throw e;
      });

      // Step 2 – Upload content to IPFS
      setStep("uploading");
      const ipfsBytes32 = await uploadToIPFS(content);
      const message = ipfsHashToBigInt(ipfsBytes32);

      // Step 3 – Generate ZKP
      setStep("proving");
      // For demo we pass commitment as the only group member;
      // in production you'd fetch all commitments from MemberJoined events
      const { contractArgs } = await generateProof(
        [commitment],
        "anon-social-post",
        message
      );
      const [depth, root, nullifier, points] = contractArgs;

      // Step 4 – Send transaction
      setStep("sending");
      const hash = await writeContractAsync({
        address: contractData.address as `0x${string}`,
        abi: contractData.abi,
        functionName: "postAnonymous",
        args: [depth, root, nullifier, ipfsBytes32, points],
      });
      setTxHash(hash);

      setContent("");
      setStep("done");
      setTimeout(() => setStep("idle"), 4000);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "알 수 없는 오류";
      setErrorMsg(msg);
      setStep("error");
    }
  }, [content, getCommitment, generateProof, uploadToIPFS, writeContractAsync, groupId]);

  const charsLeft = MAX_CHARS - content.length;
  const isOverLimit = charsLeft < 0;

  return (
    <div style={styles.card}>
      <div style={styles.header}>
        <span style={styles.anon}>🕵️ 익명 사용자</span>
        <span style={styles.hint}>ZK 신원으로 보호됨</span>
      </div>

      <textarea
        style={{
          ...styles.textarea,
          borderColor: isOverLimit ? "#f87171" : "#1e293b",
        }}
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="무슨 생각을 하고 계신가요? 완전한 익명으로 공유하세요..."
        rows={4}
        maxLength={MAX_CHARS + 50}
        disabled={isSubmitting}
      />

      <div style={styles.footer}>
        <span style={{ ...styles.counter, color: isOverLimit ? "#f87171" : charsLeft < 30 ? "#fbbf24" : "#475569" }}>
          {charsLeft}
        </span>

        <div style={styles.right}>
          {isSubmitting && (
            <span style={styles.stepLabel}>{STEP_LABELS[step]}</span>
          )}
          {step === "done" && (
            <span style={styles.successLabel}>{STEP_LABELS.done}</span>
          )}
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
            {isSubmitting ? "..." : "익명 게시"}
          </button>
        </div>
      </div>

      {step === "error" && errorMsg && (
        <p style={styles.errorDetail}>{errorMsg}</p>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
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
  stepLabel: { fontSize: 12, color: "#22d3ee", animation: "pulse 1.5s infinite" },
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
