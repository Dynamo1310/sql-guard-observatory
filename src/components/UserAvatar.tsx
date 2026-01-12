import * as React from "react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { User } from "lucide-react";

interface UserAvatarProps {
  /** URL de la foto de perfil (puede ser data:image/... o URL externa) */
  photoUrl?: string | null;
  /** Nombre para mostrar del usuario (usado para generar iniciales) */
  displayName?: string;
  /** Nombre de usuario de dominio (fallback para iniciales) */
  domainUser?: string;
  /** Tamaño del avatar */
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  /** Color de fondo personalizado para el fallback */
  fallbackColor?: string;
  /** Clases CSS adicionales */
  className?: string;
  /** Mostrar indicador de estado online */
  showStatus?: boolean;
  /** Estado del usuario */
  isOnline?: boolean;
}

const sizeClasses = {
  xs: "h-7 w-7 text-xs",
  sm: "h-9 w-9 text-sm",
  md: "h-11 w-11 text-base",
  lg: "h-14 w-14 text-lg",
  xl: "h-20 w-20 text-xl",
};

const statusSizeClasses = {
  xs: "h-2 w-2 bottom-0 right-0",
  sm: "h-2.5 w-2.5 bottom-0 right-0",
  md: "h-3 w-3 bottom-0 right-0",
  lg: "h-3.5 w-3.5 -bottom-0.5 -right-0.5",
  xl: "h-4 w-4 -bottom-1 -right-1",
};

/**
 * Genera las iniciales del usuario a partir de su nombre
 */
function getInitials(displayName?: string, domainUser?: string): string {
  if (displayName) {
    const parts = displayName.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    if (parts.length === 1 && parts[0].length >= 2) {
      return parts[0].slice(0, 2).toUpperCase();
    }
    return parts[0]?.[0]?.toUpperCase() || "?";
  }
  
  if (domainUser) {
    // Tomar las primeras 2 letras del usuario de dominio
    return domainUser.slice(0, 2).toUpperCase();
  }
  
  return "?";
}

/**
 * Genera un color consistente basado en el nombre del usuario
 */
function getConsistentColor(name: string): string {
  // Colores monocromáticos con variaciones de opacidad para estilo Sonner
  const colors = [
    "bg-foreground/90",
    "bg-foreground/80",
    "bg-foreground/70",
    "bg-foreground/60",
    "bg-muted-foreground/90",
    "bg-muted-foreground/80",
    "bg-muted-foreground/70",
    "bg-muted-foreground/60",
    "bg-primary/90",
    "bg-primary/80",
    "bg-primary/70",
    "bg-primary/60",
    "bg-primary",
    "bg-foreground",
    "bg-muted-foreground",
    "bg-primary/50",
  ];
  
  // Hash simple basado en caracteres del nombre
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  
  const index = Math.abs(hash) % colors.length;
  return colors[index];
}

/**
 * Componente de Avatar de Usuario con soporte para fotos de perfil,
 * fallback con iniciales y colores consistentes.
 */
export function UserAvatar({
  photoUrl,
  displayName,
  domainUser,
  size = "md",
  fallbackColor,
  className,
  showStatus = false,
  isOnline = false,
}: UserAvatarProps) {
  const initials = getInitials(displayName, domainUser);
  const bgColor = fallbackColor || getConsistentColor(displayName || domainUser || "default");
  
  return (
    <div className="relative inline-block">
      <Avatar className={cn(sizeClasses[size], "ring-2 ring-background", className)}>
        {photoUrl && (
          <AvatarImage
            src={photoUrl}
            alt={displayName || domainUser || "Usuario"}
            className="object-cover"
          />
        )}
        <AvatarFallback
          className={cn(
            bgColor,
            "text-white font-medium",
            "flex items-center justify-center"
          )}
        >
          {initials !== "?" ? initials : <User className="h-1/2 w-1/2" />}
        </AvatarFallback>
      </Avatar>
      
      {/* Indicador de estado */}
      {showStatus && (
        <span
          className={cn(
            "absolute rounded-full border-2 border-background transition-colors",
            statusSizeClasses[size],
            isOnline ? "bg-success" : "bg-muted-foreground/50"
          )}
        />
      )}
    </div>
  );
}

/**
 * Versión más pequeña y compacta para usar en listas
 */
export function UserAvatarSmall({
  photoUrl,
  displayName,
  domainUser,
}: Pick<UserAvatarProps, "photoUrl" | "displayName" | "domainUser">) {
  return (
    <UserAvatar
      photoUrl={photoUrl}
      displayName={displayName}
      domainUser={domainUser}
      size="sm"
    />
  );
}

/**
 * Avatar con nombre del usuario al lado
 */
interface UserAvatarWithNameProps extends UserAvatarProps {
  /** Mostrar el rol del usuario */
  role?: string;
  /** Color del rol */
  roleColor?: string;
}

export function UserAvatarWithName({
  photoUrl,
  displayName,
  domainUser,
  role,
  roleColor,
  size = "md",
  className,
  ...props
}: UserAvatarWithNameProps) {
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <UserAvatar
        photoUrl={photoUrl}
        displayName={displayName}
        domainUser={domainUser}
        size={size}
        {...props}
      />
      <div className="flex flex-col min-w-0">
        <span className="font-medium truncate text-sm">
          {displayName || domainUser || "Usuario"}
        </span>
        {role && (
          <span
            className="text-xs truncate text-muted-foreground"
            style={{ color: roleColor || undefined }}
          >
            {role}
          </span>
        )}
      </div>
    </div>
  );
}

export default UserAvatar;
