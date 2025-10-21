import { Database } from 'lucide-react';
import { KPICard } from '@/components/dashboard/KPICard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { mockDatabases } from '@/lib/mockData';
import { useTableSort } from '@/hooks/use-table-sort';

export default function Databases() {
  const totalSize = mockDatabases.reduce((sum, db) => sum + db.totalGb, 0);
  const totalGrowth = mockDatabases.reduce((sum, db) => sum + db.growth7dGb, 0);
  const largestDb = Math.max(...mockDatabases.map(db => db.totalGb));

  const { sortedData, requestSort, getSortIndicator } = useTableSort(mockDatabases);

  return (
    <div className="p-3 sm:p-4 lg:p-6 space-y-3 sm:space-y-4">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold">Bases de Datos</h1>
        <p className="text-sm sm:text-base text-muted-foreground mt-1">Tamaño y crecimiento de bases de datos</p>
      </div>

      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
        <KPICard
          title="Tamaño Total"
          value={`${totalSize.toFixed(0)} GB`}
          icon={Database}
          variant="default"
        />
        <KPICard
          title="Crecimiento (7d)"
          value={`${totalGrowth.toFixed(1)} GB`}
          icon={Database}
          description="Última semana"
          variant="default"
        />
        <KPICard
          title="Base Más Grande"
          value={`${largestDb.toFixed(0)} GB`}
          icon={Database}
          variant="default"
        />
      </div>

      <Card className="gradient-card shadow-card">
        <CardHeader>
          <CardTitle>Detalle de Bases de Datos</CardTitle>
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
                  className="text-xs text-right cursor-pointer hover:bg-accent"
                  onClick={() => requestSort('totalGb')}
                >
                  Total (GB) {getSortIndicator('totalGb')}
                </TableHead>
                <TableHead 
                  className="text-xs text-right cursor-pointer hover:bg-accent"
                  onClick={() => requestSort('dataGb')}
                >
                  Data (GB) {getSortIndicator('dataGb')}
                </TableHead>
                <TableHead 
                  className="text-xs text-right cursor-pointer hover:bg-accent"
                  onClick={() => requestSort('logGb')}
                >
                  Log (GB) {getSortIndicator('logGb')}
                </TableHead>
                <TableHead 
                  className="text-xs text-right cursor-pointer hover:bg-accent"
                  onClick={() => requestSort('growth7dGb')}
                >
                  Crecimiento 7d (GB) {getSortIndicator('growth7dGb')}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedData.map((db, idx) => (
                <TableRow key={idx}>
                  <TableCell className="font-mono text-xs py-2">{db.server}</TableCell>
                  <TableCell className="font-mono text-xs font-medium py-2">{db.database}</TableCell>
                  <TableCell className="text-right font-mono text-xs font-bold py-2">{db.totalGb.toFixed(1)}</TableCell>
                  <TableCell className="text-right font-mono text-xs py-2">{db.dataGb.toFixed(1)}</TableCell>
                  <TableCell className="text-right font-mono text-xs py-2">{db.logGb.toFixed(1)}</TableCell>
                  <TableCell className="text-right font-mono text-xs text-info py-2">
                    +{db.growth7dGb.toFixed(1)}
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
