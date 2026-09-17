import type { APIRoute } from 'astro';
import { MercadoPagoConfig, Preference } from 'mercadopago';
import product from '../../data/product.json';

export const prerender = false;

const PLACEHOLDER_PREFIXES = ['TEST-xxxx', 'APP_USR-xxxx', 'YOUR_', 'REPLACE_ME'];

function isPlaceholderToken(token: string | undefined): boolean {
  if (!token) return true;
  return PLACEHOLDER_PREFIXES.some((prefix) => token.startsWith(prefix));
}

function siteOrigin(request: Request, fallback: string): string {
  const explicit = import.meta.env.PUBLIC_SITE_URL;
  if (explicit) return explicit.replace(/\/$/, '');
  try {
    return new URL(request.url).origin;
  } catch {
    return fallback;
  }
}

export const POST: APIRoute = async ({ request }) => {
  // 1. Parse the body
  let raw: { quantity?: unknown };
  try {
    raw = (await request.json()) as { quantity?: unknown };
  } catch {
    return jsonError(400, 'Cuerpo inválido. Se esperaba JSON con { quantity }.');
  }

  const requested = Number(raw.quantity);
  const quantity = Number.isFinite(requested)
    ? Math.max(1, Math.min(10, Math.floor(requested)))
    : 1;

  // 2. Validate the access token
  const accessToken = import.meta.env.MERCADOPAGO_ACCESS_TOKEN;

  if (!accessToken || isPlaceholderToken(accessToken)) {
    return jsonError(
      503,
      'Falta configurar MERCADOPAGO_ACCESS_TOKEN con credenciales reales. ' +
        'Copiá .env.example a .env y reemplazá el token de prueba.',
    );
  }

  // 3. Build the Checkout Pro preference
  const origin = siteOrigin(request, 'http://localhost:4321');
  const externalReference = `mate-raiz-${product.id}-${Date.now()}`;

  const client = new MercadoPagoConfig({
    accessToken,
    options: { timeout: 8000 },
  });
  const preference = new Preference(client);

  try {
    const response = await preference.create({
      body: {
        items: [
          {
            id: product.id,
            title: `${product.name} · ${product.subtitle}`,
            description: product.description,
            quantity,
            currency_id: 'ARS',
            unit_price: product.price.amount,
          },
        ],
        external_reference: externalReference,
        back_urls: {
          success: `${origin}/?status=success&ref=${externalReference}`,
          pending: `${origin}/?status=pending&ref=${externalReference}`,
          failure: `${origin}/?status=failure&ref=${externalReference}`,
        },
        auto_return: 'approved',
        statement_descriptor: 'MATE RAIZ',
        metadata: {
          product_id: product.id,
          source: 'landing-artesanal',
        },
      },
    });

    // 4. Mercado Pago returns `sandbox_init_point` in test mode and
    //    `init_point` in production. Use whichever the server gave us.
    const checkoutUrl = response.sandbox_init_point ?? response.init_point;

    if (!checkoutUrl) {
      return jsonError(
        502,
        'Mercado Pago no devolvió una URL de checkout válida.',
      );
    }

    return new Response(
      JSON.stringify({
        checkoutUrl,
        preferenceId: response.id ?? null,
        sandbox: Boolean(response.sandbox_init_point),
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store',
        },
      },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    return jsonError(502, `Mercado Pago rechazó la preferencia: ${message}`);
  }
};

function jsonError(status: number, error: string): Response {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  });
}