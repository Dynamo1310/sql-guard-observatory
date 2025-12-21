/**
 * Componente para revelar y copiar passwords con auto-ocultación
 */
import { useState, useEffect, useCallback } from 'react';
import { Eye, EyeOff, Copy, Check, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { vaultApi, copyToClipboardWithAutoClear } from '@/services/vaultApi';
import { useToast } from '@/hooks/use-toast';

interface PasswordRevealProps {
  credentialId: number;
  disabled?: boolean;
}

export function PasswordReveal({ credentialId, disabled = false }: PasswordRevealProps) {
  const [isRevealing, setIsRevealing] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [password, setPassword] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const { toast } = useToast();

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

  const handleReveal = useCallback(async () => {
    if (isRevealing) {
      // Ocultar inmediatamente
      setPassword(null);
      setIsRevealing(false);
      setCountdown(0);
      return;
    }

    setIsLoading(true);
    try {
      const response = await vaultApi.revealPassword(credentialId);
      setPassword(response.password);
      setIsRevealing(true);
      setCountdown(response.expiresInSeconds);
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'No se pudo revelar la contraseña',
        variant: 'destructive'
      });
    } finally {
      setIsLoading(false);
    }
  }, [credentialId, isRevealing, toast]);

  const handleCopy = useCallback(async () => {
    if (!password) return;

    try {
      const success = await copyToClipboardWithAutoClear(password, 60);
      
      if (success) {
        setCopied(true);
        // Registrar en auditoría
        await vaultApi.registerPasswordCopy(credentialId);
        
        toast({
          title: 'Copiado',
          description: 'Contraseña copiada. Se limpiará del portapapeles en 60 segundos.',
        });

        setTimeout(() => setCopied(false), 2000);
      } else {
        throw new Error('No se pudo copiar');
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'No se pudo copiar la contraseña',
        variant: 'destructive'
      });
    }
  }, [password, credentialId, toast]);

  return (
    <div className="flex items-center gap-2">
      {isRevealing && password ? (
        <>
          <code className="bg-muted px-2 py-1 rounded text-sm font-mono flex-1 truncate max-w-[200px]">
            {password}
          </code>
          <span className="text-xs text-muted-foreground tabular-nums w-8">
            {countdown}s
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={handleCopy}
            title="Copiar contraseña"
          >
            {copied ? (
              <Check className="h-4 w-4 text-green-500" />
            ) : (
              <Copy className="h-4 w-4" />
            )}
          </Button>
        </>
      ) : (
        <span className="text-muted-foreground text-sm">••••••••</span>
      )}
      
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8"
        onClick={handleReveal}
        disabled={disabled || isLoading}
        title={isRevealing ? 'Ocultar contraseña' : 'Revelar contraseña'}
      >
        {isLoading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : isRevealing ? (
          <EyeOff className="h-4 w-4" />
        ) : (
          <Eye className="h-4 w-4" />
        )}
      </Button>
    </div>
  );
}

export default PasswordReveal;

