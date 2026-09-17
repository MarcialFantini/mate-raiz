import zonas from '../data/zonas-envio.json';
import { formatARS } from './format';

/**
 * Resolver de zonas de envío a partir de un código postal argentino de 4
 * dígitos. La tabla `zonas-envio.json` declara rangos por provincia/zona.
 */

export interface ShippingOption {
  cost: number;
  label: string;
  eta: string;
  carrier: string;
}

export interface ShippingZone {
  id: string;
  label: string;
  description: string;
  rangos: Array<{ min: number; max: number }>;
  estandar: ShippingOption;
  express: ShippingOption;
}

export interface ShippingState {
  cp: string;
  cpValid: boolean;
  zona: ShippingZone | null;
  tipo: 'estandar' | 'express';
}

export type ShippingListener = (state: ShippingState) => void;

const STORAGE_KEY = 'mate-raiz:shipping';

function defaultState(): ShippingState {
  return {
    cp: '',
    cpValid: false,
    zona: null,
    tipo: 'estandar',
  };
}

function load(): ShippingState {
  if (typeof window === 'undefined') return defaultState();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    return { ...defaultState(), ...JSON.parse(raw) } as ShippingState;
  } catch {
    return defaultState();
  }
}

function save(state: ShippingState): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // localStorage puede estar deshabilitado. No-op silencioso.
  }
}

const listeners = new Set<ShippingListener>();
let state = load();

export function getShippingState(): ShippingState {
  return { ...state };
}

export function subscribeShipping(listener: ShippingListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function setShipping(patch: Partial<ShippingState>): void {
  state = { ...state, ...patch };
  save(state);
  for (const listener of listeners) listener(state);
}

/**
 * Valida que un CP sea un entero de 4 dígitos (los códigos postales
 * argentinos tienen exactamente 4 dígitos, sin letras).
 */
export function isValidCP(raw: string): boolean {
  return /^\d{4}$/.test(raw.trim());
}

/**
 * Resuelve la zona (CABA / GBA / Interior / Resto) a partir del CP.
 * Devuelve `null` si el CP no está en ningún rango conocido.
 */
export function findZoneByCP(cp: string): ShippingZone | null {
  if (!isValidCP(cp)) return null;
  const cpInt = parseInt(cp, 10);
  const data = zonas as { zonas: ShippingZone[] };
  for (const zona of data.zonas) {
    for (const rango of zona.rangos) {
      if (cpInt >= rango.min && cpInt <= rango.max) return zona;
    }
  }
  return null;
}

/**
 * Costo de envío para el estado actual. Devuelve `null` si no hay zona.
 */
export function shippingCost(current: ShippingState): number | null {
  if (!current.zona) return null;
  return current.tipo === 'express' ? current.zona.express.cost : current.zona.estandar.cost;
}

/**
 * ETA legible (ej. "3 a 5 días hábiles").
 */
export function shippingEta(current: ShippingState): string | null {
  if (!current.zona) return null;
  return current.tipo === 'express' ? current.zona.express.eta : current.zona.estandar.eta;
}

/**
 * Carrier legible para mostrar en UI.
 */
export function shippingCarrier(current: ShippingState): string | null {
  if (!current.zona) return null;
  return current.tipo === 'express' ? current.zona.express.carrier : current.zona.estandar.carrier;
}

export { formatARS };
