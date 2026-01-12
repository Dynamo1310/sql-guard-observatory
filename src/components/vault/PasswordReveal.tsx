/**
 * Componente para revelar y copiar passwords con auto-ocultación
 * Enterprise v2.1.1 - Incluye confirmación y warning de auditoría
 * v2.1.2 - Copiar sin revelar
 */
import { useState, useEffect, useCallback } from 'react';
import { Eye, EyeOff, Copy, Check, Loader2, ShieldAlert, ClipboardCopy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { vaultApi, copyToClipboardWithAutoClear } from '@/services/vaultApi';
import { toast } from 'sonner';

interface PasswordRevealProps {
  credentialId: number;
  disabled?: boolean;
  requireConfirmation?: boolean;  // Enterprise v2.1.1 - Pedir confirmación
}

export function PasswordReveal({ 
  credentialId, 
  disabled = false,
  requireConfirmation = true  // Por defecto requiere confirmación
}: PasswordRevealProps) {
  const [isRevealing, setIsRevealing] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isCopyingWithoutReveal, setIsCopyingWithoutReveal] = useState(false);
  const [password, setPassword] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [copiedWithoutReveal, setCopiedWithoutReveal] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);

  // Auto-ocultar password después del tiempo indicado
  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => {
        setCountdown(prev => prev - 1);
      }, 1000);
      return () => clearTimeout(timer);
    } else if (countdown === 0 && password) {
      setPassword(null);
      setIsRevealing(false);
    }
  }, [countdown, password]);

  // Click inicial - mostrar diálogo o revelar directamente
  const handleRevealClick = useCallback(() => {
    if (isRevealing) {
      // Ocultar inmediatamente
      setPassword(null);
      setIsRevealing(false);
      setCountdown(0);
      return;
    }

    if (requireConfirmation) {
      setShowConfirmDialog(true);
    } else {
      performReveal();
    }
  }, [isRevealing, requireConfirmation]);

  // Ejecutar la revelación real
  const performReveal = useCallback(async () => {
    setShowConfirmDialog(false);
    setIsLoading(true);
    try {
      const response = await vaultApi.revealPassword(credentialId);
      setPassword(response.password);
      setIsRevealing(true);
      setCountdown(response.expiresInSeconds);
      
      toast.success('Contraseña revelada', {
        description: `Se ocultará automáticamente en ${response.expiresInSeconds} segundos.`
      });
    } catch (error: any) {
      // Manejar error de permiso
      if (error.message?.includes('permiso')) {
        toast.error('Sin permiso', {
          description: 'No tienes permiso para revelar esta contraseña. Contacta al owner.'
        });
      } else {
        toast.error('Error', {
          description: error instanceof Error ? error.message : 'No se pudo revelar la contraseña'
        });
      }
    } finally {
      setIsLoading(false);
    }
  }, [credentialId]);

  const handleCopy = useCallback(async () => {
    if (!password) return;

    try {
      const success = await copyToClipboardWithAutoClear(password, 15);
      
      if (success) {
        setCopied(true);
        // Registrar en auditoría
        await vaultApi.registerPasswordCopy(credentialId);
        
        toast.success('Copiado', {
          description: 'Por seguridad, pegá la contraseña pronto.'
        });

        setTimeout(() => setCopied(false), 2000);
      } else {
        throw new Error('No se pudo copiar');
      }
    } catch (error) {
      toast.error('Error', {
        description: 'No se pudo copiar la contraseña'
      });
    }
  }, [password, credentialId]);

  // Copiar sin revelar - obtiene la contraseña y la copia sin mostrarla
  const handleCopyWithoutReveal = useCallback(async () => {
    setIsCopyingWithoutReveal(true);
    try {
      // Obtener la contraseña del backend
      const response = await vaultApi.revealPassword(credentialId);
      
      // Copiar al portapapeles sin mostrar
      const success = await copyToClipboardWithAutoClear(response.password, 15);
      
      if (success) {
        setCopiedWithoutReveal(true);
        // Registrar en auditoría
        await vaultApi.registerPasswordCopy(credentialId);
        
        toast.success('Contraseña copiada', {
          description: 'Se copió al portapapeles sin revelar.'
        });

        setTimeout(() => setCopiedWithoutReveal(false), 2000);
      } else {
        throw new Error('No se pudo copiar');
      }
    } catch (error: any) {
      if (error.message?.includes('permiso')) {
        toast.error('Sin permiso', {
          description: 'No tienes permiso para copiar esta contraseña.'
        });
      } else {
        toast.error('Error', {
          description: error instanceof Error ? error.message : 'No se pudo copiar la contraseña'
        });
      }
    } finally {
      setIsCopyingWithoutReveal(false);
    }
  }, [credentialId]);

  return (
    <>
      {/* Diálogo de confirmación - Enterprise v2.1.1 */}
      <AlertDialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-warning/10">
                <ShieldAlert className="h-5 w-5 text-warning" />
              </div>
              Revelar contraseña
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>Esta acción quedará registrada en el historial de auditoría.</p>
              <p className="text-sm">
                La contraseña será visible por <strong>30 segundos</strong> y luego se ocultará automáticamente.
              </p>
              <p className="text-xs text-muted-foreground">
                Por seguridad, evitá capturas de pantalla y cerrá la sesión al terminar.
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={performReveal}>
              Revelar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="flex items-center gap-1">
        {isRevealing && password ? (
          <>
            <code className="bg-muted/50 px-2.5 py-1 rounded-lg text-sm font-mono flex-1 truncate max-w-[180px] border border-border/30">
              {password}
            </code>
            <span className="text-xs text-muted-foreground tabular-nums w-6">
              {countdown}s
            </span>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="h-7 w-7"
                  onClick={handleCopy}
                >
                  {copied ? (
                    <Check className="h-3.5 w-3.5 text-success" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>Copiar</TooltipContent>
            </Tooltip>
          </>
        ) : (
          <>
            <span className="text-muted-foreground text-sm">••••••••</span>
            <Badge variant="soft-warning" className="text-xs hidden sm:inline-flex font-medium">
              Auditado
            </Badge>
          </>
        )}
        
        {/* Botón copiar sin revelar - siempre visible cuando no está revelada */}
        {!isRevealing && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                className="h-7 w-7"
                onClick={handleCopyWithoutReveal}
                disabled={disabled || isCopyingWithoutReveal}
              >
                {isCopyingWithoutReveal ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : copiedWithoutReveal ? (
                  <Check className="h-3.5 w-3.5 text-success" />
                ) : (
                  <ClipboardCopy className="h-3.5 w-3.5" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>Copiar sin revelar</TooltipContent>
          </Tooltip>
        )}

        {/* Botón revelar/ocultar */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              className="h-7 w-7"
              onClick={handleRevealClick}
              disabled={disabled || isLoading}
            >
              {isLoading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : isRevealing ? (
                <EyeOff className="h-3.5 w-3.5" />
              ) : (
                <Eye className="h-3.5 w-3.5" />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            {isRevealing ? 'Ocultar' : 'Revelar'}
          </TooltipContent>
        </Tooltip>
      </div>
    </>
  );
}

export default PasswordReveal;
