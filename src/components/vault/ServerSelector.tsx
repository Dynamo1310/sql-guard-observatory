/**
 * Selector de servidores mejorado con búsqueda y selección múltiple
 */
import { useState, useEffect, useMemo } from 'react';
import { Search, Server, X, Check, CheckSquare, Square, Cloud, Shield } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Label } from '@/components/ui/label';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { ChevronDown } from 'lucide-react';
import { AvailableServerDto } from '@/services/vaultApi';
import { cn } from '@/lib/utils';

interface SelectedServer {
  serverName: string;
  instanceName?: string;
  connectionPurpose?: string;
}

interface ServerSelectorProps {
  availableServers: AvailableServerDto[];
  selectedServers: SelectedServer[];
  onSelectionChange: (servers: SelectedServer[]) => void;
  disabled?: boolean;
}

// Agrupar servidores por ambiente
function groupServersByEnvironment(servers: AvailableServerDto[]) {
  const groups: Record<string, AvailableServerDto[]> = {};
  
  servers.forEach(server => {
    const env = server.environment || 'Sin ambiente';
    if (!groups[env]) {
      groups[env] = [];
    }
    groups[env].push(server);
  });
  
  // Ordenar: Producción primero, luego alfabéticamente
  const sortedKeys = Object.keys(groups).sort((a, b) => {
    if (a.toLowerCase().includes('prod')) return -1;
    if (b.toLowerCase().includes('prod')) return 1;
    return a.localeCompare(b);
  });
  
  return sortedKeys.map(key => ({
    environment: key,
    servers: groups[key].sort((a, b) => a.fullServerName.localeCompare(b.fullServerName))
  }));
}

export function ServerSelector({
  availableServers,
  selectedServers,
  onSelectionChange,
  disabled = false
}: ServerSelectorProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedGroups, setExpandedGroups] = useState<string[]>([]);

  // Inicializar grupos expandidos
  useEffect(() => {
    const groups = groupServersByEnvironment(availableServers);
    if (groups.length > 0 && expandedGroups.length === 0) {
      setExpandedGroups([groups[0].environment]);
    }
  }, [availableServers]);

  // Filtrar servidores por búsqueda
  const filteredServers = useMemo(() => {
    if (!searchTerm) return availableServers;
    
    const term = searchTerm.toLowerCase();
    return availableServers.filter(s => 
      s.serverName.toLowerCase().includes(term) ||
      s.instanceName?.toLowerCase().includes(term) ||
      s.fullServerName.toLowerCase().includes(term) ||
      s.environment?.toLowerCase().includes(term) ||
      s.hostingSite?.toLowerCase().includes(term)
    );
  }, [availableServers, searchTerm]);

  // Agrupar servidores filtrados
  const groupedServers = useMemo(() => 
    groupServersByEnvironment(filteredServers),
    [filteredServers]
  );

  // Verificar si un servidor está seleccionado
  const isSelected = (server: AvailableServerDto) => {
    return selectedServers.some(
      s => s.serverName === server.serverName && s.instanceName === server.instanceName
    );
  };

  // Verificar si todos los servidores están seleccionados
  const allSelected = filteredServers.length > 0 && 
    filteredServers.every(s => isSelected(s));

  // Verificar si algunos servidores están seleccionados
  const someSelected = selectedServers.length > 0 && !allSelected;

  // Toggle un servidor individual
  const toggleServer = (server: AvailableServerDto) => {
    if (disabled) return;
    
    if (isSelected(server)) {
      onSelectionChange(
        selectedServers.filter(
          s => !(s.serverName === server.serverName && s.instanceName === server.instanceName)
        )
      );
    } else {
      onSelectionChange([
        ...selectedServers,
        { serverName: server.serverName, instanceName: server.instanceName }
      ]);
    }
  };

  // Seleccionar/deseleccionar todos
  const toggleAll = () => {
    if (disabled) return;
    
    if (allSelected) {
      // Deseleccionar todos los filtrados
      const filteredKeys = new Set(
        filteredServers.map(s => `${s.serverName}|${s.instanceName || ''}`)
      );
      onSelectionChange(
        selectedServers.filter(
          s => !filteredKeys.has(`${s.serverName}|${s.instanceName || ''}`)
        )
      );
    } else {
      // Seleccionar todos los filtrados (agregar los que faltan)
      const existingKeys = new Set(
        selectedServers.map(s => `${s.serverName}|${s.instanceName || ''}`)
      );
      const newServers = filteredServers
        .filter(s => !existingKeys.has(`${s.serverName}|${s.instanceName || ''}`))
        .map(s => ({ serverName: s.serverName, instanceName: s.instanceName }));
      onSelectionChange([...selectedServers, ...newServers]);
    }
  };

  // Seleccionar todos de un grupo
  const toggleGroup = (groupServers: AvailableServerDto[]) => {
    if (disabled) return;
    
    const allGroupSelected = groupServers.every(s => isSelected(s));
    
    if (allGroupSelected) {
      // Deseleccionar todo el grupo
      const groupKeys = new Set(
        groupServers.map(s => `${s.serverName}|${s.instanceName || ''}`)
      );
      onSelectionChange(
        selectedServers.filter(
          s => !groupKeys.has(`${s.serverName}|${s.instanceName || ''}`)
        )
      );
    } else {
      // Seleccionar todo el grupo
      const existingKeys = new Set(
        selectedServers.map(s => `${s.serverName}|${s.instanceName || ''}`)
      );
      const newServers = groupServers
        .filter(s => !existingKeys.has(`${s.serverName}|${s.instanceName || ''}`))
        .map(s => ({ serverName: s.serverName, instanceName: s.instanceName }));
      onSelectionChange([...selectedServers, ...newServers]);
    }
  };

  // Toggle expandir grupo
  const toggleExpand = (env: string) => {
    setExpandedGroups(prev => 
      prev.includes(env) 
        ? prev.filter(e => e !== env)
        : [...prev, env]
    );
  };

  // Remover servidor de seleccionados
  const removeSelected = (server: SelectedServer) => {
    if (disabled) return;
    onSelectionChange(
      selectedServers.filter(
        s => !(s.serverName === server.serverName && s.instanceName === server.instanceName)
      )
    );
  };

  return (
    <div className="space-y-3">
      <Label>Servidores Asociados</Label>
      
      {/* Chips de servidores seleccionados */}
      {selectedServers.length > 0 && (
        <div className="flex flex-wrap gap-2 p-2 bg-muted/50 rounded-lg">
          {selectedServers.map((server, index) => (
            <Badge 
              key={`${server.serverName}-${server.instanceName}-${index}`}
              variant="secondary" 
              className="gap-1 pr-1"
            >
              <Server className="h-3 w-3" />
              {server.instanceName 
                ? `${server.serverName}\\${server.instanceName}`
                : server.serverName
              }
              <button
                type="button"
                onClick={() => removeSelected(server)}
                disabled={disabled}
                className="ml-1 p-0.5 hover:bg-destructive/20 rounded disabled:opacity-50"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
          <span className="text-xs text-muted-foreground self-center ml-1">
            {selectedServers.length} seleccionado{selectedServers.length !== 1 ? 's' : ''}
          </span>
        </div>
      )}

      {/* Barra de búsqueda y selección total */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar servidores..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
            disabled={disabled}
          />
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={toggleAll}
          disabled={disabled || filteredServers.length === 0}
          className="whitespace-nowrap"
        >
          {allSelected ? (
            <>
              <Square className="h-4 w-4 mr-2" />
              Deseleccionar
            </>
          ) : (
            <>
              <CheckSquare className="h-4 w-4 mr-2" />
              Todos ({filteredServers.length})
            </>
          )}
        </Button>
      </div>

      {/* Lista de servidores agrupados */}
      <ScrollArea className="h-[250px] border rounded-lg">
        <div className="p-2 space-y-1">
          {groupedServers.length === 0 ? (
            <div className="flex items-center justify-center h-[200px] text-muted-foreground">
              {searchTerm ? 'No se encontraron servidores' : 'No hay servidores disponibles'}
            </div>
          ) : (
            groupedServers.map(group => {
              const isExpanded = expandedGroups.includes(group.environment);
              const allGroupSelected = group.servers.every(s => isSelected(s));
              const someGroupSelected = group.servers.some(s => isSelected(s)) && !allGroupSelected;
              const selectedCount = group.servers.filter(s => isSelected(s)).length;
              
              return (
                <Collapsible
                  key={group.environment}
                  open={isExpanded}
                  onOpenChange={() => toggleExpand(group.environment)}
                >
                  <div className="flex items-center gap-2 p-2 hover:bg-muted/50 rounded-lg">
                    <Checkbox
                      checked={allGroupSelected}
                      ref={(el) => {
                        if (el) {
                          (el as HTMLButtonElement & { indeterminate?: boolean }).indeterminate = someGroupSelected;
                        }
                      }}
                      onCheckedChange={() => toggleGroup(group.servers)}
                      disabled={disabled}
                    />
                    <CollapsibleTrigger asChild>
                      <button
                        type="button"
                        className="flex items-center gap-2 flex-1 text-left"
                      >
                        <ChevronDown 
                          className={cn(
                            "h-4 w-4 transition-transform",
                            isExpanded && "rotate-180"
                          )}
                        />
                        <span className="font-medium text-sm">{group.environment}</span>
                        <span className="text-xs text-muted-foreground">
                          ({selectedCount}/{group.servers.length})
                        </span>
                      </button>
                    </CollapsibleTrigger>
                  </div>
                  
                  <CollapsibleContent>
                    <div className="ml-6 space-y-0.5">
                      {group.servers.map(server => (
                                        <div
                                          key={server.fullServerName}
                                          className={cn(
                                            "flex items-center gap-2 p-2 rounded-lg cursor-pointer hover:bg-muted/50 transition-colors",
                                            isSelected(server) && "bg-primary/5"
                                          )}
                                          onClick={() => toggleServer(server)}
                                          title={server.fullServerName}
                                        >
                                          <Checkbox
                                            checked={isSelected(server)}
                                            onCheckedChange={() => toggleServer(server)}
                                            disabled={disabled}
                                            className="flex-shrink-0"
                                          />
                                          <Server className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                                          <div className="flex-1 min-w-0 overflow-hidden">
                                            <p className="text-sm font-medium truncate" title={server.fullServerName}>
                                              {server.fullServerName}
                                            </p>
                                            {server.hostingSite && (
                                              <p className="text-xs text-muted-foreground truncate">
                                                {server.hostingSite}
                                              </p>
                                            )}
                                          </div>
                                          <div className="flex items-center gap-1 flex-shrink-0">
                                            {server.isAws && (
                                              <Cloud className="h-3.5 w-3.5 text-orange-500" title="AWS" />
                                            )}
                                            {server.isDmz && (
                                              <Shield className="h-3.5 w-3.5 text-red-500" title="DMZ" />
                                            )}
                                          </div>
                                        </div>
                      ))}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              );
            })
          )}
        </div>
      </ScrollArea>

      <p className="text-xs text-muted-foreground">
        Puedes asociar o desasociar servidores después de crear la credencial.
      </p>
    </div>
  );
}

export default ServerSelector;

