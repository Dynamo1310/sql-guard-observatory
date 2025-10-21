import { Activity, HardDrive, Save, TrendingUp } from 'lucide-react';
import { KPICard } from '@/components/dashboard/KPICard';
import { StatusBadge } from '@/components/dashboard/StatusBadge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { mockJobSummary, mockJobs, mockDisks, mockDatabases, mockBackups } from '@/lib/mockData';
import { useTableSort } from '@/hooks/use-table-sort';

export default function Overview() {
  const criticalDisks = mockDisks.filter(d => d.pctFree < 15).length;
  const failedBackups = mockBackups.filter(b => b.severity === 'red').length;
  
  const topFailedJobs = mockJobs.filter(j => j.state === 'Failed').slice(0, 5);
  const topDatabases = [...mockDatabases].sort((a, b) => b.totalGb - a.totalGb).slice(0, 5);
  const overdueBackups = mockBackups.filter(b => b.severity !== 'green').slice(0, 5);

  // Ordenamiento para cada tabla
  const { sortedData: sortedFailedJobs, requestSort: requestSortJobs, getSortIndicator: getSortIndicatorJobs } = useTableSort(topFailedJobs);
  const { sortedData: sortedDatabases, requestSort: requestSortDatabases, getSortIndicator: getSortIndicatorDatabases } = useTableSort(topDatabases);
  const { sortedData: sortedBackups, requestSort: requestSortBackups, getSortIndicator: getSortIndicatorBackups } = useTableSort(overdueBackups);

  return (
    <div className="p-3 sm:p-4 lg:p-6 space-y-3 sm:space-y-4">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold">Overview</h1>
        <p className="text-sm sm:text-base text-muted-foreground mt-1">Panel de control - Estado general del sistema</p>
      </div>

      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
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

      <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
        <Card className="gradient-card shadow-card">
          <CardHeader>
            <CardTitle>Top Jobs con Fallas</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead 
                    className="text-xs cursor-pointer hover:bg-accent"
                    onClick={() => requestSortJobs('job')}
                  >
                    Job {getSortIndicatorJobs('job')}
                  </TableHead>
                  <TableHead 
                    className="text-xs cursor-pointer hover:bg-accent"
                    onClick={() => requestSortJobs('server')}
                  >
                    Servidor {getSortIndicatorJobs('server')}
                  </TableHead>
                  <TableHead 
                    className="text-xs cursor-pointer hover:bg-accent"
                    onClick={() => requestSortJobs('state')}
                  >
                    Estado {getSortIndicatorJobs('state')}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedFailedJobs.length > 0 ? (
                  sortedFailedJobs.map((job, idx) => (
                    <TableRow key={idx}>
                      <TableCell className="font-mono text-xs py-2">{job.job}</TableCell>
                      <TableCell className="font-mono text-xs py-2">{job.server}</TableCell>
                      <TableCell className="py-2">
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
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead 
                    className="text-xs cursor-pointer hover:bg-accent"
                    onClick={() => requestSortDatabases('database')}
                  >
                    Base de Datos {getSortIndicatorDatabases('database')}
                  </TableHead>
                  <TableHead 
                    className="text-xs cursor-pointer hover:bg-accent"
                    onClick={() => requestSortDatabases('server')}
                  >
                    Servidor {getSortIndicatorDatabases('server')}
                  </TableHead>
                  <TableHead 
                    className="text-xs text-right cursor-pointer hover:bg-accent"
                    onClick={() => requestSortDatabases('totalGb')}
                  >
                    Tamaño {getSortIndicatorDatabases('totalGb')}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedDatabases.map((db, idx) => (
                  <TableRow key={idx}>
                    <TableCell className="font-mono text-xs py-2">{db.database}</TableCell>
                    <TableCell className="font-mono text-xs py-2">{db.server}</TableCell>
                    <TableCell className="text-right font-mono text-xs py-2">{db.totalGb.toFixed(1)} GB</TableCell>
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
        <CardContent className="overflow-x-auto">
            <Table>
            <TableHeader>
              <TableRow>
                <TableHead 
                  className="text-xs cursor-pointer hover:bg-accent"
                  onClick={() => requestSortBackups('database')}
                >
                  Base de Datos {getSortIndicatorBackups('database')}
                </TableHead>
                <TableHead 
                  className="text-xs cursor-pointer hover:bg-accent"
                  onClick={() => requestSortBackups('server')}
                >
                  Servidor {getSortIndicatorBackups('server')}
                </TableHead>
                <TableHead 
                  className="text-xs cursor-pointer hover:bg-accent"
                  onClick={() => requestSortBackups('recoveryModel')}
                >
                  Tipo Faltante {getSortIndicatorBackups('recoveryModel')}
                </TableHead>
                <TableHead 
                  className="text-xs cursor-pointer hover:bg-accent"
                  onClick={() => requestSortBackups('rpoMinutes')}
                >
                  Edad RPO {getSortIndicatorBackups('rpoMinutes')}
                </TableHead>
                <TableHead 
                  className="text-xs cursor-pointer hover:bg-accent"
                  onClick={() => requestSortBackups('severity')}
                >
                  Estado {getSortIndicatorBackups('severity')}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedBackups.length > 0 ? (
                sortedBackups.map((backup, idx) => (
                  <TableRow key={idx}>
                    <TableCell className="font-mono text-xs py-2">{backup.database}</TableCell>
                    <TableCell className="font-mono text-xs py-2">{backup.server}</TableCell>
                    <TableCell className="text-xs py-2">
                      {backup.recoveryModel === 'FULL' ? 'LOG' : 'FULL'}
                    </TableCell>
                    <TableCell className="font-mono text-xs py-2">{backup.rpoMinutes}m</TableCell>
                    <TableCell className="py-2">
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
