import { ListTree } from 'lucide-react';
import { KPICard } from '@/components/dashboard/KPICard';
import { StatusBadge } from '@/components/dashboard/StatusBadge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { mockIndexes } from '@/lib/mockData';

export default function Indexes() {
  const rebuildIndexes = mockIndexes.filter(i => i.suggestion === 'REBUILD').length;
  const reorganizeIndexes = mockIndexes.filter(i => i.suggestion === 'REORGANIZE').length;

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Índices Fragmentados</h1>
        <p className="text-muted-foreground mt-1">Análisis de fragmentación y sugerencias de mantenimiento</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
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
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Servidor</TableHead>
                <TableHead>Base de Datos</TableHead>
                <TableHead>Esquema.Tabla</TableHead>
                <TableHead>Índice</TableHead>
                <TableHead className="text-right">Páginas</TableHead>
                <TableHead className="text-right">Frag %</TableHead>
                <TableHead>Sugerencia</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {mockIndexes.map((idx, i) => (
                <TableRow key={i}>
                  <TableCell className="font-mono text-sm">{idx.server}</TableCell>
                  <TableCell className="font-mono text-sm">{idx.database}</TableCell>
                  <TableCell className="font-mono text-sm">{idx.schema}.{idx.table}</TableCell>
                  <TableCell className="font-mono text-sm font-medium">{idx.index}</TableCell>
                  <TableCell className="text-right font-mono">{idx.pageCount.toLocaleString()}</TableCell>
                  <TableCell className="text-right font-mono font-bold text-warning">
                    {idx.fragPct.toFixed(1)}%
                  </TableCell>
                  <TableCell>
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
