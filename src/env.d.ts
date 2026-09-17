/// <reference types="astro/client" />

interface ImportMetaEnv {
  readonly MERCADOPAGO_ACCESS_TOKEN?: string;
  readonly PUBLIC_SITE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}