import { Activity, HardDrive, Save, TrendingUp } from 'lucide-react';
import { KPICard } from '@/components/dashboard/KPICard';
import { StatusBadge } from '@/components/dashboard/StatusBadge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { mockJobSummary, mockJobs, mockDisks, mockDatabases, mockBackups } from '@/lib/mockData';

export default function Overview() {
  const criticalDisks = mockDisks.filter(d => d.pctFree < 15).length;
  const failedBackups = mockBackups.filter(b => b.severity === 'red').length;
  
  const topFailedJobs = mockJobs.filter(j => j.state === 'Failed').slice(0, 5);
  const topDatabases = [...mockDatabases].sort((a, b) => b.totalGb - a.totalGb).slice(0, 5);
  const overdueBackups = mockBackups.filter(b => b.severity !== 'green').slice(0, 5);

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Overview</h1>
        <p className="text-muted-foreground mt-1">Panel de control - Estado general del sistema</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <KPICard
          title="Jobs OK (24h)"
          value={`${mockJobSummary.okPct}%`}
          icon={Activity}
          description={`${mockJobSummary.fails24h} fallos registrados`}
          variant={mockJobSummary.okPct > 95 ? 'success' : mockJobSummary.okPct > 85 ? 'warning' : 'critical'}
        />
        <KPICard
          title="Discos Críticos"
          value={criticalDisks}
          icon={HardDrive}
          description="Menos de 15% libre"
          variant={criticalDisks === 0 ? 'success' : criticalDisks < 3 ? 'warning' : 'critical'}
        />
        <KPICard
          title="Backups Atrasados"
          value={failedBackups}
          icon={Save}
          description="RPO violado"
          variant={failedBackups === 0 ? 'success' : failedBackups < 3 ? 'warning' : 'critical'}
        />
        <KPICard
          title="Tiempo Promedio Jobs"
          value={`${Math.round(mockJobSummary.avgDurationSec / 60)}m`}
          icon={TrendingUp}
          description={`P95: ${Math.round(mockJobSummary.p95Sec / 60)}m`}
          variant="default"
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="gradient-card shadow-card">
          <CardHeader>
            <CardTitle>Top Jobs con Fallas</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Job</TableHead>
                  <TableHead>Servidor</TableHead>
                  <TableHead>Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {topFailedJobs.length > 0 ? (
                  topFailedJobs.map((job, idx) => (
                    <TableRow key={idx}>
                      <TableCell className="font-mono text-sm">{job.job}</TableCell>
                      <TableCell className="font-mono text-xs">{job.server}</TableCell>
                      <TableCell>
                        <StatusBadge status="critical">{job.state}</StatusBadge>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center text-muted-foreground">
                      No hay fallas recientes
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card className="gradient-card shadow-card">
          <CardHeader>
            <CardTitle>Bases Más Grandes</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Base de Datos</TableHead>
                  <TableHead>Servidor</TableHead>
                  <TableHead className="text-right">Tamaño</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {topDatabases.map((db, idx) => (
                  <TableRow key={idx}>
                    <TableCell className="font-mono text-sm">{db.database}</TableCell>
                    <TableCell className="font-mono text-xs">{db.server}</TableCell>
                    <TableCell className="text-right font-mono">{db.totalGb.toFixed(1)} GB</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <Card className="gradient-card shadow-card">
        <CardHeader>
          <CardTitle>Backups Atrasados</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Base de Datos</TableHead>
                <TableHead>Servidor</TableHead>
                <TableHead>Tipo Faltante</TableHead>
                <TableHead>Edad RPO</TableHead>
                <TableHead>Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {overdueBackups.length > 0 ? (
                overdueBackups.map((backup, idx) => (
                  <TableRow key={idx}>
                    <TableCell className="font-mono text-sm">{backup.database}</TableCell>
                    <TableCell className="font-mono text-xs">{backup.server}</TableCell>
                    <TableCell>
                      {backup.recoveryModel === 'FULL' ? 'LOG' : 'FULL'}
                    </TableCell>
                    <TableCell className="font-mono">{backup.rpoMinutes}m</TableCell>
                    <TableCell>
                      <StatusBadge status={backup.severity === 'red' ? 'critical' : 'warning'}>
                        {backup.severity === 'red' ? 'Crítico' : 'Advertencia'}
                      </StatusBadge>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground">
                    Todos los backups están al día
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
