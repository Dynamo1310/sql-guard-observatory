/**
 * Página de Bases de Datos - Tamaño y crecimiento
 */
import { useState, useEffect, useMemo, useCallback } from 'react';
import { Database, TrendingUp, HardDrive, RefreshCw, Search } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useTableSort } from '@/hooks/use-table-sort';
import { mockDatabases } from '@/lib/mockData';

export default function Databases() {
  const [databases, setDatabases] = useState<typeof mockDatabases>([]);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Simular carga de datos
  const fetchData = useCallback(async (showLoading: boolean = true) => {
    if (showLoading) setLoading(true);
    else setIsRefreshing(true);
    
    try {
      // Simular delay de API
      await new Promise(resolve => setTimeout(resolve, 500));
      setDatabases(mockDatabases);
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Filtrar por búsqueda
  const filteredDatabases = useMemo(() => {
    if (!searchQuery) return databases;
    return databases.filter(db => 
      db.server.toLowerCase().includes(searchQuery.toLowerCase()) ||
      db.database.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [databases, searchQuery]);

  // Estadísticas
  const stats = useMemo(() => {
    const totalSize = databases.reduce((sum, db) => sum + db.totalGb, 0);
    const totalGrowth = databases.reduce((sum, db) => sum + db.growth7dGb, 0);
    const largestDb = databases.length > 0 ? Math.max(...databases.map(db => db.totalGb)) : 0;
    const avgSize = databases.length > 0 ? totalSize / databases.length : 0;
    return { totalSize, totalGrowth, largestDb, avgSize, count: databases.length };
  }, [databases]);

  const { sortedData, requestSort, getSortIndicator } = useTableSort(filteredDatabases);

  // Loading State
  if (loading) {
    return (
      <div className="container mx-auto p-6 space-y-6">
        {/* Header skeleton */}
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <Skeleton className="h-9 w-48" />
            <Skeleton className="h-5 w-72" />
          </div>
          <Skeleton className="h-9 w-28" />
        </div>
        
        {/* Stats cards skeleton */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-4" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-20" />
                <Skeleton className="h-3 w-32 mt-2" />
              </CardContent>
            </Card>
          ))}
        </div>
        
        {/* Table skeleton */}
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-48" />
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {[...Array(8)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Database className="h-8 w-8" />
            Bases de Datos
          </h1>
          <p className="text-muted-foreground">
            Tamaño y crecimiento de bases de datos
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => fetchData(false)}
          disabled={isRefreshing}
        >
          <RefreshCw className={cn('h-4 w-4 mr-2', isRefreshing && 'animate-spin')} />
          Actualizar
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Tamaño Total</CardTitle>
            <HardDrive className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">
              {stats.totalSize.toFixed(0)} GB
            </div>
            <p className="text-xs text-muted-foreground">
              {stats.count} bases de datos
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Crecimiento (7d)</CardTitle>
            <TrendingUp className={`h-4 w-4 ${stats.totalGrowth > 10 ? 'text-warning' : 'text-emerald-500'}`} />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${stats.totalGrowth > 10 ? 'text-warning' : 'text-emerald-500'}`}>
              +{stats.totalGrowth.toFixed(1)} GB
            </div>
            <p className="text-xs text-muted-foreground">
              Última semana
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Base Más Grande</CardTitle>
            <Database className="h-4 w-4 text-violet-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-violet-500">
              {stats.largestDb.toFixed(0)} GB
            </div>
            <p className="text-xs text-muted-foreground">
              Tamaño máximo
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Promedio</CardTitle>
            <Database className="h-4 w-4 text-cyan-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-cyan-500">
              {stats.avgSize.toFixed(1)} GB
            </div>
            <p className="text-xs text-muted-foreground">
              Tamaño promedio
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <div className="flex flex-wrap gap-4">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar base de datos..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {/* Results count */}
      <div className="text-sm text-muted-foreground">
        {filteredDatabases.length === databases.length 
          ? `${databases.length} bases de datos`
          : `${filteredDatabases.length} de ${databases.length} bases de datos`
        }
      </div>

      {/* Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5 text-primary" />
            Detalle de Bases de Datos
          </CardTitle>
          <CardDescription>
            Información de tamaño y crecimiento por base de datos
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="max-h-[500px] overflow-auto">
            {sortedData.length === 0 ? (
              <div className="text-center py-12">
                <Database className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-semibold mb-2">No hay bases de datos</h3>
                <p className="text-muted-foreground">
                  No se encontraron bases de datos con los filtros seleccionados.
                </p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="cursor-pointer hover:bg-accent" onClick={() => requestSort('server')}>
                      Servidor {getSortIndicator('server')}
                    </TableHead>
                    <TableHead className="cursor-pointer hover:bg-accent" onClick={() => requestSort('database')}>
                      Base de Datos {getSortIndicator('database')}
                    </TableHead>
                    <TableHead className="text-right cursor-pointer hover:bg-accent" onClick={() => requestSort('totalGb')}>
                      Total (GB) {getSortIndicator('totalGb')}
                    </TableHead>
                    <TableHead className="text-right cursor-pointer hover:bg-accent" onClick={() => requestSort('dataGb')}>
                      Data (GB) {getSortIndicator('dataGb')}
                    </TableHead>
                    <TableHead className="text-right cursor-pointer hover:bg-accent" onClick={() => requestSort('logGb')}>
                      Log (GB) {getSortIndicator('logGb')}
                    </TableHead>
                    <TableHead className="text-right cursor-pointer hover:bg-accent" onClick={() => requestSort('growth7dGb')}>
                      Crecimiento 7d {getSortIndicator('growth7dGb')}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedData.map((db, idx) => (
                    <TableRow key={idx}>
                      <TableCell className="font-medium">{db.server}</TableCell>
                      <TableCell className="font-medium">{db.database}</TableCell>
                      <TableCell className="text-right font-bold text-sm">{db.totalGb.toFixed(1)}</TableCell>
                      <TableCell className="text-right text-sm text-muted-foreground">{db.dataGb.toFixed(1)}</TableCell>
                      <TableCell className="text-right text-sm text-muted-foreground">{db.logGb.toFixed(1)}</TableCell>
                      <TableCell className="text-right">
                        <Badge 
                          variant="outline" 
                          className={cn(
                            "text-xs",
                            db.growth7dGb > 5 ? "bg-warning/10 text-warning border-warning/30" : 
                            db.growth7dGb > 0 ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/30" :
                            "text-muted-foreground"
                          )}
                        >
                          +{db.growth7dGb.toFixed(1)} GB
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
