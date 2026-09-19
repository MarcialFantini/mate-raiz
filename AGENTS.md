# AGENTS — Mate Raíz (proyecto 04)

Stack: Astro 7.3 + @astrojs/node standalone + mercadopago + TS estricto.
Output: server (SSR). Adapter: @astrojs/node standalone.
Single source of truth: src/data/products.json (4 productos con variants).
Persistencia carrito: src/scripts/cart-store.ts (localStorage `mate-raiz:cart`).
Cliente ficticio: Mate Raíz (mate artesanal con virola de alpaca).
Endpoints SSR: src/pages/api/checkout.ts (POST con validación cantidad 1-10 + 503 sin token), src/pages/api/webhook.ts (GET health + POST events Mercado Pago).
Variables de entorno: MERCADOPAGO_ACCESS_TOKEN, PUBLIC_SITE_URL, MERCADOPAGO_WEBHOOK_SECRET (ver .env.example).