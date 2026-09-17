import variants from '../data/variants.json';
import { formatARS, formatInstallments } from './format';

/**
 * Store de variantes de producto. Patrón vanilla JS reactivo: un `state`
 * privado, un Set de listeners, y métodos `get/set/subscribe`. El estado se
 * persiste en `localStorage` para sobrevivir a la navegación entre
 * secciones de la landing sin que el usuario pierda su selección.
 */

export interface VariantOption {
  id: string;
  label: string;
  description: string;
  priceModifier: number;
  modifierLabel: string;
  needsText?: boolean;
  maxChars?: number;
  placeholder?: string;
  hidesWood?: boolean;
  hidesRing?: boolean;
  basePrice?: number;
}

export interface VariantModel extends VariantOption {
  basePrice: number;
}

export interface VariantsData {
  models: VariantModel[];
  woods: VariantOption[];
  rings: VariantOption[];
  engravings: VariantOption[];
  outOfStock: Array<{ model: string; wood: string; ring?: string; reason: string }>;
}

export interface VariantState {
  modelId: string;
  woodId: string;
  ringId: string;
  engravingId: string;
  engravingText: string;
}

const STORAGE_KEY = 'mate-raiz:variants';

function defaultState(): VariantState {
  return {
    modelId: variants.models[0].id,
    woodId: variants.woods[0].id,
    ringId: variants.rings[0].id,
    engravingId: variants.engravings[0].id,
    engravingText: '',
  };
}

function load(): VariantState {
  if (typeof window === 'undefined') return defaultState();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw) as Partial<VariantState>;
    return {
      ...defaultState(),
      ...parsed,
    };
  } catch {
    return defaultState();
  }
}

function save(state: VariantState): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // localStorage puede estar deshabilitado. No-op silencioso.
  }
}

type Listener = (state: VariantState) => void;

const listeners = new Set<Listener>();
let state = load();

export function getState(): VariantState {
  return { ...state };
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function setState(patch: Partial<VariantState>): void {
  state = { ...state, ...patch };
  save(state);
  for (const listener of listeners) listener(state);
}

export function resetState(): void {
  state = defaultState();
  save(state);
  for (const listener of listeners) listener(state);
}

/**
 * Búsqueda tipada de opciones dentro del dataset.
 */
export function findModel(id: string): VariantModel | undefined {
  return variants.models.find((m) => m.id === id);
}
export function findWood(id: string): VariantOption | undefined {
  return variants.woods.find((w) => w.id === id);
}
export function findRing(id: string): VariantOption | undefined {
  return variants.rings.find((r) => r.id === id);
}
export function findEngraving(id: string): VariantOption | undefined {
  return variants.engravings.find((e) => e.id === id);
}

/**
 * Determina si la combinación actual (modelo + madera + virola) está en la
 * lista de combinaciones agotadas. Devuelve un `reason` específico si lo
 * hay, o un mensaje genérico.
 */
export function outOfStockReason(current: VariantState): string | null {
  const model = findModel(current.modelId);
  if (!model) return null;

  const matches = variants.outOfStock.filter((entry) => {
    if (entry.model !== current.modelId) return false;
    if (entry.wood !== current.woodId) return false;
    if (entry.ring && entry.ring !== current.ringId) return false;
    return true;
  });

  if (matches.length === 0) return null;
  return matches[0].reason;
}

/**
 * Precio unitario final: base del modelo + modificadores por dimensión.
 */
export function unitPrice(current: VariantState): number {
  const model = findModel(current.modelId);
  if (!model) return 0;
  const wood = findWood(current.woodId);
  const ring = findRing(current.ringId);
  const engraving = findEngraving(current.engravingId);
  const total =
    model.basePrice +
    (wood?.priceModifier ?? 0) +
    (ring?.priceModifier ?? 0) +
    (engraving?.priceModifier ?? 0);
  return Math.max(0, total);
}

/**
 * Texto resumen de la combinación actual (para mostrar bajo el precio).
 */
export function configLine(current: VariantState): string {
  const model = findModel(current.modelId);
  if (!model) return '';
  const parts: string[] = [model.label];
  if (!model.hidesWood) {
    const wood = findWood(current.woodId);
    if (wood) parts.push(wood.label);
  }
  if (!model.hidesRing) {
    const ring = findRing(current.ringId);
    if (ring) parts.push(ring.label);
  }
  const engraving = findEngraving(current.engravingId);
  if (engraving && engraving.id !== 'ninguno') {
    parts.push(engraving.label);
  }
  return parts.join(' · ');
}

/**
 * Helpers re-exportados para que el script del componente pueda formatear
 * precios sin importar `format.ts` por separado.
 */
export { formatARS, formatInstallments };

/**
 * Lista exportada de modelos / maderas / virolas / grabados.
 */
export const data = variants as VariantsData;
