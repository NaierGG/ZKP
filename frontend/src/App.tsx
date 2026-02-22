import { useAccount } from "wagmi";
import { WalletConnect } from "./components/WalletConnect";
import { PostForm } from "./components/PostForm";
import { Feed } from "./components/Feed";
import { styles } from "./styles";

export default function App() {
  const { isConnected } = useAccount();

  return (
    <div style={styles.app}>
      {/* ── Header ── */}
      <header style={styles.header}>
        <div style={styles.headerInner}>
          <div style={styles.brand}>
            <span style={styles.brandIcon}>🔒</span>
            <span style={styles.brandName}>AnonSocial</span>
            <span style={styles.brandBadge}>ZK</span>
          </div>
          <WalletConnect />
        </div>
      </header>

      {/* ── Main ── */}
      <main style={styles.main}>
        <div style={styles.container}>
          {isConnected ? (
            <>
              <PostForm />
              <Feed />
            </>
          ) : (
            <div style={styles.hero}>
              <div style={styles.heroIcon}>🛡️</div>
              <h1 style={styles.heroTitle}>익명성이 보장된 소셜 네트워크</h1>
              <p style={styles.heroSubtitle}>
                Zero-Knowledge Proof로 신원을 증명하되, 익명성은 완벽하게 보호합니다.
                <br />
                당신이 누구인지는 아무도 모릅니다.
              </p>
              <div style={styles.features}>
                {[
                  { icon: "🔑", text: "지갑으로 ZK 신원 생성" },
                  { icon: "📝", text: "익명 게시글 작성" },
                  { icon: "👍", text: "익명 투표" },
                  { icon: "🌐", text: "IPFS 분산 저장" },
                ].map(({ icon, text }) => (
                  <div key={text} style={styles.featureCard}>
                    <span style={styles.featureIcon}>{icon}</span>
                    <span>{text}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </main>

      {/* ── Footer ── */}
      <footer style={styles.footer}>
        <span>Powered by Semaphore ZKP · IPFS · Ethereum</span>
      </footer>
    </div>
  );
}

// ── Inline styles ────────────────────────────────────────────────────────────
const S = {
  app: {
    minHeight: "100dvh",
    display: "flex",
    flexDirection: "column" as const,
    background: "linear-gradient(135deg, #0a0a0f 0%, #0f0f1a 50%, #0a0f0a 100%)",
  },
  header: {
    borderBottom: "1px solid #1e2a3a",
    backdropFilter: "blur(10px)",
    background: "rgba(10,10,15,0.8)",
    position: "sticky" as const,
    top: 0,
    zIndex: 50,
  },
  headerInner: {
    maxWidth: 720,
    margin: "0 auto",
    padding: "14px 20px",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  brand: { display: "flex", alignItems: "center", gap: 10 },
  brandIcon: { fontSize: 20 },
  brandName: { fontWeight: 700, fontSize: 18, color: "#e2e8f0", letterSpacing: "-0.02em" },
  brandBadge: {
    fontSize: 10,
    fontWeight: 700,
    background: "linear-gradient(135deg, #4ade80, #22d3ee)",
    color: "#000",
    padding: "2px 6px",
    borderRadius: 4,
    letterSpacing: "0.05em",
  },
  main: { flex: 1, padding: "24px 20px" },
  container: { maxWidth: 720, margin: "0 auto" },
  hero: {
    textAlign: "center" as const,
    padding: "60px 20px",
  },
  heroIcon: { fontSize: 64, marginBottom: 20 },
  heroTitle: {
    fontSize: 28,
    fontWeight: 700,
    color: "#e2e8f0",
    marginBottom: 12,
    letterSpacing: "-0.03em",
  },
  heroSubtitle: {
    color: "#64748b",
    fontSize: 15,
    lineHeight: 1.7,
    marginBottom: 40,
  },
  features: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
    gap: 12,
    maxWidth: 520,
    margin: "0 auto",
  },
  featureCard: {
    background: "#111827",
    border: "1px solid #1e293b",
    borderRadius: 12,
    padding: "16px 12px",
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    gap: 8,
    fontSize: 13,
    color: "#94a3b8",
  },
  featureIcon: { fontSize: 24 },
  footer: {
    textAlign: "center" as const,
    padding: "16px 20px",
    fontSize: 12,
    color: "#334155",
    borderTop: "1px solid #111827",
  },
};

// Merge into exported styles
export const styles = S;
