/**
 * Selector de credenciales para agregar a grupos
 */
import { useState, useEffect, useMemo } from 'react';
import { Search, Key, Database, Monitor, Check, X } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { vaultApi, CredentialDto, CredentialType } from '@/services/vaultApi';
import { toast } from 'sonner';

interface CredentialSelectorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groupId: number;
  excludeCredentialIds?: number[];
  onCredentialsAdded?: () => void;
}

const credentialTypeConfig = {
  SqlAuth: { label: 'SQL Server', icon: Database, color: 'text-muted-foreground' },
  WindowsAD: { label: 'Windows/AD', icon: Monitor, color: 'text-muted-foreground' },
  Other: { label: 'Otro', icon: Key, color: 'text-muted-foreground' }
};

export function CredentialSelector({
  open,
  onOpenChange,
  groupId,
  excludeCredentialIds = [],
  onCredentialsAdded
}: CredentialSelectorProps) {
  const [credentials, setCredentials] = useState<CredentialDto[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState<CredentialType | 'all'>('all');
  const [selectedIds, setSelectedIds] = useState<number[]>([]);

  useEffect(() => {
    if (open) {
      loadCredentials();
      setSelectedIds([]);
      setSearchTerm('');
      setTypeFilter('all');
    }
  }, [open]);

  const loadCredentials = async () => {
    setIsLoading(true);
    try {
      // Obtener credenciales propias del usuario (no privadas, que se puedan compartir)
      const data = await vaultApi.getMyShareableCredentials();
      setCredentials(data);
    } catch (error) {
      toast.error('Error', {
        description: 'No se pudieron cargar las credenciales'
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Filtrar credenciales
  const filteredCredentials = useMemo(() => {
    return credentials
      .filter(c => !excludeCredentialIds.includes(c.id))
      .filter(c => {
        if (searchTerm) {
          const term = searchTerm.toLowerCase();
          if (!c.name.toLowerCase().includes(term) && 
              !c.username.toLowerCase().includes(term) &&
              !c.description?.toLowerCase().includes(term)) {
            return false;
          }
        }
        if (typeFilter !== 'all' && c.credentialType !== typeFilter) {
          return false;
        }
        return true;
      });
  }, [credentials, excludeCredentialIds, searchTerm, typeFilter]);

  const toggleCredential = (id: number) => {
    setSelectedIds(prev => 
      prev.includes(id) 
        ? prev.filter(i => i !== id)
        : [...prev, id]
    );
  };

  const selectAll = () => {
    setSelectedIds(filteredCredentials.map(c => c.id));
  };

  const clearSelection = () => {
    setSelectedIds([]);
  };

  const handleAdd = async () => {
    if (selectedIds.length === 0) return;

    setIsSaving(true);
    try {
      // Agregar cada credencial al grupo
      await Promise.all(
        selectedIds.map(credentialId => 
          vaultApi.addCredentialToGroup(groupId, credentialId)
        )
      );

      toast.success('Credenciales agregadas', {
        description: `Se agregaron ${selectedIds.length} credencial(es) al grupo.`
      });

      onOpenChange(false);
      onCredentialsAdded?.();
    } catch (error) {
      toast.error('Error', {
        description: 'No se pudieron agregar las credenciales'
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-2xl max-h-[90vh] overflow-y-auto overflow-x-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Key className="h-5 w-5" />
            Agregar credenciales al grupo
          </DialogTitle>
          <DialogDescription>
            Selecciona las credenciales que deseas compartir con este grupo
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Filtros */}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar credenciales..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as any)}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Tipo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="SqlAuth">SQL Auth</SelectItem>
                <SelectItem value="WindowsAD">Windows/AD</SelectItem>
                <SelectItem value="Other">Otro</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Acciones de selección */}
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              {selectedIds.length} de {filteredCredentials.length} seleccionadas
            </span>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={selectAll}>
                Seleccionar todas
              </Button>
              {selectedIds.length > 0 && (
                <Button variant="ghost" size="sm" onClick={clearSelection}>
                  Limpiar
                </Button>
              )}
            </div>
          </div>

          {/* Lista de credenciales */}
          <ScrollArea className="h-[300px] border rounded-lg">
            {isLoading ? (
              <div className="p-4 space-y-2">
                {[1, 2, 3, 4].map(i => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : filteredCredentials.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground p-8">
                <Key className="h-12 w-12 mb-4 opacity-50" />
                <p className="text-center">
                  {credentials.length === 0
                    ? 'No tienes credenciales disponibles para compartir'
                    : 'No se encontraron credenciales con los filtros aplicados'
                  }
                </p>
              </div>
            ) : (
              <div className="p-2 space-y-1">
                {filteredCredentials.map(credential => {
                  const isSelected = selectedIds.includes(credential.id);
                  const config = credentialTypeConfig[credential.credentialType] || credentialTypeConfig.Other;
                  const TypeIcon = config.icon;

                  return (
                    <div
                      key={credential.id}
                      className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer hover:bg-muted/50 transition-colors ${
                        isSelected ? 'bg-primary/10 border border-primary/30' : 'border border-transparent'
                      }`}
                      onClick={() => toggleCredential(credential.id)}
                    >
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => toggleCredential(credential.id)}
                      />
                      <TypeIcon className={`h-5 w-5 ${config.color}`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium truncate">{credential.name}</span>
                          <Badge variant="outline" className="text-xs">
                            {config.label}
                          </Badge>
                        </div>
                        <div className="text-sm text-muted-foreground truncate">
                          {credential.username}
                          {credential.domain && ` @ ${credential.domain}`}
                        </div>
                      </div>
                      {isSelected && (
                        <Check className="h-5 w-5 text-primary" />
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </ScrollArea>

          {/* Resumen de selección */}
          {selectedIds.length > 0 && (
            <div className="flex flex-wrap gap-2 p-3 bg-muted/50 rounded-lg">
              {selectedIds.map(id => {
                const cred = credentials.find(c => c.id === id);
                return cred ? (
                  <Badge
                    key={id}
                    variant="secondary"
                    className="cursor-pointer hover:bg-destructive/20"
                    onClick={() => toggleCredential(id)}
                  >
                    {cred.name}
                    <X className="h-3 w-3 ml-1" />
                  </Badge>
                ) : null;
              })}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button 
            onClick={handleAdd} 
            disabled={selectedIds.length === 0 || isSaving}
          >
            {isSaving ? 'Agregando...' : `Agregar ${selectedIds.length > 0 ? `(${selectedIds.length})` : ''}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default CredentialSelector;

