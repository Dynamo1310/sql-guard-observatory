import { useEffect, useState, useMemo } from 'react';
import { CheckCircle2, XCircle, StopCircle, Search } from 'lucide-react';
import { KPICard } from '@/components/dashboard/KPICard';
import { StatusBadge } from '@/components/dashboard/StatusBadge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { jobsApi, JobDto, JobSummaryDto, JobFiltersDto } from '@/services/api';
import { toast } from 'sonner';
import { useTableSort } from '@/hooks/use-table-sort';

export default function Jobs() {
  const [jobs, setJobs] = useState<JobDto[]>([]);
  const [summary, setSummary] = useState<JobSummaryDto | null>(null);
  const [filters, setFilters] = useState<JobFiltersDto | null>(null);
  const [loading, setLoading] = useState(true);

  // Filtros seleccionados
  const [selectedAmbiente, setSelectedAmbiente] = useState<string>('All');
  const [selectedHosting, setSelectedHosting] = useState<string>('All');
  const [selectedInstance, setSelectedInstance] = useState<string>('All');
  const [selectedStatus, setSelectedStatus] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState<string>('');

  useEffect(() => {
    loadFilters();
  }, []);

  useEffect(() => {
    loadData();
  }, [selectedAmbiente, selectedHosting, selectedInstance]);

  const loadFilters = async () => {
    try {
      const data = await jobsApi.getFilters();
      setFilters(data);
    } catch (err: any) {
      toast.error('Error al cargar filtros: ' + err.message);
    }
  };

  const loadData = async () => {
    try {
      setLoading(true);
      const [jobsData, summaryData] = await Promise.all([
        jobsApi.getJobs(
          selectedAmbiente !== 'All' ? selectedAmbiente : undefined,
          selectedHosting !== 'All' ? selectedHosting : undefined,
          selectedInstance !== 'All' ? selectedInstance : undefined
        ),
        jobsApi.getJobsSummary(
          selectedAmbiente !== 'All' ? selectedAmbiente : undefined,
          selectedHosting !== 'All' ? selectedHosting : undefined,
          selectedInstance !== 'All' ? selectedInstance : undefined
        ),
      ]);

      setJobs(jobsData);
      setSummary(summaryData);
    } catch (err: any) {
      toast.error('Error al cargar datos: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const getJobStatusVariant = (status: string): 'success' | 'critical' | 'info' | 'warning' => {
    const statusLower = status.toLowerCase();
    if (statusLower === 'succeeded') return 'success';
    if (statusLower === 'failed') return 'critical';
    if (statusLower === 'stopped' || statusLower === 'canceled') return 'warning';
    return 'info';
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  };

  const formatDateTime = (dateString: string | null) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleString('es-ES');
  };

  // Obtener estados únicos de los jobs
  const uniqueStatuses = useMemo(() => {
    const statuses = new Set(jobs.map(job => job.executionStatus));
    return Array.from(statuses).sort();
  }, [jobs]);

  // Filtrar y buscar jobs
  const filteredJobs = useMemo(() => {
    return jobs.filter((job) => {
      // Filtro por estado
      if (selectedStatus !== 'All' && job.executionStatus !== selectedStatus) {
        return false;
      }

      // Búsqueda por cualquier columna
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        return (
          job.instanceName?.toLowerCase().includes(query) ||
          job.jobName?.toLowerCase().includes(query) ||
          job.ambiente?.toLowerCase().includes(query) ||
          job.hosting?.toLowerCase().includes(query) ||
          job.executionStatus?.toLowerCase().includes(query) ||
          job.jobEnabled?.toLowerCase().includes(query) ||
          formatDateTime(job.jobStart)?.toLowerCase().includes(query) ||
          formatDateTime(job.jobEnd)?.toLowerCase().includes(query)
        );
      }

      return true;
    });
  }, [jobs, selectedStatus, searchQuery]);

  // Ordenamiento
  const { sortedData, requestSort, getSortIndicator } = useTableSort(filteredJobs);

  if (loading && !summary) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-center h-64">
          <div className="text-muted-foreground">Cargando jobs...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-3 sm:p-4 lg:p-6 space-y-3 sm:space-y-4">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold">SQL Agent Jobs</h1>
        <p className="text-sm sm:text-base text-muted-foreground mt-1">Estado y ejecución de trabajos programados</p>
      </div>

      {/* Filtros */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col lg:flex-row items-start lg:items-center gap-4">
            {/* Dropdowns a la izquierda */}
            <div className="flex flex-col sm:flex-row flex-wrap items-start sm:items-center gap-4 flex-1">
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <span className="text-sm text-muted-foreground whitespace-nowrap">Ambiente:</span>
                <Select value={selectedAmbiente} onValueChange={setSelectedAmbiente}>
                  <SelectTrigger className="w-full sm:w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="max-h-[300px] overflow-y-auto">
                    <SelectItem value="All">Todos</SelectItem>
                    {filters?.ambientes.map((amb) => (
                      <SelectItem key={amb} value={amb}>
                        {amb}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-2 w-full sm:w-auto">
                <span className="text-sm text-muted-foreground whitespace-nowrap">Hosting:</span>
                <Select value={selectedHosting} onValueChange={setSelectedHosting}>
                  <SelectTrigger className="w-full sm:w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="max-h-[300px] overflow-y-auto">
                    <SelectItem value="All">Todos</SelectItem>
                    {filters?.hostings.map((host) => (
                      <SelectItem key={host} value={host}>
                        {host}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-2 w-full sm:w-auto">
                <span className="text-sm text-muted-foreground whitespace-nowrap">Instancia:</span>
                <Select value={selectedInstance} onValueChange={setSelectedInstance}>
                  <SelectTrigger className="w-full sm:w-60">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="max-h-[300px] overflow-y-auto">
                    <SelectItem value="All">Todas</SelectItem>
                    {filters?.instances.map((inst) => (
                      <SelectItem key={inst} value={inst}>
                        {inst}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-2 w-full sm:w-auto">
                <span className="text-sm text-muted-foreground whitespace-nowrap">Estado:</span>
                <Select value={selectedStatus} onValueChange={setSelectedStatus}>
                  <SelectTrigger className="w-full sm:w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="max-h-[300px] overflow-y-auto">
                    <SelectItem value="All">Todos</SelectItem>
                    {uniqueStatuses.map((status) => (
                      <SelectItem key={status} value={status}>
                        {status}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Búsqueda a la derecha */}
            <div className="flex items-center gap-2 w-full lg:w-80">
              <Search className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              <Input
                placeholder="Buscar..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* KPIs */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
        <KPICard
          title="Jobs Exitosos"
          value={summary?.jobsSucceeded || 0}
          icon={CheckCircle2}
          variant="success"
        />
        <KPICard
          title="Jobs Fallidos"
          value={summary?.jobsFailed || 0}
          icon={XCircle}
          variant={summary?.jobsFailed === 0 ? 'success' : 'critical'}
        />
        <KPICard
          title="Jobs Detenidos"
          value={summary?.jobsStopped || 0}
          icon={StopCircle}
          variant="warning"
        />
      </div>

      {/* Tabla de Jobs */}
      <Card className="gradient-card shadow-card">
        <CardHeader>
          <CardTitle>Listado de Jobs ({sortedData.length} de {jobs.length})</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead 
                  className="text-xs cursor-pointer hover:bg-accent px-2"
                  onClick={() => requestSort('instanceName')}
                >
                  Instancia {getSortIndicator('instanceName')}
                </TableHead>
                <TableHead 
                  className="text-xs cursor-pointer hover:bg-accent max-w-[200px] px-2"
                  onClick={() => requestSort('jobName')}
                >
                  Job {getSortIndicator('jobName')}
                </TableHead>
                <TableHead 
                  className="text-xs cursor-pointer hover:bg-accent px-2"
                  onClick={() => requestSort('ambiente')}
                >
                  Ambiente {getSortIndicator('ambiente')}
                </TableHead>
                <TableHead 
                  className="text-xs cursor-pointer hover:bg-accent px-2"
                  onClick={() => requestSort('hosting')}
                >
                  Hosting {getSortIndicator('hosting')}
                </TableHead>
                <TableHead 
                  className="text-xs cursor-pointer hover:bg-accent max-w-[120px] px-2"
                  onClick={() => requestSort('jobStart')}
                >
                  Inicio {getSortIndicator('jobStart')}
                </TableHead>
                <TableHead 
                  className="text-xs cursor-pointer hover:bg-accent max-w-[120px] px-2"
                  onClick={() => requestSort('jobEnd')}
                >
                  Fin {getSortIndicator('jobEnd')}
                </TableHead>
                <TableHead 
                  className="text-xs cursor-pointer hover:bg-accent px-2"
                  onClick={() => requestSort('jobDurationSeconds')}
                >
                  Duración {getSortIndicator('jobDurationSeconds')}
                </TableHead>
                <TableHead 
                  className="text-xs cursor-pointer hover:bg-accent px-2"
                  onClick={() => requestSort('executionStatus')}
                >
                  Estado {getSortIndicator('executionStatus')}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedData.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground">
                    No se encontraron jobs
                  </TableCell>
                </TableRow>
              ) : (
                sortedData.map((job) => (
                  <TableRow key={job.id}>
                    <TableCell className="font-mono text-xs py-2 px-2">{job.instanceName}</TableCell>
                    <TableCell className="font-medium text-xs py-2 px-2 max-w-[200px] break-words">{job.jobName}</TableCell>
                    <TableCell className="text-xs py-2 px-2">{job.ambiente}</TableCell>
                    <TableCell className="text-xs py-2 px-2">{job.hosting}</TableCell>
                    <TableCell className="font-mono text-xs py-2 px-2 max-w-[120px] break-words">
                      {formatDateTime(job.jobStart)}
                    </TableCell>
                    <TableCell className="font-mono text-xs py-2 px-2 max-w-[120px] break-words">
                      {formatDateTime(job.jobEnd)}
                    </TableCell>
                    <TableCell className="font-mono text-xs py-2 px-2 whitespace-nowrap">
                      {formatDuration(job.jobDurationSeconds)}
                    </TableCell>
                    <TableCell className="py-2 px-2">
                      <StatusBadge status={getJobStatusVariant(job.executionStatus)}>
                        {job.executionStatus}
                      </StatusBadge>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
