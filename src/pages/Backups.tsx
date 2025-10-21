import { Save } from 'lucide-react';
import { KPICard } from '@/components/dashboard/KPICard';
import { StatusBadge } from '@/components/dashboard/StatusBadge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { mockBackups } from '@/lib/mockData';
import { useTableSort } from '@/hooks/use-table-sort';

export default function Backups() {
  const healthyBackups = mockBackups.filter(b => b.severity === 'green').length;
  const warningBackups = mockBackups.filter(b => b.severity === 'amber').length;
  const criticalBackups = mockBackups.filter(b => b.severity === 'red').length;

  const { sortedData, requestSort, getSortIndicator } = useTableSort(mockBackups);

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleString('es-ES', { 
      month: 'short', 
      day: 'numeric', 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  const getSeverityStatus = (severity: string): 'success' | 'warning' | 'critical' => {
    if (severity === 'green') return 'success';
    if (severity === 'amber') return 'warning';
    return 'critical';
  };

  return (
    <div className="p-3 sm:p-4 lg:p-6 space-y-3 sm:space-y-4">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold">Estado de Backups</h1>
        <p className="text-sm sm:text-base text-muted-foreground mt-1">Monitoreo de respaldos y cumplimiento de RPO</p>
      </div>

      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
        <KPICard
          title="Backups OK"
          value={healthyBackups}
          icon={Save}
          description="RPO cumplido"
          variant="success"
        />
        <KPICard
          title="Advertencias"
          value={warningBackups}
          icon={Save}
          description="RPO cerca del límite"
          variant="warning"
        />
        <KPICard
          title="Críticos"
          value={criticalBackups}
          icon={Save}
          description="RPO violado"
          variant="critical"
        />
      </div>

      <Card className="gradient-card shadow-card">
        <CardHeader>
          <CardTitle>Estado de Backups por Base de Datos</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead 
                  className="text-xs cursor-pointer hover:bg-accent"
                  onClick={() => requestSort('server')}
                >
                  Servidor {getSortIndicator('server')}
                </TableHead>
                <TableHead 
                  className="text-xs cursor-pointer hover:bg-accent"
                  onClick={() => requestSort('database')}
                >
                  Base de Datos {getSortIndicator('database')}
                </TableHead>
                <TableHead 
                  className="text-xs cursor-pointer hover:bg-accent"
                  onClick={() => requestSort('recoveryModel')}
                >
                  Modelo {getSortIndicator('recoveryModel')}
                </TableHead>
                <TableHead 
                  className="text-xs cursor-pointer hover:bg-accent"
                  onClick={() => requestSort('lastFull')}
                >
                  Último FULL {getSortIndicator('lastFull')}
                </TableHead>
                <TableHead 
                  className="text-xs cursor-pointer hover:bg-accent"
                  onClick={() => requestSort('lastDiff')}
                >
                  Último DIFF {getSortIndicator('lastDiff')}
                </TableHead>
                <TableHead 
                  className="text-xs cursor-pointer hover:bg-accent"
                  onClick={() => requestSort('lastLog')}
                >
                  Último LOG {getSortIndicator('lastLog')}
                </TableHead>
                <TableHead 
                  className="text-xs cursor-pointer hover:bg-accent"
                  onClick={() => requestSort('rpoMinutes')}
                >
                  RPO (min) {getSortIndicator('rpoMinutes')}
                </TableHead>
                <TableHead 
                  className="text-xs cursor-pointer hover:bg-accent"
                  onClick={() => requestSort('severity')}
                >
                  Estado {getSortIndicator('severity')}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedData.map((backup, idx) => (
                <TableRow key={idx}>
                  <TableCell className="font-mono text-xs py-2">{backup.server}</TableCell>
                  <TableCell className="font-mono text-xs font-medium py-2">{backup.database}</TableCell>
                  <TableCell className="py-2">
                    <Badge variant="outline" className="font-mono text-xs">
                      {backup.recoveryModel}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-mono text-xs py-2">{formatDate(backup.lastFull)}</TableCell>
                  <TableCell className="font-mono text-xs py-2">{formatDate(backup.lastDiff)}</TableCell>
                  <TableCell className="font-mono text-xs py-2">{formatDate(backup.lastLog)}</TableCell>
                  <TableCell className="font-mono text-xs font-bold py-2">{backup.rpoMinutes}</TableCell>
                  <TableCell className="py-2">
                    <StatusBadge status={getSeverityStatus(backup.severity)}>
                      {backup.severity === 'green' ? 'OK' : backup.severity === 'amber' ? 'Advertencia' : 'Crítico'}
                    </StatusBadge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
