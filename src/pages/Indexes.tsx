import { ListTree } from 'lucide-react';
import { KPICard } from '@/components/dashboard/KPICard';
import { StatusBadge } from '@/components/dashboard/StatusBadge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { mockIndexes } from '@/lib/mockData';
import { useTableSort } from '@/hooks/use-table-sort';

export default function Indexes() {
  const rebuildIndexes = mockIndexes.filter(i => i.suggestion === 'REBUILD').length;
  const reorganizeIndexes = mockIndexes.filter(i => i.suggestion === 'REORGANIZE').length;

  const { sortedData, requestSort, getSortIndicator } = useTableSort(mockIndexes);

  return (
    <div className="p-3 sm:p-4 lg:p-6 space-y-3 sm:space-y-4">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold">Índices Fragmentados</h1>
        <p className="text-sm sm:text-base text-muted-foreground mt-1">Análisis de fragmentación y sugerencias de mantenimiento</p>
      </div>

      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2">
        <KPICard
          title="Requieren REBUILD"
          value={rebuildIndexes}
          icon={ListTree}
          description=">= 30% fragmentación"
          variant={rebuildIndexes === 0 ? 'success' : 'warning'}
        />
        <KPICard
          title="Requieren REORGANIZE"
          value={reorganizeIndexes}
          icon={ListTree}
          description="10-30% fragmentación"
          variant="default"
        />
      </div>

      <Card className="gradient-card shadow-card">
        <CardHeader>
          <CardTitle>Índices con Alta Fragmentación</CardTitle>
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
                  onClick={() => requestSort('table')}
                >
                  Esquema.Tabla {getSortIndicator('table')}
                </TableHead>
                <TableHead 
                  className="text-xs cursor-pointer hover:bg-accent"
                  onClick={() => requestSort('index')}
                >
                  Índice {getSortIndicator('index')}
                </TableHead>
                <TableHead 
                  className="text-xs text-right cursor-pointer hover:bg-accent"
                  onClick={() => requestSort('pageCount')}
                >
                  Páginas {getSortIndicator('pageCount')}
                </TableHead>
                <TableHead 
                  className="text-xs text-right cursor-pointer hover:bg-accent"
                  onClick={() => requestSort('fragPct')}
                >
                  Frag % {getSortIndicator('fragPct')}
                </TableHead>
                <TableHead 
                  className="text-xs cursor-pointer hover:bg-accent"
                  onClick={() => requestSort('suggestion')}
                >
                  Sugerencia {getSortIndicator('suggestion')}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedData.map((idx, i) => (
                <TableRow key={i}>
                  <TableCell className="font-mono text-xs py-2">{idx.server}</TableCell>
                  <TableCell className="font-mono text-xs py-2">{idx.database}</TableCell>
                  <TableCell className="font-mono text-xs py-2">{idx.schema}.{idx.table}</TableCell>
                  <TableCell className="font-mono text-xs font-medium py-2">{idx.index}</TableCell>
                  <TableCell className="text-right font-mono text-xs py-2">{idx.pageCount.toLocaleString()}</TableCell>
                  <TableCell className="text-right font-mono text-xs font-bold text-warning py-2">
                    {idx.fragPct.toFixed(1)}%
                  </TableCell>
                  <TableCell className="py-2">
                    <StatusBadge 
                      status={idx.suggestion === 'REBUILD' ? 'critical' : idx.suggestion === 'REORGANIZE' ? 'warning' : 'success'}
                    >
                      {idx.suggestion}
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
