/**
 * Utilidades de fecha para el proyecto SQL Guard Observatory.
 * 
 * IMPORTANTE: Las fechas del servidor SQL ya vienen en hora Argentina (UTC-3)
 * porque el servidor usa GETDATE() que devuelve hora local.
 * NO necesitamos hacer conversiones de zona horaria.
 */

/**
 * Parsea una fecha del servidor y la devuelve como Date.
 * Las fechas del backend ya vienen en hora Argentina (GETDATE() del servidor SQL).
 * Esta función simplemente parsea el string sin hacer conversiones de zona horaria.
 * 
 * @param date - Fecha en formato string ISO o Date
 * @returns Date parseada
 */
export function toArgentinaTime(date: string | Date | null | undefined): Date {
  if (!date) return new Date();
  
  // Si es string, parseamos directamente
  // Las fechas del servidor ya están en hora Argentina
  if (typeof date === 'string') {
    // Si el string no tiene zona horaria (no termina en Z ni tiene +/-),
    // lo parseamos como hora local (que es lo que queremos si el navegador está en Argentina)
    // o simplemente lo usamos tal cual
    return new Date(date);
  }
  
  return date;
}

/**
 * Formatea una fecha en hora Argentina usando date-fns.
 * Wrapper que primero convierte a UTC-3 y luego aplica el formato.
 * 
 * @param date - Fecha en formato string ISO o Date
 * @param formatStr - String de formato de date-fns
 * @param options - Opciones adicionales para date-fns format
 * @returns String formateado
 */
export function formatArgentina(
  date: string | Date | null | undefined,
  formatStr: string,
  options?: { locale?: Locale }
): string {
  if (!date) return '-';
  
  try {
    const argDate = toArgentinaTime(date);
    // Importamos format dinámicamente para evitar dependencia circular
    const { format } = require('date-fns');
    return format(argDate, formatStr, options);
  } catch {
    return '-';
  }
}

// Re-export para facilitar uso con locale
import type { Locale } from 'date-fns';

