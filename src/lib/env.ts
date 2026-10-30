export const PRODUCTION_ORIGIN: string | undefined = import.meta.env.VITE_PRODUCTION_ORIGIN

function normalize(origin: string): string {
  return origin.trim().replace(/\/+$/, '').toLowerCase()
}

export function isProductionOrigin(current: string, production: string | undefined): boolean {
  if (!production) return false
  return normalize(current) === normalize(production)
}
