/// <reference types="astro/client" />

interface ImportMetaEnv {
  readonly MERCADOPAGO_ACCESS_TOKEN?: string;
  readonly MERCADOPAGO_WEBHOOK_SECRET?: string;
  readonly PUBLIC_SITE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}