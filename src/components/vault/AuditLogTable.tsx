/**
 * Tabla de auditoría de credenciales
 */
import { format, formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import { 
  Eye, Edit, Trash2, Plus, Server, Copy, Clock, User, Globe
} from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { CredentialAuditLogDto } from '@/services/vaultApi';
import { cn } from '@/lib/utils';

interface AuditLogTableProps {
  logs: CredentialAuditLogDto[];
  showCredentialName?: boolean;
  maxHeight?: string;
}

const actionConfig: Record<string, { icon: typeof Eye; color: string; label: string }> = {
  Created: { icon: Plus, color: 'bg-muted text-foreground border-border', label: 'Creada' },
  Updated: { icon: Edit, color: 'bg-muted text-foreground border-border', label: 'Actualizada' },
  Deleted: { icon: Trash2, color: 'bg-muted text-foreground border-border', label: 'Eliminada' },
  Viewed: { icon: Eye, color: 'bg-muted text-muted-foreground border-border', label: 'Visualizada' },
  PasswordRevealed: { icon: Eye, color: 'bg-muted text-foreground border-border', label: 'Contraseña revelada' },
  PasswordCopied: { icon: Copy, color: 'bg-muted text-foreground border-border', label: 'Contraseña copiada' },
  ServerAdded: { icon: Server, color: 'bg-muted text-foreground border-border', label: 'Servidor asociado' },
  ServerRemoved: { icon: Server, color: 'bg-muted text-foreground border-border', label: 'Servidor desasociado' }
};

export function AuditLogTable({ 
  logs, 
  showCredentialName = true,
  maxHeight = '500px'
}: AuditLogTableProps) {
  const formatDateTime = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      return {
        full: format(date, "d 'de' MMM yyyy, HH:mm", { locale: es }),
        relative: formatDistanceToNow(date, { locale: es, addSuffix: true })
      };
    } catch {
      return { full: dateStr, relative: '' };
    }
  };

  if (logs.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        No hay registros de auditoría.
      </div>
    );
  }

  return (
    <ScrollArea className="rounded-xl border border-border/50" style={{ maxHeight }}>
      <Table>
        <TableHeader className="sticky top-0 bg-background/95 backdrop-blur-sm">
          <TableRow>
            <TableHead className="w-[180px]">Fecha</TableHead>
            <TableHead>Acción</TableHead>
            {showCredentialName && <TableHead>Credencial</TableHead>}
            <TableHead>Usuario</TableHead>
            <TableHead className="w-[120px]">IP</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {logs.map((log) => {
            const config = actionConfig[log.action] || actionConfig.Viewed;
            const ActionIcon = config.icon;
            const dateInfo = formatDateTime(log.performedAt);

            return (
              <TableRow key={log.id} className="group">
                <TableCell className="font-mono text-xs">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-md bg-muted/50">
                      <Clock className="h-3 w-3 text-muted-foreground" />
                    </div>
                    <div>
                      <div>{dateInfo.full}</div>
                      <div className="text-muted-foreground">{dateInfo.relative}</div>
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className={cn('font-medium border', config.color)}>
                    <ActionIcon className="h-3 w-3 mr-1" />
                    {config.label}
                  </Badge>
                  {log.changedFields && (
                    <div className="text-xs text-muted-foreground mt-1.5 max-w-[200px] truncate">
                      {log.changedFields}
                    </div>
                  )}
                </TableCell>
                {showCredentialName && (
                  <TableCell className="font-medium">
                    {log.credentialName}
                  </TableCell>
                )}
                <TableCell>
                  <div className="flex items-center gap-1.5">
                    <User className="h-3 w-3 text-muted-foreground" />
                    <span className="text-sm">
                      {log.performedByUserName || log.performedByUserId}
                    </span>
                  </div>
                </TableCell>
                <TableCell className="font-mono text-xs">
                  {log.ipAddress && (
                    <div className="flex items-center gap-1.5">
                      <Globe className="h-3 w-3 text-muted-foreground" />
                      {log.ipAddress}
                    </div>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </ScrollArea>
  );
}

export default AuditLogTable;
