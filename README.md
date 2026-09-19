# Mate Raíz — Landing + catálogo + checkout

> **Estado:** demo funcional. Landing editorial de una marca de mates artesanales con catálogo multi-producto, carrito persistente, calculadora de envío por CP y checkout real de **Mercado Pago Checkout Pro**.

---

## Problema

Mate Raíz es una marca artesanal que vende **cuatro piezas distintas** (Mate Imperial, Torpedo, Camionero y Bombilla de Alpaca). No quieren armar una tienda online tradicional, pero sí necesitan:

- Transmitir el oficio (cómo se hace, quién lo hace, de dónde viene la madera).
- Mostrar cada pieza con criterio editorial, no estilo catálogo.
- Llevar al visitante hasta la pantalla del proveedor de pagos sin fricción.
- Permitir combinar piezas en un carrito con promos, envoltorio para regalo y envío por código postal.
- Rastrear un pedido ya realizado por su código de tracking.
- Funcionar en mobile con la misma dignidad que en desktop.

## Solución

Una landing + catálogo construido en Astro con SSR, Tailwind v4, contenido markdown para el blog y un endpoint server-side que abre una preferencia de **Mercado Pago Checkout Pro**. La acción principal (*Comprar ahora* o *Ir a checkout*) dispara un `POST /api/checkout` con `{ items, promoCode, giftWrap, shipping }`. El servidor valida contra el catálogo, calcula subtotal/promo/envío/gift-wrap y devuelve la URL del checkout (`sandbox_init_point` en modo test, `init_point` en producción). El front redirige a esa URL.

Después del pago, el visitante vuelve a `/gracias?ref=XXX` (status: `approved` | `pending` | `failure`) y puede consultar el estado de su envío en `/rastrear/[tracking]` con el código que le mandamos por mail.

---

## Stack

| Capa | Elección | Por qué |
|---|---|---|
| Framework | **Astro 7** (`output: 'server'`) | SSR solo donde hace falta (endpoints + páginas dinámicas: carrito, rastreo, blog detail). |
| Adapter | **`@astrojs/node` en modo standalone** | El más simple para correr local (`pnpm dev`) y para deploy en cualquier servidor Node. Sin vendor lock-in. |
| Sitemap | **`@astrojs/sitemap`** | Genera `/sitemap-index.xml` automáticamente en build. |
| Estilos | **Tailwind v4** vía `@tailwindcss/vite` | Design tokens (`@theme`) en `src/styles/global.css`. Sin `tailwind.config.js`. |
| Pagos | **`mercadopago` SDK v3 (oficial)** | Cliente argentino, host de pagos ya conocido. `Preference` para Checkout Pro con redirect — no tokenizamos tarjetas. |
| Tipografía | **`@fontsource-variable/*`** (self-hosted) | Cormorant Garamond Variable (display) + Plus Jakarta Sans Variable (cuerpo). Cero requests externos a Google Fonts. |
| Contenido | **Astro Content Collections + glob loader** | Posts del blog como markdown en `src/content/blog/`. Tipados con `zod` en `src/content.config.ts`. |
| Interactividad | **Vanilla JS en `<script>` blocks** | Carrito, calculadora de envío, selector de variantes, carousel. Sin React/Preact. |

---

## Cómo correrlo

### Requisitos
- Node.js ≥ 22.12
- pnpm ≥ 10

### Pasos

```bash
# 1. Instalar dependencias
pnpm install

# 2. Copiar las variables de entorno
cp .env.example .env

# 3. Editar .env y reemplazar MERCADOPAGO_ACCESS_TOKEN por tu token real
#    (ver "Modo test vs producción" abajo)

# 4. Levantar el dev server
pnpm dev
```

Abre [http://localhost:4321](http://localhost:4321). Si el puerto está ocupado, Astro usa el siguiente disponible; consultá `node_modules/.astro/dev.json` para el puerto real.

> ⚠️ Si `pnpm build` falla con `dist/server/` faltante y hay un directorio `.vercel/` en la raíz, **borrá `.vercel/`** y rebuildeá. Es un residuo de un deploy anterior con un adapter distinto que bloquea el `@astrojs/node` standalone.

### Otros comandos

```bash
pnpm build       # build de producción → dist/server + dist/client
pnpm preview     # sirve el build de producción
pnpm astro check # type-check + validación
```

---

## Estructura del proyecto

```
src/
├── components/
│   ├── Breadcrumbs.astro       # Ruta editorial
│   ├── Faq.astro               # Preguntas frecuentes (accordion)
│   ├── Footer.astro
│   ├── Gallery.astro           # Galería asimétrica
│   ├── Hero.astro              # Hero split con CTA primario
│   ├── Nav.astro               # Nav flotante con CTA + cart count
│   ├── PurchasePanel.astro     # Hero panel (featured product)
│   ├── ScrollProgress.astro    # Barra fina de progreso de scroll
│   ├── Shipping.astro          # Envío + devoluciones
│   ├── ShippingCalculator.astro# Calculadora de envío por CP
│   ├── Specs.astro             # Especificaciones del producto
│   ├── StickyCta.astro         # CTA fixed mobile
│   └── Story.astro             # El oficio + proceso + maker
├── content/
│   └── blog/                   # 5 posts en markdown
├── data/
│   ├── faq.json
│   ├── pedidos.json            # 4 pedidos de demo (con tracking)
│   ├── products.json           # 4 productos · single source of truth
│   ├── promos.json             # 4 códigos promo
│   ├── shipping.json
│   ├── testimonials.json
│   ├── variants.json           # Modelos, maderas, virolas, grabados
│   └── zonas-envio.json        # Tabla CP → zona + costo
├── layouts/
│   └── BaseLayout.astro        # HTML head, fonts, SEO, reveal-on-scroll
├── pages/
│   ├── 404.astro
│   ├── blog/
│   │   ├── index.astro         # Índice del blog
│   │   └── [slug].astro        # Detalle de post (prerender)
│   ├── carrito.astro           # Carrito persistente (localStorage)
│   ├── catalogo.astro          # Catálogo 4 productos
│   ├── contacto.astro
│   ├── gracias.astro           # Post-pago (?ref=XXX&status=…)
│   ├── index.astro             # Home (Imperial como featured)
│   ├── pedido/
│   │   └── [id].astro          # Resumen de pedido por id
│   ├── producto/
│   │   └── [slug].astro        # Detalle de producto + JSON-LD
│   ├── rastrear/
│   │   └── [tracking].astro    # Rastreo de envío por tracking
│   └── api/
│       ├── checkout.ts         # POST → Mercado Pago Preference
│       └── webhook.ts          # GET health + POST events MP
├── scripts/
│   ├── cart-store.ts           # localStorage `mate-raiz:cart`
│   ├── catalog.ts              # Helpers tipados sobre products.json
│   ├── format.ts               # Formateo ARS / cuotas
│   ├── shipping-store.ts       # localStorage `mate-raiz:shipping`
│   └── variant-store.ts        # localStorage `mate-raiz:variants`
├── styles/
│   └── global.css              # Tailwind v4 + design tokens
├── content.config.ts           # Colección `blog` con zod
└── env.d.ts

public/
├── favicon.ico
├── favicon.svg
├── og-default.svg              # 1200x630 SVG (forest + Cormorant)
└── robots.txt                  # Allow + Sitemap
```

---

## Integración de pago: Mercado Pago

### Modo test vs producción

| Modo | Token | URL de checkout devuelta | Resultado |
|---|---|---|---|
| **Test / sandbox** | Empieza con `TEST-` | `sandbox_init_point` | Pantalla de prueba de MP, podés pagar con tarjeta de prueba (`4509 9535 6623 3704`, venc. futura, CVV 123). |
| **Producción** | Empieza con `APP_USR-` | `init_point` | Pantalla real de Mercado Pago. Cobros reales. |

Mientras `MERCADOPAGO_ACCESS_TOKEN` siga siendo el placeholder (`TEST-xxxx-...`), el endpoint devuelve un **503** con un mensaje claro pidiendo que lo reemplaces. Esto es intencional: evita que un deploy accidental cobre a alguien.

### Cómo obtener credenciales reales

1. Creá una cuenta de Mercado Pago (sirve test y producción).
2. Andá a [Tus integraciones](https://www.mercadopago.com/developers/panel/credentials).
3. Copiá el `Access token` de la app que quieras usar.
4. Pegalo en `.env`.

### Qué hace el endpoint (`src/pages/api/checkout.ts`)

```ts
POST /api/checkout
Content-Type: application/json
Body: {
  "items": [{ "productId": "...", "woodId": "...", "ringId": "...", "engravingId": "...", "engravingText": "...", "quantity": 1 }],
  "promoCode": "RAIZ10" | null,
  "giftWrap": true | false,
  "shipping": { "cp": "1425", "tipo": "estandar" | "express" }
}

→ 200 { "checkoutUrl": "https://sandbox.mercadopago.com/...", "preferenceId": "...", "totals": {...}, "lines": [...], "shipping": {...} }
→ 400 { "error": "El carrito está vacío." | "Hay líneas inválidas en el carrito." | ... }
→ 503 { "error": "Falta configurar MERCADOPAGO_ACCESS_TOKEN..." }
→ 502 { "error": "Mercado Pago rechazó la preferencia: ..." }
```

El endpoint valida cada `productId` contra `products.json`, recalcula los precios unitarios server-side (cliente no puede alterar el monto), aplica promos, calcula envío por zona, y arma la `Preference` con `back_urls` apuntando a `/gracias?ref=…` y `auto_return: 'approved'`.

### Webhook (`src/pages/api/webhook.ts`)

Incluido en `src/pages/api/webhook.ts` (174 líneas).

- **GET** → health-check con descripción del esquema.
- **POST** → soporta `topic: "payment"` (resuelve el pago por id con `Payment.get()`), `topic: "test"` (verificación) y otros (`merchant_order`, etc.).
- **NO valida `x-signature`** contra `MERCADOPAGO_WEBHOOK_SECRET` — eso queda pendiente para producción.

### Por qué Mercado Pago y no Stripe

- Mate Raíz vende en Argentina. Mercado Pago es el método de pago estándar del país (transferencias, cuotas sin interés con bancos locales, Mercado Pago Wallet).
- El SDK oficial de MP (`mercadopago` v3) tiene un cliente `Preference` que genera exactamente el flujo que necesitamos (Checkout Pro con redirect), sin tokenización client-side.
- Stripe funciona perfecto en Argentina, pero agrega fricción para el usuario final (muchos bancos cobran extra por tarjeta internacional). Para un mate artesanal premium, la fricción mata la conversión.

---

## Carrito, promos y envío

- **Carrito multi-item** (`src/scripts/cart-store.ts`): persistente en `localStorage` con clave `mate-raiz:cart`. Cada item tiene `{ productId, variant: {woodId, ringId, engravingId, engravingText}, quantity }`. El id interno se genera como `productId|woodId|ringId|engravingId|engravingText` para que dos items con la misma configuración se acumulen.
- **Códigos promo** (`src/data/promos.json`): validados server-side contra el subtotal y el flag `active`. El cliente muestra un preview del descuento, pero el server es la fuente de verdad.
- **Envoltorio para regalo** (`$ 2.500`): toggle que agrega un item extra a la preference.
- **Envío por CP** (`src/scripts/shipping-store.ts` + `src/data/zonas-envio.json`): el usuario ingresa un CP argentino de 4 dígitos, se resuelve la zona (CABA / GBA / Interior BA / Resto), y se muestra costo + ETA. Server-side el CP se valida de nuevo antes de armar la preference.

---

## Contenido y SEO

- **Blog** (`src/content/blog/*.md`): 5 posts (curado, primer mate, el galpón, la madera, yerbas). El detalle (`/blog/[slug]`) se prerenderea en build para SEO; el índice (`/blog`) es SSR.
- **SEO en `BaseLayout.astro`**: title, description, canonical, Open Graph completo (`og:title`, `og:description`, `og:type`, `og:url`, `og:image`, `og:locale`, `og:site_name`) y Twitter Card (`summary_large_image` con title/description/image).
- **og-default.svg** (`public/og-default.svg`): 1200×630 SVG con fondo forest `#1F3A2E`, headline en Cormorant Garamond + acento copper.
- **JSON-LD Product** en `/producto/[slug]`: schema.org `Product` con `name`, `description`, `sku`, `brand`, `category`, `image[]`, `offers` (currency, price, availability).
- **Sitemap** (`@astrojs/sitemap`): `/sitemap-index.xml` se genera en build.
- **robots.txt** (`public/robots.txt`): `Allow: /` + referencia al sitemap.

---

## Decisiones de diseño

- **Paleta "Forest"** (verde profundo + bone + amber) en vez del clásico crema+brass del craft premium. Conecta con la yerba mate y esquiva el default AI warm-craft.
- **Tipografía editorial**: Cormorant Garamond Variable para headlines (italic para contraste), Plus Jakarta Sans para cuerpo.
- **Mobile-first**: cada sección colapsa explícitamente en `<768px` a una sola columna. Sin `h-screen` (usamos `min-h-[100dvh]` solo donde hace falta).
- **Imágenes placeholder via `picsum.photos`** con seeds descriptivos. Antes de producción reemplazar por fotos reales de cada pieza.
- **Sin emojis**, sin sombras pesadas, sin gradientes AI-purple. La marca se sostiene en tipografía, color y ritmo de espacios.
- **Accesibilidad**: skip-link al contenido, contraste WCAG AA en CTAs, `aria-live` en mensajes de estado, focus visible en todos los interactivos, `prefers-reduced-motion` honrado.

---

## Pendiente para producción

- [ ] Reemplazar las fotos de `picsum.photos` por fotos reales de cada pieza.
- [ ] Reemplazar `MERCADOPAGO_ACCESS_TOKEN` con credencial de producción.
- [ ] Definir `PUBLIC_SITE_URL` con el dominio final (también impacta `back_urls` y `og:image`).
- [ ] Validar `x-signature` en el webhook contra `MERCADOPAGO_WEBHOOK_SECRET`.
- [ ] Conectar `/rastrear/[tracking]` al sistema del transportista (hoy es lookup local en `pedidos.json`).
- [ ] Sumar `astro check` al CI para type-checking.