import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { CalendarIcon, Plus, Trash2, Filter, X, BarChart3 } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import {
  dbaAbsencesApi,
  DbaAbsenceDto,
  DbaAbsenceDbaDto,
  DbaAbsenceStatsDto,
} from '@/services/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Combobox } from '@/components/ui/combobox';
import { Skeleton } from '@/components/ui/skeleton';
import { cn, formatDateUTC3 } from '@/lib/utils';

export default function DbaAbsences() {
  const [absences, setAbsences] = useState<DbaAbsenceDto[]>([]);
  const [dbas, setDbas] = useState<DbaAbsenceDbaDto[]>([]);
  const [stats, setStats] = useState<DbaAbsenceStatsDto | null>(null);
  const [loading, setLoading] = useState(true);

  // Filtros
  const [filterDateFrom, setFilterDateFrom] = useState<Date | undefined>();
  const [filterDateTo, setFilterDateTo] = useState<Date | undefined>();
  const [filterDba, setFilterDba] = useState('');

  // Diálogo de creación
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newAbsence, setNewAbsence] = useState({
    userId: '',
    date: undefined as Date | undefined,
    reason: '',
    notes: '',
  });

  // Estado del gráfico
  const [showStats, setShowStats] = useState(true);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const dateFromStr = filterDateFrom ? format(filterDateFrom, 'yyyy-MM-dd') : undefined;
      const dateToStr = filterDateTo ? format(filterDateTo, 'yyyy-MM-dd') : undefined;
      const dbaFilter = filterDba || undefined;

      const [absencesData, statsData] = await Promise.all([
        dbaAbsencesApi.getAll(dateFromStr, dateToStr, dbaFilter),
        dbaAbsencesApi.getStats(dateFromStr, dateToStr),
      ]);

      setAbsences(absencesData);
      setStats(statsData);
    } catch {
      toast.error('Error al cargar ausencias');
    } finally {
      setLoading(false);
    }
  }, [filterDateFrom, filterDateTo, filterDba]);

  const loadDbas = useCallback(async () => {
    try {
      const data = await dbaAbsencesApi.getAvailableDbas();
      setDbas(data);
    } catch {
      toast.error('Error al cargar la lista de DBAs');
    }
  }, []);

  useEffect(() => {
    loadDbas();
  }, [loadDbas]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleCreate = async () => {
    if (!newAbsence.userId || !newAbsence.date || !newAbsence.reason.trim()) {
      toast.error('Complete los campos obligatorios: DBA, fecha y motivo');
      return;
    }

    try {
      setCreating(true);
      await dbaAbsencesApi.create({
        userId: newAbsence.userId,
        date: format(newAbsence.date, 'yyyy-MM-dd'),
        reason: newAbsence.reason.trim(),
        notes: newAbsence.notes.trim() || undefined,
      });
      toast.success('Ausencia registrada correctamente');
      setShowCreate(false);
      setNewAbsence({ userId: '', date: undefined, reason: '', notes: '' });
      await loadData();
    } catch {
      toast.error('Error al registrar la ausencia');
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await dbaAbsencesApi.delete(id);
      toast.success('Ausencia eliminada');
      await loadData();
    } catch {
      toast.error('Error al eliminar la ausencia');
    }
  };

  const clearFilters = () => {
    setFilterDateFrom(undefined);
    setFilterDateTo(undefined);
    setFilterDba('');
  };

  const hasActiveFilters = filterDateFrom || filterDateTo || filterDba;

  const dbaOptions = dbas.map(d => ({ value: d.userId, label: d.displayName }));

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Ausencias DBA</h1>
          <p className="text-sm text-muted-foreground">
            Registro de ausencias del equipo DBA - Grupo IDD (General)
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowStats(!showStats)}
            className="gap-1.5"
          >
            <BarChart3 className="h-4 w-4" />
            {showStats ? 'Ocultar' : 'Mostrar'} Estadísticas
          </Button>
          <Button onClick={() => setShowCreate(true)} className="gap-1.5">
            <Plus className="h-4 w-4" />
            Registrar Ausencia
          </Button>
        </div>
      </div>

      {/* Estadísticas */}
      {showStats && stats && stats.monthlyStats.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-medium">Ausencias por mes</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stats.monthlyStats} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis
                    dataKey="month"
                    tick={{ fontSize: 12 }}
                    className="fill-muted-foreground"
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fontSize: 12 }}
                    className="fill-muted-foreground"
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'hsl(var(--background))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                      fontSize: '12px',
                    }}
                    labelFormatter={(label) => `Mes: ${label}`}
                    formatter={(value: number) => [`${value} ausencia(s)`, 'Total']}
                  />
                  <Bar
                    dataKey="count"
                    fill="hsl(var(--primary))"
                    radius={[4, 4, 0, 0]}
                    maxBarSize={40}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filtros */}
      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
              <Filter className="h-4 w-4" />
              Filtros
            </div>

            <div className="flex flex-col gap-1">
              <Label className="text-xs">Desde</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className={cn(
                      'w-[150px] justify-start text-left font-normal',
                      !filterDateFrom && 'text-muted-foreground'
                    )}
                  >
                    <CalendarIcon className="mr-2 h-3.5 w-3.5" />
                    {filterDateFrom ? format(filterDateFrom, 'dd/MM/yyyy') : 'Fecha desde'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={filterDateFrom}
                    onSelect={setFilterDateFrom}
                    locale={es}
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div className="flex flex-col gap-1">
              <Label className="text-xs">Hasta</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className={cn(
                      'w-[150px] justify-start text-left font-normal',
                      !filterDateTo && 'text-muted-foreground'
                    )}
                  >
                    <CalendarIcon className="mr-2 h-3.5 w-3.5" />
                    {filterDateTo ? format(filterDateTo, 'dd/MM/yyyy') : 'Fecha hasta'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={filterDateTo}
                    onSelect={setFilterDateTo}
                    locale={es}
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div className="flex flex-col gap-1">
              <Label className="text-xs">DBA</Label>
              <Combobox
                options={dbaOptions}
                value={filterDba}
                onValueChange={setFilterDba}
                placeholder="Todos los DBAs"
                searchPlaceholder="Buscar DBA..."
                emptyText="Sin resultados"
                className="w-[200px]"
              />
            </div>

            {hasActiveFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters} className="gap-1 h-9">
                <X className="h-3.5 w-3.5" />
                Limpiar
              </Button>
            )}

            <div className="ml-auto">
              <Badge variant="secondary" className="text-xs">
                {absences.length} registro{absences.length !== 1 ? 's' : ''}
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabla */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="space-y-3 p-6">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : absences.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <p className="text-muted-foreground text-sm">No se encontraron ausencias registradas</p>
              <Button
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={() => setShowCreate(true)}
              >
                <Plus className="h-4 w-4 mr-1.5" />
                Registrar primera ausencia
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>DBA</TableHead>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Motivo</TableHead>
                  <TableHead>Observaciones</TableHead>
                  <TableHead>Registrado por</TableHead>
                  <TableHead className="w-[80px]">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {absences.map((absence) => (
                  <TableRow key={absence.id}>
                    <TableCell className="font-medium">{absence.userDisplayName}</TableCell>
                    <TableCell>
                      {formatDateUTC3(absence.date, false)}
                    </TableCell>
                    <TableCell>{absence.reason}</TableCell>
                    <TableCell className="text-muted-foreground text-sm max-w-[200px] truncate">
                      {absence.notes || '-'}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {absence.createdByDisplayName}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                        onClick={() => handleDelete(absence.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Diálogo de creación */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>Registrar Ausencia</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>DBA *</Label>
              <Select
                value={newAbsence.userId}
                onValueChange={(val) => setNewAbsence(prev => ({ ...prev, userId: val }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar DBA..." />
                </SelectTrigger>
                <SelectContent>
                  {dbas.map((dba) => (
                    <SelectItem key={dba.userId} value={dba.userId}>
                      {dba.displayName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label>Fecha *{newAbsence.date ? ` — ${format(newAbsence.date, 'dd/MM/yyyy')}` : ''}</Label>
              <div className="rounded-md border">
                <Calendar
                  mode="single"
                  selected={newAbsence.date}
                  onSelect={(date) => setNewAbsence(prev => ({ ...prev, date: date ?? undefined }))}
                  locale={es}
                />
              </div>
            </div>

            <div className="grid gap-2">
              <Label>Motivo *</Label>
              <Input
                placeholder="Ej: Vacaciones, Enfermedad, Capacitación..."
                value={newAbsence.reason}
                onChange={(e) => setNewAbsence(prev => ({ ...prev, reason: e.target.value }))}
              />
            </div>

            <div className="grid gap-2">
              <Label>Observaciones</Label>
              <Textarea
                placeholder="Notas adicionales (opcional)"
                value={newAbsence.notes}
                onChange={(e) => setNewAbsence(prev => ({ ...prev, notes: e.target.value }))}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>
              Cancelar
            </Button>
            <Button onClick={handleCreate} disabled={creating}>
              {creating ? 'Registrando...' : 'Registrar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
