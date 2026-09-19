/**
 * Cart store · Mate Raíz
 *
 * Carrito persistente en `localStorage`. Items con shape:
 *   { id: string, productId: string, variant: { woodId, ringId, engravingId, engravingText }, quantity: number }
 *
 * `id` se genera como `productId|woodId|ringId|engravingId|engravingText` para
 * que dos items con la misma configuración se acumulen en lugar de duplicarse.
 *
 * Patrón: vanilla JS reactivo. Mismo estilo que `variant-store.ts` para
 * mantener consistencia. Sin dependencias externas.
 */

export interface CartVariant {
  woodId?: string;
  ringId?: string;
  engravingId?: string;
  engravingText?: string;
}

export interface CartItem {
  id: string;
  productId: string;
  variant: CartVariant;
  quantity: number;
  addedAt: number;
}

export interface CartState {
  items: CartItem[];
  promoCode: string | null;
}

const STORAGE_KEY = 'mate-raiz:cart';

function defaultState(): CartState {
  return { items: [], promoCode: null };
}

function load(): CartState {
  if (typeof window === 'undefined') return defaultState();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw) as Partial<CartState>;
    return {
      items: Array.isArray(parsed.items) ? parsed.items.filter(isCartItem) : [],
      promoCode: typeof parsed.promoCode === 'string' ? parsed.promoCode : null,
    };
  } catch {
    return defaultState();
  }
}

function isCartItem(value: unknown): value is CartItem {
  if (!value || typeof value !== 'object') return false;
  const v = value as Partial<CartItem>;
  return (
    typeof v.id === 'string' &&
    typeof v.productId === 'string' &&
    typeof v.quantity === 'number' &&
    v.quantity > 0 &&
    typeof v.variant === 'object' &&
    v.variant !== null
  );
}

function save(state: CartState): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // localStorage deshabilitado. No-op silencioso.
  }
}

type Listener = (state: CartState) => void;
const listeners = new Set<Listener>();
let state: CartState = load();

function makeItemId(productId: string, variant: CartVariant): string {
  const parts = [
    productId,
    variant.woodId ?? '',
    variant.ringId ?? '',
    variant.engravingId ?? '',
    (variant.engravingText ?? '').trim().toLowerCase(),
  ];
  return parts.join('|');
}

export function getCart(): CartState {
  return {
    items: state.items.map((item) => ({ ...item, variant: { ...item.variant } })),
    promoCode: state.promoCode,
  };
}

export function subscribeCart(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function emit(): void {
  for (const listener of listeners) listener(getCart());
}

export function addToCart(input: {
  productId: string;
  variant?: CartVariant;
  quantity?: number;
}): CartItem {
  const variant = input.variant ?? {};
  const quantity = Math.max(1, Math.min(10, Math.floor(input.quantity ?? 1)));
  const id = makeItemId(input.productId, variant);

  const existing = state.items.find((item) => item.id === id);
  if (existing) {
    existing.quantity = Math.min(10, existing.quantity + quantity);
  } else {
    state.items.push({
      id,
      productId: input.productId,
      variant,
      quantity,
      addedAt: Date.now(),
    });
  }

  save(state);
  emit();
  return existing ?? state.items[state.items.length - 1];
}

export function updateQuantity(itemId: string, quantity: number): void {
  const clamped = Math.max(1, Math.min(10, Math.floor(quantity)));
  const item = state.items.find((i) => i.id === itemId);
  if (item) {
    item.quantity = clamped;
    save(state);
    emit();
  }
}

export function removeFromCart(itemId: string): void {
  state.items = state.items.filter((i) => i.id !== itemId);
  save(state);
  emit();
}

export function clearCart(): void {
  state = { items: [], promoCode: null };
  save(state);
  emit();
}

export function setPromoCode(code: string | null): void {
  state.promoCode = code && code.trim().length > 0 ? code.trim().toUpperCase() : null;
  save(state);
  emit();
}

/**
 * Cantidad total de unidades en el carrito (suma de quantities).
 */
export function cartCount(current: CartState = state): number {
  return current.items.reduce((acc, item) => acc + item.quantity, 0);
}

/**
 * Cantidad de líneas distintas (sin sumar quantities).
 */
export function cartLines(current: CartState = state): number {
  return current.items.length;
}
