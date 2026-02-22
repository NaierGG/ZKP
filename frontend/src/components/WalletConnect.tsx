import { useAccount, useConnect, useDisconnect } from "wagmi";
import type { CSSProperties } from "react";

function shortenAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function WalletConnect() {
  const { address, isConnected, isConnecting } = useAccount();
  const { connect, connectors, error: connectError, isPending } = useConnect();
  const { disconnect } = useDisconnect();

  const metaMaskConnector =
    connectors.find((connector) => connector.id === "metaMask") ?? connectors[0];

  if (isConnected && address) {
    return (
      <div style={styles.row}>
        <div style={styles.badge}>
          <span style={styles.dot} />
          <span style={styles.addr}>{shortenAddress(address)}</span>
        </div>
        <button style={styles.disconnectBtn} onClick={() => disconnect()}>
          Disconnect
        </button>
      </div>
    );
  }

  return (
    <div style={styles.col}>
      <button
        style={{ ...styles.connectBtn, opacity: isConnecting || isPending ? 0.7 : 1 }}
        disabled={isConnecting || isPending || !metaMaskConnector}
        onClick={() => {
          if (!metaMaskConnector) return;
          connect({ connector: metaMaskConnector });
        }}
      >
        {isConnecting || isPending ? "Connecting..." : "Connect MetaMask"}
      </button>
      {connectError && <span style={styles.error}>{connectError.message}</span>}
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  row: { display: "flex", alignItems: "center", gap: 10 },
  col: { display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 },
  badge: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    background: "#111827",
    border: "1px solid #1e293b",
    borderRadius: 20,
    padding: "6px 12px",
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: "50%",
    background: "#4ade80",
    boxShadow: "0 0 6px #4ade80",
  },
  addr: { fontSize: 13, color: "#94a3b8", fontFamily: "monospace" },
  connectBtn: {
    background: "linear-gradient(135deg, #4ade80, #22d3ee)",
    color: "#000",
    fontWeight: 700,
    fontSize: 13,
    padding: "8px 16px",
    borderRadius: 20,
    border: "none",
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
  disconnectBtn: {
    background: "transparent",
    border: "1px solid #334155",
    color: "#64748b",
    fontSize: 12,
    padding: "6px 12px",
    borderRadius: 20,
    cursor: "pointer",
  },
  error: { fontSize: 11, color: "#f87171" },
};
