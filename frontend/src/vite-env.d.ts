/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_CONTRACT_ADDRESS?: `0x${string}`;
  readonly VITE_PINATA_API_KEY?: string;
  readonly VITE_PINATA_SECRET_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
