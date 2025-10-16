import { Database } from 'lucide-react';
import { KPICard } from '@/components/dashboard/KPICard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { mockDatabases } from '@/lib/mockData';

export default function Databases() {
  const totalSize = mockDatabases.reduce((sum, db) => sum + db.totalGb, 0);
  const totalGrowth = mockDatabases.reduce((sum, db) => sum + db.growth7dGb, 0);
  const largestDb = Math.max(...mockDatabases.map(db => db.totalGb));

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Bases de Datos</h1>
        <p className="text-muted-foreground mt-1">Tamaño y crecimiento de bases de datos</p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
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
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Servidor</TableHead>
                <TableHead>Base de Datos</TableHead>
                <TableHead className="text-right">Total (GB)</TableHead>
                <TableHead className="text-right">Data (GB)</TableHead>
                <TableHead className="text-right">Log (GB)</TableHead>
                <TableHead className="text-right">Crecimiento 7d (GB)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {mockDatabases.map((db, idx) => (
                <TableRow key={idx}>
                  <TableCell className="font-mono text-sm">{db.server}</TableCell>
                  <TableCell className="font-mono text-sm font-medium">{db.database}</TableCell>
                  <TableCell className="text-right font-mono font-bold">{db.totalGb.toFixed(1)}</TableCell>
                  <TableCell className="text-right font-mono">{db.dataGb.toFixed(1)}</TableCell>
                  <TableCell className="text-right font-mono">{db.logGb.toFixed(1)}</TableCell>
                  <TableCell className="text-right font-mono text-info">
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
