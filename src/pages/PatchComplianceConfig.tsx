/**
 * Página de Configuración de Compliance
 */
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  Settings, Save, Trash2, Plus, RefreshCw, ShieldCheck, 
  AlertTriangle, Info, CheckCircle2, Cloud 
} from 'lucide-react';
import { SqlServerIcon } from '@/components/icons/SqlServerIcon';
import { patchingApi, PatchComplianceConfigDto, BuildReferenceDto } from '@/services/api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { Capabilities } from '@/lib/capabilities';

const SQL_VERSIONS = ['2005', '2008', '2008 R2', '2012', '2014', '2016', '2017', '2019', '2022'];
const CURRENT_YEAR = new Date().getFullYear();
const AVAILABLE_YEARS = [CURRENT_YEAR - 1, CURRENT_YEAR, CURRENT_YEAR + 1, CURRENT_YEAR + 2];

// Versiones que soportan configuración AWS (2017+)
const AWS_SUPPORTED_VERSIONS = ['2017', '2019', '2022'];

const isAwsSupportedVersion = (version: string): boolean => {
  return AWS_SUPPORTED_VERSIONS.includes(version);
};

export default function PatchComplianceConfig() {
  const queryClient = useQueryClient();
  const { hasCapability } = useAuth();
  const canConfigureCompliance = hasCapability(Capabilities.PatchingConfigureCompliance);
  
  const [selectedYear, setSelectedYear] = useState<number>(CURRENT_YEAR);
  const [editingConfig, setEditingConfig] = useState<PatchComplianceConfigDto | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [selectedVersion, setSelectedVersion] = useState<string>('');
  const [availableBuilds, setAvailableBuilds] = useState<BuildReferenceDto[]>([]);
  const [loadingBuilds, setLoadingBuilds] = useState(false);
  const [buildSearchTerm, setBuildSearchTerm] = useState<string>('');
  const [awsBuildSearchTerm, setAwsBuildSearchTerm] = useState<string>('');
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleCloseDialog = () => {
    setIsDialogOpen(false);
    setEditingConfig(null);
    setBuildSearchTerm('');
    setAwsBuildSearchTerm('');
    setSelectedVersion('');
    setAvailableBuilds([]);
  };

  const { data: configs, isLoading, refetch } = useQuery({
    queryKey: ['complianceConfigs', selectedYear],
    queryFn: () => patchingApi.getComplianceConfigs(selectedYear),
  });

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refetch();
    setIsRefreshing(false);
  };

  const saveMutation = useMutation({
    mutationFn: patchingApi.saveComplianceConfig,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['complianceConfigs'] });
      handleCloseDialog();
      toast.success('Configuración guardada', {
        description: 'La configuración de compliance se guardó correctamente',
      });
    },
    onError: (error: Error) => {
      toast.error('Error al guardar', {
        description: error.message,
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: patchingApi.deleteComplianceConfig,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['complianceConfigs'] });
      setDeleteId(null);
      toast.success('Configuración eliminada', {
        description: 'La configuración se eliminó correctamente',
      });
    },
    onError: (error: Error) => {
      toast.error('Error al eliminar', {
        description: error.message,
      });
    },
  });

  const loadBuildsForVersion = async (version: string) => {
    if (!version) return;
    setLoadingBuilds(true);
    try {
      const builds = await patchingApi.getAvailableBuilds(version);
      setAvailableBuilds(builds);
    } catch (error) {
      console.error('Error loading builds:', error);
      setAvailableBuilds([]);
    } finally {
      setLoadingBuilds(false);
    }
  };

  const formatBuildName = (build: BuildReferenceDto) => {
    if (build.cu) return build.cu;
    if (build.sp) return build.sp;
    if (build.kb) return build.kb;
    return build.version;
  };

  const handleNewConfig = () => {
    setEditingConfig({
      id: 0,
      complianceYear: selectedYear,
      sqlVersion: '',
      requiredBuild: '',
      requiredCU: '',
      requiredKB: '',
      description: '',
      isActive: true,
    });
    setSelectedVersion('');
    setAvailableBuilds([]);
    setIsDialogOpen(true);
  };

  const handleEditConfig = (config: PatchComplianceConfigDto) => {
    setEditingConfig({ ...config });
    setSelectedVersion(config.sqlVersion);
    loadBuildsForVersion(config.sqlVersion);
    setIsDialogOpen(true);
  };

  const handleVersionChange = (version: string) => {
    setSelectedVersion(version);
    setBuildSearchTerm('');
    setAwsBuildSearchTerm('');
    if (editingConfig) {
      setEditingConfig({ ...editingConfig, sqlVersion: version });
    }
    loadBuildsForVersion(version);
  };

  const handleBuildSelect = (build: BuildReferenceDto) => {
    if (editingConfig) {
      const updateType = build.cu || build.sp || '';
      setEditingConfig({
        ...editingConfig,
        requiredBuild: build.version,
        requiredCU: updateType,
        requiredKB: build.kb || '',
      });
    }
  };

  const handleAwsBuildSelect = (build: BuildReferenceDto) => {
    if (editingConfig) {
      const updateType = build.cu || build.sp || '';
      setEditingConfig({
        ...editingConfig,
        awsRequiredBuild: build.version,
        awsRequiredCU: updateType,
        awsRequiredKB: build.kb || '',
      });
    }
  };

  const handleClearAwsConfig = () => {
    if (editingConfig) {
      setEditingConfig({
        ...editingConfig,
        awsRequiredBuild: undefined,
        awsRequiredCU: undefined,
        awsRequiredKB: undefined,
      });
    }
  };

  const handleSave = () => {
    if (!editingConfig) return;
    
    if (!editingConfig.sqlVersion || !editingConfig.requiredBuild) {
      toast.error('Campos requeridos', {
        description: 'Debe seleccionar una versión y un build requerido',
      });
      return;
    }
    
    saveMutation.mutate(editingConfig);
  };

  const availableVersions = SQL_VERSIONS.filter(
    v => !configs?.some(c => c.sqlVersion === v) || editingConfig?.sqlVersion === v
  );

  // Stats
  const stats = {
    total: configs?.length || 0,
    active: configs?.filter(c => c.isActive).length || 0,
    inactive: configs?.filter(c => !c.isActive).length || 0,
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="container mx-auto p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <Skeleton className="h-9 w-64" />
            <Skeleton className="h-5 w-96" />
          </div>
          <div className="flex gap-2">
            <Skeleton className="h-9 w-32" />
            <Skeleton className="h-9 w-28" />
          </div>
        </div>
        
        <div className="grid gap-4 md:grid-cols-3">
          {[...Array(3)].map((_, i) => (
            <Card key={i}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-4" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-16" />
              </CardContent>
            </Card>
          ))}
        </div>
        
        <Card>
          <CardContent className="pt-6">
            <div className="flex gap-3">
              <Skeleton className="h-5 w-5" />
              <div className="space-y-2 flex-1">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
              </div>
            </div>
          </CardContent>
        </Card>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-6 w-32" />
                <Skeleton className="h-4 w-48" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-24 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <div className="relative">
              <SqlServerIcon className="h-8 w-8" />
              <Settings className="h-4 w-4 text-primary absolute -bottom-1 -right-1" />
            </div>
            Configuración de Compliance
          </h1>
          <p className="text-muted-foreground">
            Define el nivel de parche requerido por versión de SQL Server
          </p>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <Select value={selectedYear.toString()} onValueChange={(v) => setSelectedYear(parseInt(v))}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Año" />
            </SelectTrigger>
            <SelectContent>
              {AVAILABLE_YEARS.map(year => (
                <SelectItem key={year} value={year.toString()}>
                  Compliance {year}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={handleRefresh} variant="outline" disabled={isRefreshing}>
            <RefreshCw className={cn('w-4 h-4 mr-2', isRefreshing && 'animate-spin')} />
            Actualizar
          </Button>
          {canConfigureCompliance && (
            <Button onClick={handleNewConfig}>
              <Plus className="w-4 h-4 mr-2" />
              Nueva Configuración
            </Button>
          )}
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Configuraciones</CardTitle>
            <Settings className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">{stats.total}</div>
            <p className="text-xs text-muted-foreground">
              versiones configuradas
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Activas</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-500">{stats.active}</div>
            <p className="text-xs text-muted-foreground">
              aplicando compliance
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Inactivas</CardTitle>
            <AlertTriangle className={`h-4 w-4 ${stats.inactive > 0 ? 'text-warning' : 'text-emerald-500'}`} />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${stats.inactive > 0 ? 'text-warning' : 'text-emerald-500'}`}>
              {stats.inactive}
            </div>
            <p className="text-xs text-muted-foreground">
              sin aplicar
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Info Card */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex gap-3">
            <Info className="h-5 w-5 text-muted-foreground mt-0.5 shrink-0" />
            <div className="text-sm text-muted-foreground">
              <p>
                Configure aquí el <strong>nivel mínimo de parche</strong> requerido para cada versión de SQL Server.
                Los servidores que estén por debajo de este nivel aparecerán como 
                <Badge variant="outline" className="bg-warning/10 text-warning border-warning/30 mx-1">No Compliance</Badge>.
              </p>
              <p className="mt-2">
                Los que cumplan el requisito pero no estén en la última CU disponible aparecerán como 
                <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/30 mx-1">Compliance</Badge>.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Configurations Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {configs?.map((config) => (
          <Card 
            key={config.id} 
            className={cn('transition-all hover:shadow-md', {
              'border-emerald-500/30': config.isActive,
              'opacity-60': !config.isActive,
            })}
          >
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg flex items-center gap-2">
                  <ShieldCheck className={cn('h-5 w-5', {
                    'text-emerald-500': config.isActive,
                    'text-muted-foreground': !config.isActive,
                  })} />
                  SQL Server {config.sqlVersion}
                </CardTitle>
                <Badge variant={config.isActive ? 'default' : 'secondary'}>
                  {config.isActive ? 'Activo' : 'Inactivo'}
                </Badge>
              </div>
              <CardDescription>
                {config.description || 'Sin descripción'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <p className="text-muted-foreground">Build Requerido</p>
                  <p className="font-mono font-medium">{config.requiredBuild}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">CU/SP</p>
                  <p className="font-medium">{config.requiredCU || '-'}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">KB</p>
                  <p className="font-mono text-xs">{config.requiredKB || '-'}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Actualizado</p>
                  <p className="text-xs">
                    {config.updatedAt 
                      ? new Date(config.updatedAt).toLocaleDateString('es-AR')
                      : '-'}
                  </p>
                </div>
              </div>
              
              {/* Indicador de configuración AWS */}
              {config.awsRequiredBuild && isAwsSupportedVersion(config.sqlVersion) && (
                <div className="p-2 rounded-md bg-orange-500/10 border border-orange-500/30">
                  <div className="flex items-center gap-2 mb-1">
                    <Cloud className="h-4 w-4 text-orange-500" />
                    <span className="text-xs font-medium text-orange-600 dark:text-orange-400">AWS</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <p className="text-muted-foreground">Build</p>
                      <p className="font-mono">{config.awsRequiredBuild}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">CU/SP</p>
                      <p>{config.awsRequiredCU || '-'}</p>
                    </div>
                  </div>
                </div>
              )}
              
              {canConfigureCompliance && (
                <div className="flex gap-2 pt-2 border-t">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="flex-1"
                    onClick={() => handleEditConfig(config)}
                  >
                    Editar
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm"
                    className="text-red-500 hover:text-red-500"
                    onClick={() => setDeleteId(config.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        ))}

        {/* Empty State for unconfigured versions */}
        {canConfigureCompliance && availableVersions.length > 0 && (
          <Card 
            className="border-dashed border-2 hover:border-primary/50 transition-colors cursor-pointer"
            onClick={handleNewConfig}
          >
            <CardContent className="flex flex-col items-center justify-center h-full min-h-[200px] text-center">
              <Plus className="h-8 w-8 text-muted-foreground mb-2" />
              <p className="text-muted-foreground">
                Agregar configuración para SQL Server
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {availableVersions.join(', ')}
              </p>
            </CardContent>
          </Card>
        )}

        {/* Empty state when no configs */}
        {(!configs || configs.length === 0) && !canConfigureCompliance && (
          <Card className="col-span-full">
            <CardContent className="text-center py-12">
              <Settings className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">Sin configuraciones</h3>
              <p className="text-muted-foreground">
                No hay configuraciones de compliance para el año {selectedYear}.
              </p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={(open) => !open && handleCloseDialog()}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingConfig?.id ? 'Editar' : 'Nueva'} Configuración de Compliance
            </DialogTitle>
            <DialogDescription>
              Define el nivel mínimo de parche requerido para esta versión de SQL Server
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Versión de SQL Server</Label>
              <Select 
                value={selectedVersion} 
                onValueChange={handleVersionChange}
                disabled={!!editingConfig?.id}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccione una versión" />
                </SelectTrigger>
                <SelectContent>
                  {availableVersions.map(v => (
                    <SelectItem key={v} value={v}>SQL Server {v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selectedVersion && (
              <>
                <div className="space-y-2">
                  <Label>Builds Disponibles (CU, SP, GDR, Hotfix)</Label>
                  <Input
                    type="text"
                    placeholder="Buscar por KB, versión o CU..."
                    value={buildSearchTerm}
                    onChange={(e) => setBuildSearchTerm(e.target.value)}
                    className="text-sm"
                  />
                  {loadingBuilds ? (
                    <Skeleton className="h-32 w-full" />
                  ) : availableBuilds.length === 0 ? (
                    <p className="text-sm text-muted-foreground p-2 border rounded-md">
                      No se encontraron builds para esta versión
                    </p>
                  ) : (
                    <div className="max-h-[30vh] overflow-y-auto border rounded-md">
                      {availableBuilds
                        .filter(build => {
                          if (!buildSearchTerm.trim()) return true;
                          const search = buildSearchTerm.toLowerCase().trim();
                          return (
                            build.version?.toLowerCase().includes(search) ||
                            build.kb?.toLowerCase().includes(search) ||
                            build.cu?.toLowerCase().includes(search) ||
                            build.sp?.toLowerCase().includes(search)
                          );
                        })
                        .map((build, idx) => {
                          const buildName = formatBuildName(build);
                          const showKBSeparately = build.kb && (build.sp || build.cu);
                          return (
                            <div
                              key={idx}
                              className={cn(
                                'p-2 cursor-pointer hover:bg-muted flex justify-between items-center text-sm border-b last:border-b-0',
                                editingConfig?.requiredBuild === build.version && 'bg-primary/10 border-primary/30'
                              )}
                              onClick={() => handleBuildSelect(build)}
                            >
                              <div className="flex flex-col">
                                <span className="font-medium">{buildName}</span>
                                {showKBSeparately && (
                                  <span className="text-xs text-muted-foreground">{build.kb}</span>
                                )}
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="font-mono text-muted-foreground text-xs">
                                  {build.version}
                                </span>
                                {editingConfig?.requiredBuild === build.version && (
                                  <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                                )}
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Build Requerido</Label>
                    <Input
                      value={editingConfig?.requiredBuild || ''}
                      readOnly
                      placeholder="Seleccione un build"
                      className="font-mono text-sm bg-muted/50"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>CU/SP/GDR</Label>
                    <Input
                      value={editingConfig?.requiredCU || ''}
                      readOnly
                      placeholder="Auto"
                      className="bg-muted/50"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>KB Reference</Label>
                  <Input
                    value={editingConfig?.requiredKB || ''}
                    readOnly
                    placeholder="Auto"
                    className="bg-muted/50"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Descripción</Label>
                  <Textarea
                    value={editingConfig?.description || ''}
                    onChange={(e) => setEditingConfig(prev => prev ? {...prev, description: e.target.value} : null)}
                    placeholder="Descripción del requisito..."
                    rows={2}
                    className="resize-none"
                  />
                </div>

                {/* Sección de configuración AWS - solo para 2017+ */}
                {isAwsSupportedVersion(selectedVersion) && (
                  <div className="space-y-3 p-3 rounded-md border border-orange-500/30 bg-orange-500/5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Cloud className="h-4 w-4 text-orange-500" />
                        <Label className="text-orange-600 dark:text-orange-400 font-medium">
                          Configuración AWS (opcional)
                        </Label>
                      </div>
                      {editingConfig?.awsRequiredBuild && (
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          onClick={handleClearAwsConfig}
                          className="h-6 text-xs text-muted-foreground hover:text-red-500"
                        >
                          Limpiar
                        </Button>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Los servidores en AWS pueden tener disponibilidad de parches diferente. 
                      Configure aquí el build mínimo para servidores AWS.
                    </p>
                    
                    <div className="space-y-2">
                      <Label className="text-xs">Build para AWS</Label>
                      <Input
                        type="text"
                        placeholder="Buscar por KB, versión o CU..."
                        value={awsBuildSearchTerm}
                        onChange={(e) => setAwsBuildSearchTerm(e.target.value)}
                        className="text-sm"
                      />
                      {loadingBuilds ? (
                        <Skeleton className="h-24 w-full" />
                      ) : availableBuilds.length === 0 ? (
                        <p className="text-xs text-muted-foreground">
                          No hay builds disponibles
                        </p>
                      ) : (
                        <div className="max-h-[20vh] overflow-y-auto border rounded-md">
                          {availableBuilds
                            .filter(build => {
                              if (!awsBuildSearchTerm.trim()) return true;
                              const search = awsBuildSearchTerm.toLowerCase().trim();
                              return (
                                build.version?.toLowerCase().includes(search) ||
                                build.kb?.toLowerCase().includes(search) ||
                                build.cu?.toLowerCase().includes(search) ||
                                build.sp?.toLowerCase().includes(search)
                              );
                            })
                            .map((build, idx) => {
                              const buildName = formatBuildName(build);
                              const showKBSeparately = build.kb && (build.sp || build.cu);
                              return (
                                <div
                                  key={idx}
                                  className={cn(
                                    'p-2 cursor-pointer hover:bg-muted flex justify-between items-center text-xs border-b last:border-b-0',
                                    editingConfig?.awsRequiredBuild === build.version && 'bg-orange-500/10 border-orange-500/30'
                                  )}
                                  onClick={() => handleAwsBuildSelect(build)}
                                >
                                  <div className="flex flex-col">
                                    <span className="font-medium">{buildName}</span>
                                    {showKBSeparately && (
                                      <span className="text-xs text-muted-foreground">{build.kb}</span>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <span className="font-mono text-muted-foreground text-xs">
                                      {build.version}
                                    </span>
                                    {editingConfig?.awsRequiredBuild === build.version && (
                                      <CheckCircle2 className="h-3 w-3 text-orange-500 shrink-0" />
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                        </div>
                      )}
                    </div>

                    {editingConfig?.awsRequiredBuild && (
                      <div className="grid grid-cols-3 gap-2 text-xs">
                        <div>
                          <Label className="text-xs text-muted-foreground">Build AWS</Label>
                          <p className="font-mono">{editingConfig.awsRequiredBuild}</p>
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">CU/SP</Label>
                          <p>{editingConfig.awsRequiredCU || '-'}</p>
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">KB</Label>
                          <p className="font-mono">{editingConfig.awsRequiredKB || '-'}</p>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <div className="flex items-center justify-between p-3 bg-muted/50 rounded-md">
                  <div className="space-y-0.5">
                    <Label>Activo</Label>
                    <p className="text-xs text-muted-foreground">
                      Aplicar esta configuración
                    </p>
                  </div>
                  <Switch
                    checked={editingConfig?.isActive ?? true}
                    onCheckedChange={(checked) => setEditingConfig(prev => prev ? {...prev, isActive: checked} : null)}
                  />
                </div>
              </>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={handleCloseDialog}>
              Cancelar
            </Button>
            <Button 
              onClick={handleSave} 
              disabled={saveMutation.isPending || !editingConfig?.sqlVersion || !editingConfig?.requiredBuild}
            >
              {saveMutation.isPending ? (
                <>
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  Guardando...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4 mr-2" />
                  Guardar
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar configuración?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción eliminará la configuración de compliance para esta versión de SQL Server.
              Los servidores de esta versión ya no tendrán un requisito de compliance definido.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteId && deleteMutation.mutate(deleteId)}
              className="bg-red-500 text-white hover:bg-red-600"
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
