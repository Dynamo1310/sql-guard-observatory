/**
 * Ícono de Redis que alterna entre versión clara/oscura según el tema
 * Compatible con la interfaz de Lucide para uso en menús y páginas
 */
import redisIconBlack from '/icons8-redistribuir-black.svg';
import redisIconWhite from '/icons8-redistribuir-white.svg';

interface RedisIconProps {
  /** className con tamaño (ej: "h-4 w-4", "h-8 w-8") - compatible con Lucide */
  className?: string;
}

export function RedisIcon({ className = 'h-4 w-4' }: RedisIconProps) {
  // Extraer clases de tamaño (h-X w-X) y otras clases por separado
  const sizeClasses = className.match(/[hw]-\d+\.?\d*|[hw]-\[[\w.]+\]/g)?.join(' ') || 'h-4 w-4';
  const otherClasses = className.replace(/[hw]-\d+\.?\d*|[hw]-\[[\w.]+\]/g, '').trim();
  
  return (
    <span className={`inline-flex items-center justify-center flex-shrink-0 ${otherClasses}`}>
      <img 
        src={redisIconBlack} 
        alt="Redis" 
        className={`logo-light ${sizeClasses}`}
      />
      <img 
        src={redisIconWhite} 
        alt="Redis" 
        className={`logo-dark ${sizeClasses}`}
      />
    </span>
  );
}

export default RedisIcon;



