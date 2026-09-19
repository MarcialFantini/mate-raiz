import productsData from '../data/products.json';
import variantsData from '../data/variants.json';
import { formatARS } from './format';

/**
 * Catálogo de productos. Single source of truth: `src/data/products.json`.
 * Este módulo expone helpers tipados para usar tanto en páginas `.astro`
 * (en SSR/build-time) como en scripts del cliente.
 */

export interface ProductSpec {
  label: string;
  value: string;
  detail: string;
}

export interface ProductImage {
  src: string;
  alt: string;
  width: number;
  height: number;
}

export interface ProductProcessStep {
  step: number;
  title: string;
  body: string;
}

export interface ProductMaker {
  name: string;
  location: string;
  since: string;
  story: string;
}

export interface Product {
  id: string;
  slug: string;
  name: string;
  subtitle: string;
  tagline: string;
  model: string;
  category: 'imperial' | 'torpedo' | 'camionero' | 'accesorios';
  price: { amount: number; currency: string; formatted: string; installments: string };
  description: string;
  images: ProductImage[];
  specs: ProductSpec[];
  story: string;
  featured?: boolean;
  availableWoods: string[];
  availableRings: string[];
  availableEngravings: string[];
  outOfStock: Array<{ model: string; wood?: string; ring?: string; reason: string }>;
  /** Editorial process steps (Imperial). Opcional: solo presente en featured. */
  process?: ProductProcessStep[];
  /** Editorial care instructions (Imperial). Opcional. */
  care?: string[];
  /** Editorial maker bio (Imperial). Opcional. */
  maker?: ProductMaker;
}

const PRODUCTS = (productsData as { products: Product[] }).products;

export function getAllProducts(): Product[] {
  return PRODUCTS;
}

export function getProductBySlug(slug: string): Product | undefined {
  return PRODUCTS.find((p) => p.slug === slug);
}

export function getProductById(id: string): Product | undefined {
  return PRODUCTS.find((p) => p.id === id);
}

export function getFeaturedProduct(): Product {
  return PRODUCTS.find((p) => p.featured) ?? PRODUCTS[0];
}

/**
 * Opciones de variante FILTRADAS según las que el producto admite. Las que
 * el producto no admite (por ejemplo, grabados para una bombilla) quedan
 * fuera del array y no aparecen en el formulario.
 */
export function getProductOptions(product: Product) {
  const all = variantsData as {
    models: Array<{ id: string; label: string; description: string; basePrice: number; priceModifier: number; modifierLabel: string; hidesWood?: boolean; hidesRing?: boolean }>;
    woods: Array<{ id: string; label: string; description: string; priceModifier: number; modifierLabel: string }>;
    rings: Array<{ id: string; label: string; description: string; priceModifier: number; modifierLabel: string }>;
    engravings: Array<{ id: string; label: string; description: string; priceModifier: number; modifierLabel: string; needsText?: boolean; maxChars?: number; placeholder?: string }>;
    outOfStock: Array<{ model: string; wood?: string; ring?: string; reason: string }>;
  };

  return {
    model: all.models.find((m) => m.id === product.model) ?? all.models[0],
    woods: product.availableWoods
      .map((id) => all.woods.find((w) => w.id === id))
      .filter((w): w is NonNullable<typeof w> => Boolean(w)),
    rings: product.availableRings
      .map((id) => all.rings.find((r) => r.id === id))
      .filter((r): r is NonNullable<typeof r> => Boolean(r)),
    engravings: product.availableEngravings
      .map((id) => all.engravings.find((e) => e.id === id))
      .filter((e): e is NonNullable<typeof e> => Boolean(e)),
    outOfStock: product.outOfStock,
  };
}

/**
 * Etiqueta legible de la combinación (modelo · madera · virola · grabado).
 */
export function variantLabel(input: {
  model?: { id: string; label: string; hidesWood?: boolean; hidesRing?: boolean } | null;
  wood?: { id: string; label: string } | null;
  ring?: { id: string; label: string } | null;
  engraving?: { id: string; label: string } | null;
  engravingText?: string;
}): string {
  const parts: string[] = [];
  if (input.model) parts.push(input.model.label);
  if (input.wood && !input.model?.hidesWood) parts.push(input.wood.label);
  if (input.ring && !input.model?.hidesRing) parts.push(input.ring.label);
  if (input.engraving && input.engraving.id !== 'ninguno') {
    const text = (input.engravingText ?? '').trim();
    parts.push(text ? `${input.engraving.label}: "${text}"` : input.engraving.label);
  }
  return parts.join(' · ');
}

/**
 * Precio unitario final combinando el modelo base con modificadores de las
 * dimensiones seleccionadas. Server-side para que el cliente no pueda
 * alterar el monto.
 */
export function computeUnitPrice(
  product: Product,
  variant: {
    modelId?: string;
    woodId?: string;
    ringId?: string;
    engravingId?: string;
  },
): number {
  const opts = getProductOptions(product);
  const wood = variant.woodId ? opts.woods.find((w) => w.id === variant.woodId) : null;
  const ring = variant.ringId ? opts.rings.find((r) => r.id === variant.ringId) : null;
  const engraving = variant.engravingId
    ? opts.engravings.find((e) => e.id === variant.engravingId)
    : null;

  const base =
    product.price.amount +
    (wood?.priceModifier ?? 0) +
    (ring?.priceModifier ?? 0) +
    (engraving?.priceModifier ?? 0);

  return Math.max(0, base);
}

/**
 * Imagen principal de un producto (la primera del array `images`).
 */
export function getPrimaryImage(product: Product): ProductImage {
  return product.images[0];
}

export { formatARS };
