import { HardDrive } from 'lucide-react';
import { KPICard } from '@/components/dashboard/KPICard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Progress } from '@/components/ui/progress';
import { mockDisks } from '@/lib/mockData';
import { cn } from '@/lib/utils';

export default function Disks() {
  const criticalDisks = mockDisks.filter(d => d.pctFree < 10).length;
  const warningDisks = mockDisks.filter(d => d.pctFree >= 10 && d.pctFree < 20).length;
  const healthyDisks = mockDisks.filter(d => d.pctFree >= 20).length;

  const getDiskSeverity = (pctFree: number): 'critical' | 'warning' | 'success' => {
    if (pctFree < 10) return 'critical';
    if (pctFree < 20) return 'warning';
    return 'success';
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Espacio en Disco</h1>
        <p className="text-muted-foreground mt-1">Monitoreo de almacenamiento por servidor</p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <KPICard
          title="Discos Críticos"
          value={criticalDisks}
          icon={HardDrive}
          description="< 10% libre"
          variant={criticalDisks === 0 ? 'success' : 'critical'}
        />
        <KPICard
          title="Discos en Advertencia"
          value={warningDisks}
          icon={HardDrive}
          description="10-20% libre"
          variant={warningDisks === 0 ? 'success' : 'warning'}
        />
        <KPICard
          title="Discos Saludables"
          value={healthyDisks}
          icon={HardDrive}
          description="> 20% libre"
          variant="success"
        />
      </div>

      <Card className="gradient-card shadow-card">
        <CardHeader>
          <CardTitle>Detalle por Disco</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Servidor</TableHead>
                <TableHead>Drive</TableHead>
                <TableHead className="text-right">Total (GB)</TableHead>
                <TableHead className="text-right">Libre (GB)</TableHead>
                <TableHead className="text-right">% Libre</TableHead>
                <TableHead>Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {mockDisks.map((disk, idx) => {
                const severity = getDiskSeverity(disk.pctFree);
                const usedPct = 100 - disk.pctFree;
                
                return (
                  <TableRow key={idx}>
                    <TableCell className="font-mono text-sm">{disk.server}</TableCell>
                    <TableCell className="font-mono font-bold">{disk.drive}</TableCell>
                    <TableCell className="text-right font-mono">{disk.totalGb}</TableCell>
                    <TableCell className="text-right font-mono">{disk.freeGb}</TableCell>
                    <TableCell className="text-right font-mono font-bold">
                      <span className={cn({
                        'text-destructive': severity === 'critical',
                        'text-warning': severity === 'warning',
                        'text-success': severity === 'success',
                      })}>
                        {disk.pctFree.toFixed(1)}%
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="w-24">
                        <Progress 
                          value={usedPct} 
                          className={cn('h-2', {
                            '[&>div]:bg-destructive': severity === 'critical',
                            '[&>div]:bg-warning': severity === 'warning',
                            '[&>div]:bg-success': severity === 'success',
                          })}
                        />
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
