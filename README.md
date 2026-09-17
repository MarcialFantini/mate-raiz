# Mate Raíz — Landing con checkout simple

> **Estado:** demo funcional. Landing editorial de un solo producto (mate imperial con virola de alpaca) con botón de compra que inicia un checkout real de Mercado Pago.

---

## Problema

Mate Raíz es una marca artesanal que vende **un solo producto** (mate imperial premium con virola de alpaca) por unidad. No quieren armar una tienda ni un carrito. Necesitan una landing que:

- Transmita el oficio (cómo se hace, quién lo hace, de dónde viene la madera).
- Muestre el producto con criterio editorial, no estilo catálogo.
- Lleve al visitante hasta la pantalla del proveedor de pagos sin fricción.
- Funcione en mobile con la misma dignidad que en desktop.

## Solución

Una landing single-product construida en Astro con SSR, Tailwind v4 y un endpoint server-side que abre una preferencia de **Mercado Pago Checkout Pro**. El botón *Comprar ahora*:

1. Hace `POST /api/checkout` con `{ quantity }`.
2. El servidor crea una `Preference` con los datos del producto y el token del `.env`.
3. Devuelve la URL del checkout (`sandbox_init_point` en modo test, `init_point` en producción).
4. El front redirige a esa URL — el visitante termina el pago en la pantalla oficial de Mercado Pago.

Sin carrito, sin tienda, sin SDK de pagos embebido: el visitante solo ve Mercado Pago cuando decide pagar.

## Stack

| Capa | Elección | Por qué |
|---|---|---|
| Framework | **Astro 7** (`output: 'server'`) | Render server-side solo donde hace falta (el endpoint de checkout). El resto de la página es HTML estático. |
| Adapter | **`@astrojs/node` en modo standalone** | El más simple para correr local (`pnpm dev`) y para deploy en cualquier servidor Node. Sin vendor lock-in. |
| Estilos | **Tailwind v4** vía `@tailwindcss/vite` | Configuración por design tokens (`@theme`) en `src/styles/global.css`. Sin `tailwind.config.js`. |
| Pagos | **`mercadopago` SDK v3 (oficial)** | Cliente argentino, host de pagos ya conocido. SDK con `Preference` para Checkout Pro con redirect — no necesitamos tokenizar tarjetas. |
| Tipografía | **`@fontsource-variable/*`** (self-hosted) | Cormorant Garamond Variable (display) + Plus Jakarta Sans Variable (cuerpo). Cero requests externos a Google Fonts. |
| Interactividad | **Vanilla JS en `<script>` blocks** | El botón de cantidad y el handler de checkout son ~30 líneas. No justifica meter React/Preact. |

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

Abre [http://localhost:4321](http://localhost:4321). El botón *Comprar ahora* hace POST a `/api/checkout` y redirige al checkout de Mercado Pago.

### Otros comandos

```bash
pnpm build       # build de producción
pnpm preview     # sirve el build de producción
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
Body: { "quantity": 1 }

→ 200 { "checkoutUrl": "https://sandbox.mercadopago.com/...", "preferenceId": "..." }
→ 400 { "error": "Cuerpo inválido..." }
→ 503 { "error": "Falta configurar MERCADOPAGO_ACCESS_TOKEN..." }
→ 502 { "error": "Mercado Pago rechazó la preferencia: ..." }
```

Valida `quantity` (1–10), crea una preferencia con el producto, las `back_urls` (success/pending/failure apuntando al sitio), y devuelve la URL lista para redirigir. La preferencia incluye `external_reference` único para correlacionar pagos con pedidos.

### Por qué Mercado Pago y no Stripe

- Mate Raíz vende en Argentina. Mercado Pago es el método de pago estándar del país (transferencias, cuotas sin interés con bancos locales, Mercado Pago Wallet).
- El SDK oficial de MP (`mercadopago` v3) tiene un cliente `Preference` que genera exactamente el flujo que necesitamos (Checkout Pro con redirect), sin tokenización client-side.
- Stripe funciona perfecto en Argentina, pero agrega fricción para el usuario final (muchos bancos cobran extra por tarjeta internacional). Para un mate artesanal premium, la fricción mata la conversión.

### Si querés cambiar a Stripe

El endpoint está aislado en `src/pages/api/checkout.ts`. Reemplazá la implementación por algo como:

```ts
import Stripe from 'stripe';
const stripe = new Stripe(import.meta.env.STRIPE_SECRET_KEY!, { apiVersion: '2024-06-20' });

const session = await stripe.checkout.sessions.create({
  mode: 'payment',
  line_items: [{
    price_data: {
      currency: 'ars',
      product_data: { name: `${product.name} · ${product.subtitle}` },
      unit_amount: product.price.amount * 100,
    },
    quantity,
  }],
  success_url: `${origin}/?status=success`,
  cancel_url: `${origin}/?status=cancelled`,
});
return new Response(JSON.stringify({ checkoutUrl: session.url }), { status: 200 });
```

Y agregás `STRIPE_SECRET_KEY` al `.env.example`.

---

## Estructura del proyecto

```
src/
├── components/
│   ├── Faq.astro          # Preguntas frecuentes (accordion)
│   ├── Footer.astro
│   ├── Gallery.astro      # Galería asimétrica
│   ├── Hero.astro         # Hero split con CTA primario
│   ├── Nav.astro          # Nav flotante con CTA
│   ├── PurchasePanel.astro# Precio + cantidad + botón Comprar
│   ├── Shipping.astro     # Envío + devoluciones
│   ├── Specs.astro        # Especificaciones del producto
│   └── Story.astro        # El oficio + proceso + maker
├── data/
│   ├── faq.json
│   ├── product.json
│   └── shipping.json
├── layouts/
│   └── BaseLayout.astro   # HTML head, fonts, reveal-on-scroll
├── pages/
│   ├── api/
│   │   └── checkout.ts    # POST endpoint para Mercado Pago
│   └── index.astro
├── styles/
│   └── global.css         # Tailwind v4 + design tokens
└── env.d.ts
```

---

## Decisiones de diseño

- **Paleta "Forest"** (verde profundo + bone + amber) en vez del clásico crema+brass del craft premium. Conecta con la yerba mate y esquiva el default AI warm-craft.
- **Tipografía editorial**: Cormorant Garamond Variable para headlines (italic para contraste), Plus Jakarta Sans para cuerpo.
- **Mobile-first**: cada sección colapsa explícitamente en `<768px` a una sola columna. Sin `h-screen` (usamos `min-h-[100dvh]` solo donde hace falta).
- **Imágenes placeholder via `picsum.photos`** con seeds descriptivos. Antes de producción reemplazar por fotos reales del producto.
- **Sin emojis**, sin sombras pesadas, sin gradientes AI-purple. La marca se sostiene en tipografía, color y ritmo de espacios.
- **Accesibilidad**: skip-link al contenido, contraste WCAG AA en CTAs, `aria-live` en mensajes de estado, focus visible en todos los interactivos, `prefers-reduced-motion` honrado.

---

## Pendiente para producción

- [ ] Reemplazar las fotos de `picsum.photos` por fotos reales del producto.
- [ ] Configurar webhook `/api/webhook` para recibir notificaciones de pago (no incluido — solo redirect).
- [ ] Reemplazar `MERCADOPAGO_ACCESS_TOKEN` con credencial de producción.
- [ ] Definir `PUBLIC_SITE_URL` con el dominio final.
- [ ] Sumar `astro check` al CI para type-checking.