import { Save } from 'lucide-react';
import { KPICard } from '@/components/dashboard/KPICard';
import { StatusBadge } from '@/components/dashboard/StatusBadge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { mockBackups } from '@/lib/mockData';

export default function Backups() {
  const healthyBackups = mockBackups.filter(b => b.severity === 'green').length;
  const warningBackups = mockBackups.filter(b => b.severity === 'amber').length;
  const criticalBackups = mockBackups.filter(b => b.severity === 'red').length;

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
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Estado de Backups</h1>
        <p className="text-muted-foreground mt-1">Monitoreo de respaldos y cumplimiento de RPO</p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
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
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Servidor</TableHead>
                <TableHead>Base de Datos</TableHead>
                <TableHead>Modelo</TableHead>
                <TableHead>Último FULL</TableHead>
                <TableHead>Último DIFF</TableHead>
                <TableHead>Último LOG</TableHead>
                <TableHead>RPO (min)</TableHead>
                <TableHead>Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {mockBackups.map((backup, idx) => (
                <TableRow key={idx}>
                  <TableCell className="font-mono text-sm">{backup.server}</TableCell>
                  <TableCell className="font-mono text-sm font-medium">{backup.database}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="font-mono text-xs">
                      {backup.recoveryModel}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{formatDate(backup.lastFull)}</TableCell>
                  <TableCell className="font-mono text-xs">{formatDate(backup.lastDiff)}</TableCell>
                  <TableCell className="font-mono text-xs">{formatDate(backup.lastLog)}</TableCell>
                  <TableCell className="font-mono font-bold">{backup.rpoMinutes}</TableCell>
                  <TableCell>
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
