import type { APIRoute } from 'astro';
import { MercadoPagoConfig, Payment } from 'mercadopago';

export const prerender = false;

/**
 * Webhook de Mercado Pago (IPN / Notifications).
 *
 * Mercado Pago envía dos tipos de notificación a este endpoint:
 *
 *   1) Notificaciones de pago (topic = "payment")
 *      body: { type: "payment", data: { id: 1234567890 } }
 *      → hay que resolver el `Payment` por id para obtener status, monto,
 *        external_reference, payer, etc.
 *
 *   2) Notificaciones de prueba (topic = "test" o type = "test")
 *      → se usa solo para validar que el endpoint responde 200.
 *
 * En producción se debería:
 *   - Verificar la firma (x-signature header) usando el secret de la app.
 *   - Resolver siempre el `Payment` (NO confiar en el body).
 *   - Persistir el resultado (DB / cola) y devolver 200 antes de cualquier
 *     trabajo pesado.
 *
 * En esta demo:
 *   - Logueamos el payload recibido en consola.
 *   - Si el token está configurado, intentamos resolver el pago contra MP
 *     y logueamos el resultado.
 *   - Devolvemos 200 siempre (excepto errores de parsing).
 */

const PLACEHOLDER_PREFIXES = ['TEST-xxxx', 'APP_USR-xxxx', 'YOUR_', 'REPLACE_ME'];

function isPlaceholderToken(token: string | undefined): boolean {
  if (!token) return true;
  return PLACEHOLDER_PREFIXES.some((prefix) => token.startsWith(prefix));
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

interface MPNotification {
  id?: number | string;
  type?: string;
  topic?: string;
  action?: string;
  data?: { id?: number | string };
  resource?: string;
  api_version?: string;
  date_created?: string;
  user_id?: number | string;
}

function parseNotification(body: unknown): MPNotification | null {
  if (!body || typeof body !== 'object') return null;
  return body as MPNotification;
}

async function resolvePayment(paymentId: string | number): Promise<unknown> {
  const accessToken = import.meta.env.MERCADOPAGO_ACCESS_TOKEN;
  if (!accessToken || isPlaceholderToken(accessToken)) {
    return { skipped: true, reason: 'placeholder-token' };
  }
  const client = new MercadoPagoConfig({ accessToken, options: { timeout: 5000 } });
  const payment = new Payment(client);
  const result = await payment.get({ id: String(paymentId) });
  return result;
}

/* -------------------------------------------------------------------------- */
/*  POST handler — formato nativo de Mercado Pago                             */
/* -------------------------------------------------------------------------- */

export const POST: APIRoute = async ({ request }) => {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return jsonResponse({ error: 'Body inválido. Se esperaba JSON.' }, 400);
  }

  const notification = parseNotification(payload);
  if (!notification) {
    return jsonResponse({ error: 'Notificación inválida.' }, 400);
  }

  const topic = (notification.topic ?? notification.type ?? '').toLowerCase();
  const receivedAt = new Date().toISOString();

  // Notificación de prueba
  if (topic === 'test') {
    console.log('[webhook] test notification received', { receivedAt, payload });
    return jsonResponse({ ok: true, mode: 'test', receivedAt });
  }

  // Notificación de pago
  if (topic === 'payment') {
    const paymentId = notification.data?.id ?? notification.id;
    if (!paymentId) {
      console.warn('[webhook] payment notification without id', { receivedAt, payload });
      return jsonResponse({ error: 'Notificación de pago sin id.' }, 400);
    }

    console.log('[webhook] payment notification', {
      receivedAt,
      paymentId,
      action: notification.action ?? null,
      apiVersion: notification.api_version ?? null,
    });

    try {
      const payment = await resolvePayment(paymentId);
      console.log('[webhook] payment resolved', JSON.stringify(payment, null, 2));
    } catch (err) {
      console.error('[webhook] failed to resolve payment', err);
      // Devolvemos 200 igual: ya logueamos el problema y MP reintentará.
    }

    return jsonResponse({
      ok: true,
      mode: 'payment',
      paymentId: String(paymentId),
      receivedAt,
    });
  }

  // Otros topics (merchant_order, subscription, etc.) — logueamos y devolvemos 200.
  console.log('[webhook] unhandled topic', { receivedAt, topic, payload });
  return jsonResponse({ ok: true, mode: 'unhandled', topic, receivedAt });
};

/* -------------------------------------------------------------------------- */
/*  GET handler — verificación de salud + explicación del esquema            */
/* -------------------------------------------------------------------------- */

export const GET: APIRoute = async () => {
  return jsonResponse({
    endpoint: '/api/webhook',
    provider: 'mercadopago',
    description:
      'Endpoint para recibir notificaciones IPN de Mercado Pago. ' +
      'Soporta topic=payment (resuelve el pago por id) y topic=test (verificación).',
    schema: {
      incoming: {
        topic: '"payment" | "test" | "merchant_order" | otros',
        data: '{ id: string|number } (id del recurso)',
        action: '"payment.created" | "payment.updated" (opcional)',
        api_version: 'string',
        date_created: 'ISO timestamp',
      },
      resolved_payment: {
        id: 'numeric',
        status: '"approved" | "pending" | "rejected" | "cancelled" | "in_process" | "refunded"',
        status_detail: 'string',
        transaction_amount: 'number',
        currency_id: '"ARS"',
        external_reference: 'string (nuestra external_reference)',
        payer: '{ email, first_name, last_name }',
        payment_method_id: 'string (ej. "visa", "master")',
        date_approved: 'ISO timestamp | null',
      },
      response: '{ ok: true, mode, paymentId?, receivedAt }',
    },
    notes: [
      'Mercado Pago reintenta la notificación hasta 12 veces si no recibe 200.',
      'Devolvemos 200 apenas confirmamos la recepción; el procesamiento pesado (envío de mail, etc.) debe ir a una cola.',
      'En producción validar x-signature header contra el secret de la app.',
    ],
  });
};
