import { http, createConfig } from "wagmi";
import { sepolia } from "wagmi/chains";
import { injected, metaMask } from "wagmi/connectors";

export const wagmiConfig = createConfig({
  ssr: false,
  chains: [sepolia],
  connectors: [
    metaMask({
      dappMetadata: {
        name: "AnonSocial",
      },
    }),
    injected({
      shimDisconnect: true,
    }),
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
