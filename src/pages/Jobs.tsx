import { Activity } from 'lucide-react';
import { KPICard } from '@/components/dashboard/KPICard';
import { StatusBadge } from '@/components/dashboard/StatusBadge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { mockJobSummary, mockJobs } from '@/lib/mockData';

export default function Jobs() {
  const getJobStatusVariant = (state: string): 'success' | 'critical' | 'running' | 'info' => {
    switch (state) {
      case 'Succeeded': return 'success';
      case 'Failed': return 'critical';
      case 'Running': return 'running';
      default: return 'info';
    }
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">SQL Agent Jobs</h1>
        <p className="text-muted-foreground mt-1">Estado y ejecución de trabajos programados</p>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <KPICard
          title="% Jobs OK"
          value={`${mockJobSummary.okPct}%`}
          icon={Activity}
          variant={mockJobSummary.okPct > 95 ? 'success' : 'warning'}
        />
        <KPICard
          title="Fallos (24h)"
          value={mockJobSummary.fails24h}
          icon={Activity}
          variant={mockJobSummary.fails24h === 0 ? 'success' : 'critical'}
        />
        <KPICard
          title="Duración Promedio"
          value={`${Math.round(mockJobSummary.avgDurationSec / 60)}m`}
          icon={Activity}
          variant="default"
        />
        <KPICard
          title="P95 Duración"
          value={`${Math.round(mockJobSummary.p95Sec / 60)}m`}
          icon={Activity}
          variant="default"
        />
      </div>

      <Card className="gradient-card shadow-card">
        <CardHeader>
          <CardTitle>Listado de Jobs</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Servidor</TableHead>
                <TableHead>Job</TableHead>
                <TableHead>Inicio</TableHead>
                <TableHead>Fin</TableHead>
                <TableHead>Duración</TableHead>
                <TableHead>Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {mockJobs.map((job, idx) => (
                <TableRow key={idx}>
                  <TableCell className="font-mono text-sm">{job.server}</TableCell>
                  <TableCell className="font-mono text-sm">{job.job}</TableCell>
                  <TableCell className="font-mono text-xs">
                    {new Date(job.lastStart).toLocaleString('es-ES')}
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {job.lastEnd ? new Date(job.lastEnd).toLocaleString('es-ES') : '-'}
                  </TableCell>
                  <TableCell className="font-mono text-sm">
                    {job.durationSec > 0 ? formatDuration(job.durationSec) : '-'}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={getJobStatusVariant(job.state)}>
                      {job.state}
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
