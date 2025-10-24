import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Formatea una fecha UTC a la zona horaria de Argentina (UTC-3)
 * @param dateString - Fecha en formato ISO string o Date
 * @param includeTime - Si incluir la hora (por defecto true)
 * @returns Fecha formateada en formato dd/MM/yyyy, HH:mm:ss
 */
export function formatDateUTC3(dateString: string | Date | null | undefined, includeTime: boolean = true): string {
  if (!dateString) return 'N/A';
  
  try {
    const date = new Date(dateString);
    
    // Verificar si la fecha es válida
    if (isNaN(date.getTime())) return 'N/A';
    
    // Formatear en zona horaria de Argentina (America/Argentina/Buenos_Aires = UTC-3)
    const options: Intl.DateTimeFormatOptions = {
      timeZone: 'America/Argentina/Buenos_Aires',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      ...(includeTime && {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      })
    };
    
    return new Intl.DateTimeFormat('es-AR', options).format(date);
  } catch (error) {
    console.error('Error formateando fecha:', error);
    return 'N/A';
  }
}