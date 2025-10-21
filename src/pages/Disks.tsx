import { HardDrive } from 'lucide-react';
import { KPICard } from '@/components/dashboard/KPICard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Progress } from '@/components/ui/progress';
import { mockDisks } from '@/lib/mockData';
import { cn } from '@/lib/utils';
import { useTableSort } from '@/hooks/use-table-sort';

export default function Disks() {
  const criticalDisks = mockDisks.filter(d => d.pctFree < 10).length;
  const warningDisks = mockDisks.filter(d => d.pctFree >= 10 && d.pctFree < 20).length;
  const healthyDisks = mockDisks.filter(d => d.pctFree >= 20).length;

  const { sortedData, requestSort, getSortIndicator } = useTableSort(mockDisks);

  const getDiskSeverity = (pctFree: number): 'critical' | 'warning' | 'success' => {
    if (pctFree < 10) return 'critical';
    if (pctFree < 20) return 'warning';
    return 'success';
  };

  return (
    <div className="p-3 sm:p-4 lg:p-6 space-y-3 sm:space-y-4">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold">Espacio en Disco</h1>
        <p className="text-sm sm:text-base text-muted-foreground mt-1">Monitoreo de almacenamiento por servidor</p>
      </div>

      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
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
                  onClick={() => requestSort('drive')}
                >
                  Drive {getSortIndicator('drive')}
                </TableHead>
                <TableHead 
                  className="text-xs text-right cursor-pointer hover:bg-accent"
                  onClick={() => requestSort('totalGb')}
                >
                  Total (GB) {getSortIndicator('totalGb')}
                </TableHead>
                <TableHead 
                  className="text-xs text-right cursor-pointer hover:bg-accent"
                  onClick={() => requestSort('freeGb')}
                >
                  Libre (GB) {getSortIndicator('freeGb')}
                </TableHead>
                <TableHead 
                  className="text-xs text-right cursor-pointer hover:bg-accent"
                  onClick={() => requestSort('pctFree')}
                >
                  % Libre {getSortIndicator('pctFree')}
                </TableHead>
                <TableHead className="text-xs">Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedData.map((disk, idx) => {
                const severity = getDiskSeverity(disk.pctFree);
                const usedPct = 100 - disk.pctFree;
                
                return (
                  <TableRow key={idx}>
                    <TableCell className="font-mono text-xs py-2">{disk.server}</TableCell>
                    <TableCell className="font-mono text-xs font-bold py-2">{disk.drive}</TableCell>
                    <TableCell className="text-right font-mono text-xs py-2">{disk.totalGb}</TableCell>
                    <TableCell className="text-right font-mono text-xs py-2">{disk.freeGb}</TableCell>
                    <TableCell className="text-right font-mono text-xs font-bold py-2">
                      <span className={cn({
                        'text-destructive': severity === 'critical',
                        'text-warning': severity === 'warning',
                        'text-success': severity === 'success',
                      })}>
                        {disk.pctFree.toFixed(1)}%
                      </span>
                    </TableCell>
                    <TableCell className="py-2">
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
