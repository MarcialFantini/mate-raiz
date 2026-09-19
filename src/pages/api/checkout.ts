import type { APIRoute } from 'astro';
import { MercadoPagoConfig, Preference } from 'mercadopago';
import { getAllProducts, getProductById, computeUnitPrice, variantLabel } from '../../scripts/catalog';
import variantsData from '../../data/variants.json';
import zonas from '../../data/zonas-envio.json';
import promos from '../../data/promos.json';

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

/* -------------------------------------------------------------------------- */
/*  Tipos del body                                                            */
/* -------------------------------------------------------------------------- */

interface VariantInput {
  productId?: string;
  modelId?: string;
  woodId?: string;
  ringId?: string;
  engravingId?: string;
  engravingText?: string;
  quantity?: number;
}

interface ShippingInput {
  cp?: string;
  tipo?: 'estandar' | 'express';
}

interface CheckoutBody {
  /** Legacy single-product shape (kept for back-compat). */
  quantity?: number;
  variant?: VariantInput;
  shipping?: ShippingInput;

  /** Cart shape: array of items. */
  items?: Array<{
    productId?: string;
    woodId?: string;
    ringId?: string;
    engravingId?: string;
    engravingText?: string;
    quantity?: number;
  }>;
  promoCode?: string;
  giftWrap?: boolean;
}

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                   */
/* -------------------------------------------------------------------------- */

function findVariant<T extends { id: string }>(list: T[], id: string | undefined): T | undefined {
  if (!id) return undefined;
  return list.find((item) => item.id === id);
}

type AllVariants = typeof variantsData;
const allVariants = variantsData as AllVariants;

function variantLabelFor(productId: string, v: {
  woodId?: string;
  ringId?: string;
  engravingId?: string;
  engravingText?: string;
}): string {
  const product = getProductById(productId);
  if (!product) return '';
  const model = allVariants.models.find((m) => m.id === product.model);
  const wood = findVariant(allVariants.woods, v.woodId);
  const ring = findVariant(allVariants.rings, v.ringId);
  const engraving = findVariant(allVariants.engravings, v.engravingId);
  return variantLabel({
    model: model ? { id: model.id, label: model.label, hidesWood: model.hidesWood, hidesRing: model.hidesRing } : null,
    wood: wood ? { id: wood.id, label: wood.label } : null,
    ring: ring ? { id: ring.id, label: ring.label } : null,
    engraving: engraving ? { id: engraving.id, label: engraving.label } : null,
    engravingText: v.engravingText,
  });
}

function resolveShipping(s: ShippingInput): {
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
        return { cp, tipo, cost: opt.cost, carrier: opt.carrier, eta: opt.eta };
      }
    }
  }
  return null;
}

interface ResolvedLine {
  productId: string;
  productName: string;
  unitPrice: number;
  quantity: number;
  variantLabel: string;
  lineTotal: number;
}

interface PromoHit {
  code: string;
  percent: number;
  label: string;
  discount: number;
}

/**
 * Normaliza el body legacy { variant } al shape de cart { items }.
 */
function normalizeBody(body: CheckoutBody): {
  items: CheckoutBody['items'];
  giftWrap: boolean;
  promoCode: string | null;
} {
  if (Array.isArray(body.items) && body.items.length > 0) {
    return {
      items: body.items,
      giftWrap: Boolean(body.giftWrap),
      promoCode: body.promoCode?.trim() || null,
    };
  }
  // Fallback legacy: el body traía { variant, quantity }.
  if (body.variant && body.variant.productId) {
    return {
      items: [
        {
          productId: body.variant.productId,
          woodId: body.variant.woodId,
          ringId: body.variant.ringId,
          engravingId: body.variant.engravingId,
          engravingText: body.variant.engravingText,
          quantity: body.variant.quantity ?? body.quantity ?? 1,
        },
      ],
      giftWrap: false,
      promoCode: body.promoCode?.trim() || null,
    };
  }
  return { items: [], giftWrap: false, promoCode: null };
}

/**
 * Resuelve las líneas válidas del carrito contra el catálogo server-side.
 * Devuelve un array de líneas con precio unitario recalculado y un flag
 * `hasInvalid` por si alguna línea referencia un productId inexistente.
 */
function resolveLines(items: NonNullable<CheckoutBody['items']>): {
  lines: ResolvedLine[];
  invalid: Array<{ index: number; reason: string }>;
} {
  const lines: ResolvedLine[] = [];
  const invalid: Array<{ index: number; reason: string }> = [];
  items.forEach((raw, idx) => {
    const productId = (raw.productId ?? '').trim();
    const product = productId ? getProductById(productId) : undefined;
    if (!product) {
      invalid.push({ index: idx, reason: `Producto "${productId}" no existe.` });
      return;
    }
    const quantity = Math.max(1, Math.min(10, Math.floor(raw.quantity ?? 1)));
    const unit = computeUnitPrice(product, {
      woodId: raw.woodId,
      ringId: raw.ringId,
      engravingId: raw.engravingId,
    });
    lines.push({
      productId: product.id,
      productName: product.name,
      unitPrice: unit,
      quantity,
      variantLabel: variantLabelFor(product.id, raw),
      lineTotal: unit * quantity,
    });
  });
  return { lines, invalid };
}

/**
 * Aplica el código promo si está activo y cumple el mínimo de subtotal.
 */
function applyPromo(
  codeRaw: string | null,
  subtotal: number,
): { promo: PromoHit | null; discount: number; reason: string | null } {
  if (!codeRaw) return { promo: null, discount: 0, reason: null };
  const code = codeRaw.trim().toUpperCase();
  const list = (promos as { promos: Array<{ code: string; percent: number; label: string; minSubtotal: number; active: boolean }> }).promos;
  const hit = list.find((p) => p.code.toUpperCase() === code);
  if (!hit) return { promo: null, discount: 0, reason: `El código "${code}" no existe.` };
  if (!hit.active) return { promo: null, discount: 0, reason: `El código "${code}" está expirado.` };
  if (subtotal < hit.minSubtotal) {
    return {
      promo: null,
      discount: 0,
      reason: `El código "${code}" requiere un mínimo de $ ${hit.minSubtotal.toLocaleString('es-AR')}.`,
    };
  }
  const discount = Math.round((subtotal * hit.percent) / 100);
  return {
    promo: { code: hit.code, percent: hit.percent, label: hit.label, discount },
    discount,
    reason: null,
  };
}

const GIFT_WRAP_PRICE = 2500;

function jsonResponse(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

function jsonError(status: number, error: string, extra: Record<string, unknown> = {}): Response {
  return jsonResponse({ error, ...extra }, status);
}

/* -------------------------------------------------------------------------- */
/*  POST handler                                                              */
/* -------------------------------------------------------------------------- */

export const POST: APIRoute = async ({ request }) => {
  // 1. Parse body
  let raw: CheckoutBody;
  try {
    raw = (await request.json()) as CheckoutBody;
  } catch {
    return jsonError(400, 'Cuerpo inválido. Se esperaba JSON.');
  }

  // 2. Validate access token (ANTES de hacer cualquier cálculo visible)
  const accessToken = import.meta.env.MERCADOPAGO_ACCESS_TOKEN;
  if (!accessToken || isPlaceholderToken(accessToken)) {
    return jsonError(
      503,
      'Falta configurar MERCADOPAGO_ACCESS_TOKEN con credenciales reales. ' +
        'Copiá .env.example a .env y reemplazá el token de prueba.',
    );
  }

  // 3. Normalizar body
  const { items, giftWrap, promoCode } = normalizeBody(raw);
  const normalizedItems = items ?? [];
  if (normalizedItems.length === 0) {
    return jsonError(400, 'El carrito está vacío.');
  }

  // 4. Resolver líneas contra el catálogo server-side
  const { lines, invalid } = resolveLines(normalizedItems);
  if (invalid.length > 0) {
    return jsonError(400, 'Hay líneas inválidas en el carrito.', { invalid });
  }
  if (lines.length === 0) {
    return jsonError(400, 'El carrito no contiene líneas válidas.');
  }

  // 5. Envío
  const shipping = resolveShipping(raw.shipping ?? {});
  const shippingCost = shipping?.cost ?? 0;

  // 6. Subtotal, promo, total
  const subtotal = lines.reduce((acc, l) => acc + l.lineTotal, 0);
  const { promo, discount, reason: promoReason } = applyPromo(promoCode, subtotal);
  const giftWrapCost = giftWrap ? GIFT_WRAP_PRICE : 0;
  const totalAmount = Math.max(0, subtotal - discount + giftWrapCost + shippingCost);

  // 7. Construir preferencia
  const origin = siteOrigin(request, 'http://localhost:4321');
  const externalReference = `mate-raiz-${Date.now()}`;

  const preferenceItems: Array<{
    id: string;
    title: string;
    description: string;
    quantity: number;
    currency_id: string;
    unit_price: number;
  }> = lines.map((line) => ({
    id: line.productId,
    title: line.variantLabel ? `${line.productName} · ${line.variantLabel}` : line.productName,
    description: line.variantLabel || line.productName,
    quantity: line.quantity,
    currency_id: 'ARS',
    unit_price: line.unitPrice,
  }));

  if (giftWrap && giftWrapCost > 0) {
    preferenceItems.push({
      id: 'gift-wrap',
      title: 'Envoltorio para regalo',
      description: 'Papel kraft + tarjeta con dedicatoria manuscrita',
      quantity: 1,
      currency_id: 'ARS',
      unit_price: giftWrapCost,
    });
  }

  if (shipping && shippingCost > 0) {
    preferenceItems.push({
      id: `shipping-${shipping.tipo}`,
      title: `Envío ${shipping.tipo === 'express' ? 'express' : 'estándar'} (${shipping.cp})`,
      description: `${shipping.carrier} · ${shipping.eta}`,
      quantity: 1,
      currency_id: 'ARS',
      unit_price: shippingCost,
    });
  }

  if (promo && discount > 0) {
    preferenceItems.push({
      id: `promo-${promo.code}`,
      title: `Descuento ${promo.code} · ${promo.label}`,
      description: `-${promo.percent}% sobre el subtotal`,
      quantity: 1,
      currency_id: 'ARS',
      unit_price: -discount,
    });
  }

  const client = new MercadoPagoConfig({ accessToken, options: { timeout: 8000 } });
  const preference = new Preference(client);

  try {
    const response = await preference.create({
      body: {
        items: preferenceItems,
        external_reference: externalReference,
        back_urls: {
          success: `${origin}/gracias?ref=${externalReference}`,
          pending: `${origin}/gracias?ref=${externalReference}&status=pending`,
          failure: `${origin}/gracias?ref=${externalReference}&status=failure`,
        },
        auto_return: 'approved',
        statement_descriptor: 'MATE RAIZ',
        metadata: {
          source: 'landing-artesanal',
          cart_lines: lines.length,
          promo: promo?.code ?? null,
          shipping: shipping ?? null,
          gift_wrap: giftWrap,
          raw_items: normalizedItems,
        },
      },
    });

    const checkoutUrl = response.sandbox_init_point ?? response.init_point;

    if (!checkoutUrl) {
      return jsonError(502, 'Mercado Pago no devolvió una URL de checkout válida.');
    }

    return jsonResponse(
      {
        checkoutUrl,
        preferenceId: response.id ?? null,
        sandbox: Boolean(response.sandbox_init_point),
        externalReference,
        totals: {
          subtotal,
          discount,
          giftWrapCost,
          shippingCost,
          total: totalAmount,
          currency: 'ARS',
        },
        promo,
        promoReason,
        lines: lines.map((l) => ({
          productId: l.productId,
          productName: l.productName,
          variantLabel: l.variantLabel,
          unitPrice: l.unitPrice,
          quantity: l.quantity,
          lineTotal: l.lineTotal,
        })),
        shipping: shipping ?? null,
      },
      200,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    return jsonError(502, `Mercado Pago rechazó la preferencia: ${message}`);
  }
};

/**
 * GET: endpoint de health-check. Útil para verificar que la ruta responde
 * sin necesidad de enviar un body.
 */
export const GET: APIRoute = async () => {
  const accessToken = import.meta.env.MERCADOPAGO_ACCESS_TOKEN;
  const placeholder = !accessToken || isPlaceholderToken(accessToken);
  return jsonResponse(
    {
      endpoint: '/api/checkout',
      method: 'POST',
      products: getAllProducts().map((p) => ({ id: p.id, slug: p.slug, name: p.name })),
      paymentProvider: 'mercadopago',
      tokenConfigured: !placeholder,
      tokenPlaceholder: placeholder,
    },
    200,
  );
};
