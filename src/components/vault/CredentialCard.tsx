/**
 * Tarjeta de credencial para mostrar en listas
 * Enterprise v2.1.1 - Usa permisos bitmask del backend
 */
import { useState } from 'react';
import { 
  Key, Server, Calendar, User, Lock, Unlock, MoreVertical,
  Edit, Trash2, History, AlertTriangle, Database, Monitor, Share2, Users,
  Plug, KeyRound, ShieldAlert
} from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { CredentialDto } from '@/services/vaultApi';
import { PasswordReveal } from './PasswordReveal';
import { format, formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';

interface CredentialCardProps {
  credential: CredentialDto;
  onEdit?: (credential: CredentialDto) => void;
  onDelete?: (credential: CredentialDto) => void;
  onViewAudit?: (credential: CredentialDto) => void;
  onShare?: (credential: CredentialDto) => void;
  onUse?: (credential: CredentialDto) => void;
  onUpdateSecret?: (credential: CredentialDto) => void;
  showActions?: boolean;
  variant?: 'default' | 'compact';
}

const credentialTypeConfig = {
  SqlAuth: {
    label: 'SQL Server',
    icon: Database,
    color: 'bg-blue-500/10 text-blue-600 border-blue-200'
  },
  WindowsAD: {
    label: 'Windows/AD',
    icon: Monitor,
    color: 'bg-purple-500/10 text-purple-600 border-purple-200'
  },
  Other: {
    label: 'Otro',
    icon: Key,
    color: 'bg-gray-500/10 text-gray-600 border-gray-200'
  }
};

export function CredentialCard({
  credential,
  onEdit,
  onDelete,
  onViewAudit,
  onShare,
  onUse,
  onUpdateSecret,
  showActions = true,
  variant = 'default'
}: CredentialCardProps) {
  // Usar permisos del backend (Enterprise v2.1.1)
  // El backend es la fuente de verdad para autorización
  const { canReveal, canUse, canEdit, canShare, canDelete, canViewAudit, canUpdateSecret } = credential;
  const typeConfig = credentialTypeConfig[credential.credentialType] || credentialTypeConfig.Other;
  const TypeIcon = typeConfig.icon;

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return null;
    try {
      return format(new Date(dateStr), "d 'de' MMM yyyy", { locale: es });
    } catch {
      return null;
    }
  };

  const getExpirationStatus = () => {
    if (credential.isExpired) {
      return {
        variant: 'destructive' as const,
        label: 'Expirada',
        icon: AlertTriangle
      };
    }
    if (credential.isExpiringSoon) {
      return {
        variant: 'warning' as const,
        label: 'Por expirar',
        icon: AlertTriangle
      };
    }
    return null;
  };

  const expirationStatus = getExpirationStatus();

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <div className={`p-2 rounded-lg ${typeConfig.color}`}>
              <TypeIcon className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h3 className="font-semibold truncate">{credential.name}</h3>
                {credential.isPrivate ? (
                  <Tooltip>
                    <TooltipTrigger>
                      <Lock className="h-3.5 w-3.5 text-amber-500" />
                    </TooltipTrigger>
                    <TooltipContent>Credencial privada</TooltipContent>
                  </Tooltip>
                ) : credential.isTeamShared ? (
                  <Tooltip>
                    <TooltipTrigger>
                      <Users className="h-3.5 w-3.5 text-blue-500" />
                    </TooltipTrigger>
                    <TooltipContent>Compartida con todo el equipo</TooltipContent>
                  </Tooltip>
                ) : (
                  <Tooltip>
                    <TooltipTrigger>
                      <Share2 className="h-3.5 w-3.5 text-green-500" />
                    </TooltipTrigger>
                    <TooltipContent>Compartida selectivamente</TooltipContent>
                  </Tooltip>
                )}
              </div>
              <p className="text-sm text-muted-foreground truncate">
                {credential.domain ? `${credential.domain}\\${credential.username}` : credential.username}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <Badge variant="outline" className={typeConfig.color}>
              {typeConfig.label}
            </Badge>
            
            {expirationStatus && (
              <Badge variant={expirationStatus.variant === 'warning' ? 'outline' : expirationStatus.variant} 
                className={expirationStatus.variant === 'warning' ? 'border-amber-300 bg-amber-50 text-amber-700' : ''}>
                <expirationStatus.icon className="h-3 w-3 mr-1" />
                {expirationStatus.label}
              </Badge>
            )}

            {showActions && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8">
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {/* Usar sin revelar - Enterprise v2.1.1 */}
                  {onUse && canUse && (
                    <DropdownMenuItem onClick={() => onUse(credential)}>
                      <Plug className="h-4 w-4 mr-2" />
                      Usar sin revelar
                    </DropdownMenuItem>
                  )}
                  
                  {/* Actualizar password - Enterprise v2.1.1 */}
                  {onUpdateSecret && canUpdateSecret && (
                    <DropdownMenuItem onClick={() => onUpdateSecret(credential)}>
                      <KeyRound className="h-4 w-4 mr-2" />
                      Actualizar contraseña
                    </DropdownMenuItem>
                  )}
                  
                  {/* Compartir */}
                  {onShare && canShare && (
                    <DropdownMenuItem onClick={() => onShare(credential)}>
                      <Share2 className="h-4 w-4 mr-2" />
                      Compartir
                    </DropdownMenuItem>
                  )}
                  
                  {/* Editar */}
                  {onEdit && canEdit && (
                    <DropdownMenuItem onClick={() => onEdit(credential)}>
                      <Edit className="h-4 w-4 mr-2" />
                      Editar
                    </DropdownMenuItem>
                  )}
                  
                  {/* Ver historial */}
                  {onViewAudit && canViewAudit && (
                    <DropdownMenuItem onClick={() => onViewAudit(credential)}>
                      <History className="h-4 w-4 mr-2" />
                      Ver historial
                    </DropdownMenuItem>
                  )}
                  
                  {/* Eliminar */}
                  {onDelete && canDelete && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem 
                        onClick={() => onDelete(credential)}
                        className="text-destructive focus:text-destructive"
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Eliminar
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        {/* Password reveal - Solo si tiene permiso */}
        <div className="flex items-center justify-between gap-2 p-2 bg-muted/50 rounded-lg">
          <span className="text-sm font-medium text-muted-foreground">Contraseña:</span>
          {canReveal ? (
            <PasswordReveal credentialId={credential.id} />
          ) : (
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center gap-1 text-sm text-muted-foreground">
                  <ShieldAlert className="h-4 w-4" />
                  <span>Sin permiso para revelar</span>
                </div>
              </TooltipTrigger>
              <TooltipContent>
                No tienes permiso para revelar esta contraseña.
                Contacta al owner para solicitar acceso.
              </TooltipContent>
            </Tooltip>
          )}
        </div>

        {/* Descripción */}
        {credential.description && (
          <p className="text-sm text-muted-foreground line-clamp-2">
            {credential.description}
          </p>
        )}

        {/* Servidores asociados */}
        {credential.servers.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {credential.servers.slice(0, 3).map((server) => (
              <Badge key={server.id} variant="secondary" className="text-xs">
                <Server className="h-3 w-3 mr-1" />
                {server.fullServerName}
              </Badge>
            ))}
            {credential.servers.length > 3 && (
              <Badge variant="secondary" className="text-xs">
                +{credential.servers.length - 3} más
              </Badge>
            )}
          </div>
        )}

        {/* Metadatos */}
        <div className="flex items-center justify-between text-xs text-muted-foreground pt-2 border-t">
          <div className="flex items-center gap-1">
            <User className="h-3 w-3" />
            <span>{credential.ownerDisplayName || 'Sin propietario'}</span>
          </div>
          
          {credential.expiresAt && (
            <div className="flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              <span>Expira: {formatDate(credential.expiresAt)}</span>
            </div>
          )}
          
          {!credential.expiresAt && credential.updatedAt && (
            <span>
              Actualizada {formatDistanceToNow(new Date(credential.updatedAt), { locale: es, addSuffix: true })}
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default CredentialCard;

