import { useState, useEffect, useCallback } from "react";
import { useWatchContractEvent, useWriteContract, usePublicClient } from "wagmi";
import { encodePacked, keccak256, parseAbiItem } from "viem";
import type { CSSProperties } from "react";
import { useZKP } from "../hooks/useZKP";
import { useIPFS } from "../hooks/useIPFS";
import contractData from "../contracts/AnonSocial.json";

interface Post {
  id: `0x${string}`;
  content: string;
  timestamp: number;
  votes: number;
}

type VoteStep = "idle" | "proving" | "sending";

const POST_CREATED_EVENT = parseAbiItem(
  "event PostCreated(bytes32 indexed ipfsHash, uint256 timestamp)"
);
const MEMBER_JOINED_EVENT = parseAbiItem(
  "event MemberJoined(uint256 identityCommitment)"
);

export function Feed() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [voteStep, setVoteStep] = useState<Record<string, VoteStep>>({});
  const [loading, setLoading] = useState(true);

  const { fetchFromIPFS } = useIPFS();
  const { generateProof } = useZKP();
  const { writeContractAsync } = useWriteContract();
  const publicClient = usePublicClient();

  const configuredAddress =
    (import.meta.env.VITE_CONTRACT_ADDRESS as `0x${string}` | undefined) ||
    (contractData.address as `0x${string}`);

  const contractConfig = {
    address: configuredAddress,
    abi: contractData.abi,
  } as const;

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

  const resolvePost = useCallback(
    async (ipfsHash: `0x${string}`, timestamp: number): Promise<Post | null> => {
      const content = await fetchFromIPFS(ipfsHash);
      if (!content) return null;

      let votes = 0;
      if (publicClient) {
        try {
          const onchainVotes = await publicClient.readContract({
            ...contractConfig,
            functionName: "getVotes",
            args: [ipfsHash],
          });
          votes = Number(onchainVotes);
        } catch {
          votes = 0;
        }
      }

      return {
        id: ipfsHash,
        content: content.text,
        timestamp,
        votes,
      };
    },
    [fetchFromIPFS, publicClient, contractConfig]
  );

  useEffect(() => {
    if (!publicClient) return;

    void (async () => {
      setLoading(true);
      try {
        const logs = await publicClient.getLogs({
          address: contractConfig.address,
          event: POST_CREATED_EVENT,
          fromBlock: "earliest",
          toBlock: "latest",
        });

        const resolved = await Promise.all(
          logs.map((log) =>
            resolvePost(log.args.ipfsHash as `0x${string}`, Number(log.args.timestamp ?? 0n))
          )
        );

        setPosts(resolved.filter(Boolean).reverse() as Post[]);
      } catch (err) {
        console.error("Failed to load posts:", err);
      } finally {
        setLoading(false);
      }
    })();
  }, [publicClient, resolvePost, contractConfig.address]);

  useWatchContractEvent({
    ...contractConfig,
    eventName: "PostCreated",
    onLogs: async (logs) => {
      for (const log of logs as unknown as Array<{ args: { ipfsHash: `0x${string}`; timestamp: bigint } }>) {
        const ipfsHash = log.args.ipfsHash;
        const timestamp = Number(log.args.timestamp ?? 0n);
        const post = await resolvePost(ipfsHash, timestamp);
        if (post) {
          setPosts((prev) => [post, ...prev]);
        }
      }
    },
  });

  useWatchContractEvent({
    ...contractConfig,
    eventName: "VoteCast",
    onLogs: (logs) => {
      for (const log of logs as unknown as Array<{ args: { postId: `0x${string}`; upvote: boolean } }>) {
        const postId = log.args.postId;
        const upvote = Boolean(log.args.upvote);
        setPosts((prev) =>
          prev.map((p) =>
            p.id === postId ? { ...p, votes: p.votes + (upvote ? 1 : -1) } : p
          )
        );
      }
    },
  });

  const handleVote = useCallback(
    async (postId: `0x${string}`, upvote: boolean) => {
      if (voteStep[postId] && voteStep[postId] !== "idle") return;

      setVoteStep((s) => ({ ...s, [postId]: "proving" }));

      try {
        const commitments = await loadCommitments();
        if (commitments.length === 0) {
          throw new Error("No group members found. Join the group first.");
        }

        const message = BigInt(
          keccak256(encodePacked(["bytes32", "bool"], [postId, upvote]))
        );
        const scope = BigInt(
          keccak256(encodePacked(["string", "bytes32"], ["anon-social-vote", postId]))
        );

        const { contractArgs } = await generateProof(commitments, scope, message);
        const [depth, root, nullifier, points] = contractArgs;

        setVoteStep((s) => ({ ...s, [postId]: "sending" }));

        await writeContractAsync({
          ...contractConfig,
          functionName: "voteAnonymous",
          args: [depth, root, nullifier, postId, upvote, points],
        });
      } catch (err) {
        console.error("Vote failed:", err);
      } finally {
        setVoteStep((s) => ({ ...s, [postId]: "idle" }));
      }
    },
    [voteStep, loadCommitments, generateProof, writeContractAsync, contractConfig]
  );

  if (loading) {
    return (
      <div style={styles.loading}>
        <span>Loading posts...</span>
      </div>
    );
  }

  if (posts.length === 0) {
    return (
      <div style={styles.empty}>
        <p>No posts yet. Be the first anonymous poster.</p>
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

interface PostCardProps {
  post: Post;
  onVote: (postId: `0x${string}`, upvote: boolean) => void;
  voteStep: VoteStep;
}

function PostCard({ post, onVote, voteStep }: PostCardProps) {
  const date = new Date(post.timestamp * 1000);
  const timeStr = Number.isNaN(date.getTime())
    ? "just now"
    : date.toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });

  const isVoting = voteStep !== "idle";

  return (
    <article style={styles.card}>
      <div style={styles.meta}>
        <span style={styles.author}>Anonymous</span>
        <span style={styles.time}>{timeStr}</span>
        <span style={styles.zkBadge}>ZK</span>
      </div>
      <p style={styles.content}>{post.content}</p>
      <div style={styles.actions}>
        <button
          style={styles.voteBtn}
          onClick={() => onVote(post.id, true)}
          disabled={isVoting}
          title="Anonymous upvote"
        >
          <span>{isVoting && voteStep === "proving" ? "..." : "+"}</span>
          <span>{post.votes > 0 ? `+${post.votes}` : post.votes < 0 ? post.votes : 0}</span>
        </button>
        <button
          style={{ ...styles.voteBtn, ...styles.downBtn }}
          onClick={() => onVote(post.id, false)}
          disabled={isVoting}
          title="Anonymous downvote"
        >
          -
        </button>
      </div>
    </article>
  );
}

const styles: Record<string, CSSProperties> = {
  feed: { display: "flex", flexDirection: "column", gap: 12 },
  loading: {
    textAlign: "center",
    padding: 40,
    color: "#475569",
  },
  empty: {
    textAlign: "center",
    padding: "60px 20px",
    color: "#334155",
  },
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
  content: {
    color: "#e2e8f0",
    fontSize: 15,
    lineHeight: 1.7,
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
  },
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
