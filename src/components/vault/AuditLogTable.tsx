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

interface AuditLogTableProps {
  logs: CredentialAuditLogDto[];
  showCredentialName?: boolean;
  maxHeight?: string;
}

const actionConfig: Record<string, { icon: typeof Eye; color: string; label: string }> = {
  Created: { icon: Plus, color: 'bg-green-500/10 text-green-600', label: 'Creada' },
  Updated: { icon: Edit, color: 'bg-blue-500/10 text-blue-600', label: 'Actualizada' },
  Deleted: { icon: Trash2, color: 'bg-red-500/10 text-red-600', label: 'Eliminada' },
  Viewed: { icon: Eye, color: 'bg-gray-500/10 text-gray-600', label: 'Visualizada' },
  PasswordRevealed: { icon: Eye, color: 'bg-amber-500/10 text-amber-600', label: 'Contraseña revelada' },
  PasswordCopied: { icon: Copy, color: 'bg-purple-500/10 text-purple-600', label: 'Contraseña copiada' },
  ServerAdded: { icon: Server, color: 'bg-teal-500/10 text-teal-600', label: 'Servidor asociado' },
  ServerRemoved: { icon: Server, color: 'bg-orange-500/10 text-orange-600', label: 'Servidor desasociado' }
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
    <ScrollArea className={`rounded-md border`} style={{ maxHeight }}>
      <Table>
        <TableHeader className="sticky top-0 bg-background">
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
              <TableRow key={log.id}>
                <TableCell className="font-mono text-xs">
                  <div className="flex items-center gap-1">
                    <Clock className="h-3 w-3 text-muted-foreground" />
                    <div>
                      <div>{dateInfo.full}</div>
                      <div className="text-muted-foreground">{dateInfo.relative}</div>
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className={config.color}>
                    <ActionIcon className="h-3 w-3 mr-1" />
                    {config.label}
                  </Badge>
                  {log.changedFields && (
                    <div className="text-xs text-muted-foreground mt-1 max-w-[200px] truncate">
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
                  <div className="flex items-center gap-1">
                    <User className="h-3 w-3 text-muted-foreground" />
                    <span className="text-sm">
                      {log.performedByUserName || log.performedByUserId}
                    </span>
                  </div>
                </TableCell>
                <TableCell className="font-mono text-xs">
                  {log.ipAddress && (
                    <div className="flex items-center gap-1">
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

