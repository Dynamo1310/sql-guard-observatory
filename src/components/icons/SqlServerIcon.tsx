/**
 * Ícono de SQL Server que alterna entre versión clara/oscura según el tema
 * Compatible con la interfaz de Lucide para uso en menús y páginas
 */
import sqlServerIconBlack from '/icons8-servidor-microsoft-sql-black.svg';
import sqlServerIconWhite from '/icons8-servidor-microsoft-sql-white.svg';

interface SqlServerIconProps {
  /** className con tamaño (ej: "h-4 w-4", "h-8 w-8") - compatible con Lucide */
  className?: string;
}

export function SqlServerIcon({ className = 'h-4 w-4' }: SqlServerIconProps) {
  // Extraer clases de tamaño (h-X w-X) y otras clases por separado
  const sizeClasses = className.match(/[hw]-\d+\.?\d*|[hw]-\[[\w.]+\]/g)?.join(' ') || 'h-4 w-4';
  const otherClasses = className.replace(/[hw]-\d+\.?\d*|[hw]-\[[\w.]+\]/g, '').trim();
  
  return (
    <span className={`inline-flex items-center justify-center flex-shrink-0 ${otherClasses}`}>
      <img 
        src={sqlServerIconBlack} 
        alt="SQL Server" 
        className={`logo-light ${sizeClasses}`}
      />
      <img 
        src={sqlServerIconWhite} 
        alt="SQL Server" 
        className={`logo-dark ${sizeClasses}`}
      />
    </span>
  );
}

export default SqlServerIcon;

