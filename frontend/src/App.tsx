import { useAccount } from "wagmi";
import { WalletConnect } from "./components/WalletConnect";
import { PostForm } from "./components/PostForm";
import { Feed } from "./components/Feed";
import { styles } from "./styles";

export default function App() {
  const { isConnected } = useAccount();

  return (
    <div style={styles.app}>
      <header style={styles.header}>
        <div style={styles.headerInner}>
          <div style={styles.brand}>
            <span style={styles.brandIcon}>🛡️</span>
            <span style={styles.brandName}>AnonSocial</span>
            <span style={styles.brandBadge}>ZK</span>
          </div>
          <WalletConnect />
        </div>
      </header>

      <main style={styles.main}>
        <div style={styles.container}>
          {isConnected ? (
            <>
              <PostForm />
              <Feed />
            </>
          ) : (
            <div style={styles.hero}>
              <div style={styles.heroIcon}>🔐</div>
              <h1 style={styles.heroTitle}>Anonymous social with privacy by default</h1>
              <p style={styles.heroSubtitle}>
                Prove membership with zero-knowledge proofs and post anonymously.
                <br />
                Keep your identity private while joining trusted communities.
              </p>
              <div style={styles.features}>
                {[
                  { icon: "🪪", text: "Create ZK identity from your wallet" },
                  { icon: "📝", text: "Publish anonymous posts" },
                  { icon: "🗳️", text: "Anonymous voting and signals" },
                  { icon: "🌐", text: "Distributed storage on IPFS" },
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

      <footer style={styles.footer}>
        <span>Powered by Semaphore ZKP | IPFS | Ethereum</span>
      </footer>
    </div>
  );
}
