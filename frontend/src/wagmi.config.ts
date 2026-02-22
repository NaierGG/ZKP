import { http, createConfig } from "wagmi";
import { sepolia } from "wagmi/chains";
import { injected, metaMask } from "wagmi/connectors";

export const wagmiConfig = createConfig({
  chains: [sepolia],
  connectors: [
    metaMask(),
    injected(), // fallback for other injected wallets
  ],
  transports: {
    [sepolia.id]: http(),
  },
});

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}
