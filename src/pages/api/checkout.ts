import type { APIRoute } from 'astro';
import { MercadoPagoConfig, Preference } from 'mercadopago';
import product from '../../data/product.json';
import variants from '../../data/variants.json';
import zonas from '../../data/zonas-envio.json';

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

interface VariantBody {
  modelId?: string;
  woodId?: string;
  ringId?: string;
  engravingId?: string;
  engravingText?: string;
}

interface ShippingBody {
  cp?: string;
  tipo?: 'estandar' | 'express';
  cost?: number;
}

interface CheckoutBody {
  quantity?: unknown;
  variant?: VariantBody;
  shipping?: ShippingBody;
}

function findVariant<T extends { id: string }>(
  list: T[],
  id: string | undefined,
): T | undefined {
  if (!id) return undefined;
  return list.find((item) => item.id === id);
}

function buildVariantLabel(v: VariantBody): string {
  const model = findVariant(variants.models, v.modelId);
  const wood = findVariant(variants.woods, v.woodId);
  const ring = findVariant(variants.rings, v.ringId);
  const engraving = findVariant(variants.engravings, v.engravingId);
  const parts: string[] = [];
  if (model) parts.push(model.label);
  if (wood && !model?.hidesWood) parts.push(wood.label);
  if (ring && !model?.hidesRing) parts.push(ring.label);
  if (engraving && engraving.id !== 'ninguno') {
    if (v.engravingText && v.engravingText.trim().length > 0) {
      parts.push(`${engraving.label}: "${v.engravingText.trim()}"`);
    } else {
      parts.push(engraving.label);
    }
  }
  return parts.join(' · ');
}

function computeUnitPrice(v: VariantBody): number {
  const model = findVariant(variants.models, v.modelId) ?? variants.models[0];
  const wood = findVariant(variants.woods, v.woodId) ?? variants.woods[0];
  const ring = findVariant(variants.rings, v.ringId) ?? variants.rings[0];
  const engraving = findVariant(variants.engravings, v.engravingId) ?? variants.engravings[0];
  const base = model.basePrice;
  const total =
    base +
    (wood?.priceModifier ?? 0) +
    (ring?.priceModifier ?? 0) +
    (engraving?.priceModifier ?? 0);
  return Math.max(0, total);
}

function resolveShipping(s: ShippingBody): {
  cp: string;
  tipo: 'estandar' | 'express';
  cost: number;
  carrier: string;
  eta: string;
} | null {
  const cp = (s.cp ?? '').trim();
  if (!/^\d{4}$/.test(cp)) return null;
  const cpInt = parseInt(cp, 10);
  for (const zona of zonas.zonas) {
    for (const rango of zona.rangos) {
      if (cpInt >= rango.min && cpInt <= rango.max) {
        const tipo = s.tipo === 'express' ? 'express' : 'estandar';
        const opt = zona[tipo];
        return {
          cp,
          tipo,
          cost: opt.cost,
          carrier: opt.carrier,
          eta: opt.eta,
        };
      }
    }
  }
  return null;
}

export const POST: APIRoute = async ({ request }) => {
  // 1. Parse body
  let raw: CheckoutBody;
  try {
    raw = (await request.json()) as CheckoutBody;
  } catch {
    return jsonError(400, 'Cuerpo inválido. Se esperaba JSON.');
  }

  const requested = Number(raw.quantity);
  const quantity = Number.isFinite(requested)
    ? Math.max(1, Math.min(10, Math.floor(requested)))
    : 1;

  // 2. Validate access token
  const accessToken = import.meta.env.MERCADOPAGO_ACCESS_TOKEN;
  if (!accessToken || isPlaceholderToken(accessToken)) {
    return jsonError(
      503,
      'Falta configurar MERCADOPAGO_ACCESS_TOKEN con credenciales reales. ' +
        'Copiá .env.example a .env y reemplazá el token de prueba.',
    );
  }

  // 3. Compute price + variant label server-side (no confiar en el cliente)
  const unitPrice = computeUnitPrice(raw.variant ?? {});
  const variantLabel = buildVariantLabel(raw.variant ?? {});
  const shipping = resolveShipping(raw.shipping ?? {});
  const shippingCost = shipping?.cost ?? 0;
  const totalAmount = unitPrice * quantity + (quantity > 0 ? shippingCost : 0);

  const titleSuffix = variantLabel
    ? ` · ${variantLabel}`
    : '';

  const description =
    product.description +
    (variantLabel ? ` · Configuración: ${variantLabel}` : '');

  // 4. Build the Checkout Pro preference
  const origin = siteOrigin(request, 'http://localhost:4321');
  const externalReference = `mate-raiz-${product.id}-${Date.now()}`;

  const client = new MercadoPagoConfig({
    accessToken,
    options: { timeout: 8000 },
  });
  const preference = new Preference(client);

  try {
    const items: Array<{
      id: string;
      title: string;
      description: string;
      quantity: number;
      currency_id: string;
      unit_price: number;
    }> = [
      {
        id: product.id,
        title: `${product.name}${titleSuffix}`,
        description,
        quantity,
        currency_id: 'ARS',
        unit_price: unitPrice,
      },
    ];

    if (shipping && shippingCost > 0) {
      items.push({
        id: `shipping-${shipping.tipo}`,
        title: `Envío ${shipping.tipo === 'express' ? 'express' : 'estándar'} (${shipping.cp})`,
        description: `${shipping.carrier} · ${shipping.eta}`,
        quantity: 1,
        currency_id: 'ARS',
        unit_price: shippingCost,
      });
    }

    const response = await preference.create({
      body: {
        items,
        external_reference: externalReference,
        back_urls: {
          success: `${origin}/pedido/demo?ref=${externalReference}`,
          pending: `${origin}/pedido/demo?ref=${externalReference}&status=pending`,
          failure: `${origin}/?status=failure&ref=${externalReference}`,
        },
        auto_return: 'approved',
        statement_descriptor: 'MATE RAIZ',
        metadata: {
          product_id: product.id,
          source: 'landing-artesanal',
          variant: raw.variant ?? {},
          shipping: shipping ?? {},
        },
      },
    });

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
        totals: {
          unitPrice,
          quantity,
          shippingCost,
          total: totalAmount,
        },
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
