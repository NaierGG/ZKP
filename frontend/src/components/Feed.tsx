import { useState, useEffect, useCallback } from "react";
import { useWatchContractEvent, useWriteContract, usePublicClient } from "wagmi";
import { useZKP } from "../hooks/useZKP";
import { useIPFS } from "../hooks/useIPFS";
import { ipfsHashToBigInt } from "../utils/semaphore";
import contractData from "../contracts/AnonSocial.json";

interface Post {
  id: string; // ipfsHash as bytes32
  content: string;
  timestamp: number;
  votes: number;
}

type VoteStep = "idle" | "proving" | "sending";

export function Feed() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [voteStep, setVoteStep] = useState<Record<string, VoteStep>>({});
  const [loading, setLoading] = useState(true);

  const { fetchFromIPFS } = useIPFS();
  const { generateProof, getCommitment } = useZKP();
  const { writeContractAsync } = useWriteContract();
  const publicClient = usePublicClient();

  const contractConfig = {
    address: contractData.address as `0x${string}`,
    abi: contractData.abi,
  } as const;

  // ── Resolve IPFS content ─────────────────────────────────────────────────
  const resolvePost = useCallback(
    async (ipfsHash: string, timestamp: number): Promise<Post | null> => {
      const content = await fetchFromIPFS(ipfsHash);
      if (!content) return null;
      return {
        id: ipfsHash,
        content: content.text,
        timestamp,
        votes: 0,
      };
    },
    [fetchFromIPFS]
  );

  // ── Load historical events on mount ─────────────────────────────────────
  useEffect(() => {
    if (!publicClient) return;

    (async () => {
      setLoading(true);
      try {
        const logs = await publicClient.getLogs({
          address: contractData.address as `0x${string}`,
          event: {
            type: "event",
            name: "PostCreated",
            inputs: [
              { type: "bytes32", name: "ipfsHash", indexed: true },
              { type: "uint256", name: "timestamp", indexed: false },
            ],
          },
          fromBlock: "earliest",
          toBlock: "latest",
        });

        const resolved = await Promise.all(
          logs.map((log) =>
            resolvePost(
              log.topics[1] as string,
              Number((log as unknown as { args: { timestamp: bigint } }).args?.timestamp ?? 0n)
            )
          )
        );

        setPosts(resolved.filter(Boolean).reverse() as Post[]);
      } catch (err) {
        console.error("Failed to load posts:", err);
      } finally {
        setLoading(false);
      }
    })();
  }, [publicClient, resolvePost]);

  // ── Watch for new posts in real time ────────────────────────────────────
  useWatchContractEvent({
    ...contractConfig,
    eventName: "PostCreated",
    onLogs: async (logs) => {
      for (const log of logs) {
        const { ipfsHash, timestamp } = log.args as {
          ipfsHash: `0x${string}`;
          timestamp: bigint;
        };
        const post = await resolvePost(ipfsHash, Number(timestamp));
        if (post) {
          setPosts((prev) => [post, ...prev]);
        }
      }
    },
  });

  // ── Watch for votes ──────────────────────────────────────────────────────
  useWatchContractEvent({
    ...contractConfig,
    eventName: "VoteCast",
    onLogs: (logs) => {
      for (const log of logs) {
        const { postId, upvote } = log.args as {
          postId: `0x${string}`;
          upvote: boolean;
        };
        setPosts((prev) =>
          prev.map((p) =>
            p.id === postId
              ? { ...p, votes: p.votes + (upvote ? 1 : -1) }
              : p
          )
        );
      }
    },
  });

  // ── Vote handler ─────────────────────────────────────────────────────────
  const handleVote = useCallback(
    async (postId: string, upvote: boolean) => {
      if (voteStep[postId]) return; // already voting

      setVoteStep((s) => ({ ...s, [postId]: "proving" }));

      try {
        const commitment = await getCommitment();
        const message = BigInt(
          `0x${Buffer.from(
            new Uint8Array([...new TextEncoder().encode(postId + String(upvote))]).slice(0, 32)
          ).toString("hex").padEnd(64, "0")}`
        );

        const { contractArgs } = await generateProof(
          [commitment],
          `anon-social-vote-${postId}`,
          message
        );
        const [depth, root, nullifier, points] = contractArgs;

        setVoteStep((s) => ({ ...s, [postId]: "sending" }));

        await writeContractAsync({
          ...contractConfig,
          functionName: "voteAnonymous",
          args: [depth, root, nullifier, postId as `0x${string}`, upvote, points],
        });
      } catch (err) {
        console.error("Vote failed:", err);
      } finally {
        setVoteStep((s) => ({ ...s, [postId]: "idle" }));
      }
    },
    [voteStep, getCommitment, generateProof, writeContractAsync, contractConfig]
  );

  // ── Render ───────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={styles.loading}>
        <span style={styles.spinner}>⏳</span>
        <span>게시글을 불러오는 중...</span>
      </div>
    );
  }

  if (posts.length === 0) {
    return (
      <div style={styles.empty}>
        <div style={styles.emptyIcon}>📭</div>
        <p>아직 게시글이 없습니다. 첫 번째로 익명 글을 남겨보세요!</p>
      </div>
    );
  }

  return (
    <div style={styles.feed}>
      {posts.map((post) => (
        <PostCard
          key={post.id}
          post={post}
          onVote={handleVote}
          voteStep={voteStep[post.id] ?? "idle"}
        />
      ))}
    </div>
  );
}

// ── PostCard ─────────────────────────────────────────────────────────────────
interface PostCardProps {
  post: Post;
  onVote: (postId: string, upvote: boolean) => void;
  voteStep: VoteStep;
}

function PostCard({ post, onVote, voteStep }: PostCardProps) {
  const date = new Date(post.timestamp * 1000);
  const timeStr = isNaN(date.getTime())
    ? "방금 전"
    : date.toLocaleString("ko-KR", {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });

  const isVoting = voteStep !== "idle";

  return (
    <article style={styles.card}>
      <div style={styles.meta}>
        <span style={styles.author}>익명 사용자</span>
        <span style={styles.time}>• {timeStr}</span>
        <span style={styles.zkBadge}>🔒 ZK</span>
      </div>
      <p style={styles.content}>{post.content}</p>
      <div style={styles.actions}>
        <button
          style={styles.voteBtn}
          onClick={() => onVote(post.id, true)}
          disabled={isVoting}
          title="익명 좋아요"
        >
          {isVoting && voteStep === "proving" ? "🔐" : isVoting ? "⏳" : "👍"}
          <span>{post.votes > 0 ? `+${post.votes}` : post.votes < 0 ? post.votes : ""}</span>
        </button>
        <button
          style={{ ...styles.voteBtn, ...styles.downBtn }}
          onClick={() => onVote(post.id, false)}
          disabled={isVoting}
          title="익명 싫어요"
        >
          👎
        </button>
      </div>
    </article>
  );
}

const styles: Record<string, React.CSSProperties> = {
  feed: { display: "flex", flexDirection: "column", gap: 12 },
  loading: { textAlign: "center", padding: 40, color: "#475569", display: "flex", flexDirection: "column", gap: 12, alignItems: "center" },
  spinner: { fontSize: 32, animation: "spin 1s linear infinite" },
  empty: { textAlign: "center", padding: "60px 20px", color: "#334155" },
  emptyIcon: { fontSize: 48, marginBottom: 16 },
  card: {
    background: "#111827",
    border: "1px solid #1e293b",
    borderRadius: 14,
    padding: "16px 18px",
    transition: "border-color 0.2s",
  },
  meta: { display: "flex", alignItems: "center", gap: 8, marginBottom: 10 },
  author: { fontWeight: 600, fontSize: 13, color: "#64748b" },
  time: { fontSize: 12, color: "#334155" },
  zkBadge: {
    marginLeft: "auto",
    fontSize: 10,
    background: "#0f172a",
    border: "1px solid #1e293b",
    borderRadius: 20,
    padding: "1px 6px",
    color: "#4ade80",
  },
  content: { color: "#e2e8f0", fontSize: 15, lineHeight: 1.7, whiteSpace: "pre-wrap", wordBreak: "break-word" },
  actions: { display: "flex", gap: 8, marginTop: 12, alignItems: "center" },
  voteBtn: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    background: "#0f172a",
    border: "1px solid #1e293b",
    borderRadius: 20,
    padding: "4px 12px",
    color: "#94a3b8",
    fontSize: 13,
    cursor: "pointer",
    transition: "background 0.2s",
  },
  downBtn: {},
};
