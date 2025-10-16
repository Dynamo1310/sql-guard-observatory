import { RefreshCw, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { useAuth } from '@/contexts/AuthContext';
import { Badge } from '@/components/ui/badge';

interface TopBarProps {
  onRefresh?: () => void;
  environment: string;
  onEnvironmentChange: (value: string) => void;
  hosting: string;
  onHostingChange: (value: string) => void;
  lastUpdate?: string;
}

export function TopBar({
  onRefresh,
  environment,
  onEnvironmentChange,
  hosting,
  onHostingChange,
  lastUpdate,
}: TopBarProps) {
  const { user } = useAuth();

  return (
    <header className="h-16 border-b border-border bg-card flex items-center px-4 gap-4">
      <SidebarTrigger />

      <div className="flex-1 flex items-center gap-4">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Ambiente:</span>
          <Select value={environment} onValueChange={onEnvironmentChange}>
            <SelectTrigger className="w-32 h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="All">Todos</SelectItem>
              <SelectItem value="Prod">Producción</SelectItem>
              <SelectItem value="UAT">UAT</SelectItem>
              <SelectItem value="Dev">Desarrollo</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Hosting:</span>
          <Select value={hosting} onValueChange={onHostingChange}>
            <SelectTrigger className="w-32 h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="All">Todos</SelectItem>
              <SelectItem value="OnPrem">On-Premise</SelectItem>
              <SelectItem value="AWS">AWS</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {lastUpdate && (
          <Badge variant="outline" className="font-mono text-xs">
            Actualizado: {new Date(lastUpdate).toLocaleTimeString('es-ES')}
          </Badge>
        )}
      </div>

      <div className="flex items-center gap-3">
        {onRefresh && (
          <Button
            variant="outline"
            size="sm"
            onClick={onRefresh}
            className="gap-2"
          >
            <RefreshCw className="h-4 w-4" />
            Refrescar
          </Button>
        )}

        <div className="flex items-center gap-2 px-3 py-2 bg-secondary rounded-md">
          <User className="h-4 w-4 text-muted-foreground" />
          <div className="flex flex-col">
            <span className="text-sm font-medium">{user?.displayName}</span>
            <span className="text-xs text-muted-foreground font-mono">{user?.domainUser}</span>
          </div>
        </div>
      </div>
    </header>
  );
}
