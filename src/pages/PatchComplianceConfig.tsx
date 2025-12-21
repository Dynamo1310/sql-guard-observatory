import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  Settings, Save, Trash2, Plus, RefreshCw, ShieldCheck, 
  AlertTriangle, Info, CheckCircle2 
} from 'lucide-react';
import { patchingApi, PatchComplianceConfigDto, BuildReferenceDto } from '@/services/api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
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
import { useToast } from '@/hooks/use-toast';
import { Skeleton } from '@/components/ui/skeleton';

const SQL_VERSIONS = ['2005', '2008', '2008 R2', '2012', '2014', '2016', '2017', '2019', '2022'];
const CURRENT_YEAR = new Date().getFullYear();
const AVAILABLE_YEARS = [CURRENT_YEAR - 1, CURRENT_YEAR, CURRENT_YEAR + 1, CURRENT_YEAR + 2];

export default function PatchComplianceConfig() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [selectedYear, setSelectedYear] = useState<number>(CURRENT_YEAR);
  const [editingConfig, setEditingConfig] = useState<PatchComplianceConfigDto | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [selectedVersion, setSelectedVersion] = useState<string>('');
  const [availableBuilds, setAvailableBuilds] = useState<BuildReferenceDto[]>([]);
  const [loadingBuilds, setLoadingBuilds] = useState(false);
  const [buildSearchTerm, setBuildSearchTerm] = useState<string>('');

  // Función para cerrar el diálogo y limpiar estados
  const handleCloseDialog = () => {
    setIsDialogOpen(false);
    setEditingConfig(null);
    setBuildSearchTerm('');
    setSelectedVersion('');
    setAvailableBuilds([]);
  };

  // Query para obtener años disponibles
  const { data: complianceYears } = useQuery({
    queryKey: ['complianceYears'],
    queryFn: patchingApi.getComplianceYears,
  });

  // Query para obtener configuraciones del año seleccionado
  const { data: configs, isLoading, refetch } = useQuery({
    queryKey: ['complianceConfigs', selectedYear],
    queryFn: () => patchingApi.getComplianceConfigs(selectedYear),
  });

  // Mutation para guardar
  const saveMutation = useMutation({
    mutationFn: patchingApi.saveComplianceConfig,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['complianceConfigs'] });
      handleCloseDialog();
      toast({
        title: 'Configuración guardada',
        description: 'La configuración de compliance se guardó correctamente',
      });
    },
    onError: (error: Error) => {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.message,
      });
    },
  });

  // Mutation para eliminar
  const deleteMutation = useMutation({
    mutationFn: patchingApi.deleteComplianceConfig,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['complianceConfigs'] });
      setDeleteId(null);
      toast({
        title: 'Configuración eliminada',
        description: 'La configuración se eliminó correctamente',
      });
    },
    onError: (error: Error) => {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.message,
      });
    },
  });

  // Cargar builds disponibles cuando cambia la versión
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

  // Formatear el nombre del build para mostrar
  const formatBuildName = (build: BuildReferenceDto) => {
    // El backend ya envía CU con "-GDR" si corresponde (ej: "CU31-GDR")
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
    setBuildSearchTerm(''); // Limpiar búsqueda al cambiar versión
    if (editingConfig) {
      setEditingConfig({ ...editingConfig, sqlVersion: version });
    }
    loadBuildsForVersion(version);
  };

  const handleBuildSelect = (build: BuildReferenceDto) => {
    if (editingConfig) {
      // El backend ya envía el CU con "-GDR" si corresponde
      const updateType = build.cu || build.sp || '';
      
      setEditingConfig({
        ...editingConfig,
        requiredBuild: build.version,
        requiredCU: updateType,
        requiredKB: build.kb || '',
      });
    }
  };

  const handleSave = () => {
    if (!editingConfig) return;
    
    if (!editingConfig.sqlVersion || !editingConfig.requiredBuild) {
      toast({
        variant: 'destructive',
        title: 'Campos requeridos',
        description: 'Debe seleccionar una versión y un build requerido',
      });
      return;
    }
    
    saveMutation.mutate(editingConfig);
  };

  // Obtener versiones que aún no tienen configuración
  const availableVersions = SQL_VERSIONS.filter(
    v => !configs?.some(c => c.sqlVersion === v) || editingConfig?.sqlVersion === v
  );

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Settings className="h-7 w-7 text-primary" />
            Configuración de Compliance
          </h1>
          <p className="text-muted-foreground mt-1">
            Define el nivel de parche requerido por versión de SQL Server para Banco Supervielle
          </p>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          {/* Selector de año */}
          <Select value={selectedYear.toString()} onValueChange={(v) => setSelectedYear(parseInt(v))}>
            <SelectTrigger className="w-[140px]">
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
          <Button onClick={() => refetch()} variant="outline" className="gap-2">
            <RefreshCw className="w-4 h-4" />
            Actualizar
          </Button>
          <Button onClick={handleNewConfig} className="gap-2">
            <Plus className="w-4 h-4" />
            Nueva Configuración
          </Button>
        </div>
      </div>

      {/* Info Card */}
      <Card className="bg-blue-500/5 border-blue-500/20">
        <CardContent className="pt-6">
          <div className="flex gap-3">
            <Info className="h-5 w-5 text-blue-500 mt-0.5 shrink-0" />
            <div className="text-sm text-muted-foreground">
              <p>
                Configure aquí el <strong>nivel mínimo de parche</strong> requerido para cada versión de SQL Server.
                Los servidores que estén por debajo de este nivel aparecerán como <Badge variant="destructive" className="mx-1">No Compliance</Badge>.
              </p>
              <p className="mt-2">
                Los que cumplan el requisito pero no estén en la última CU disponible aparecerán como <Badge className="bg-emerald-500/20 text-emerald-600 border-emerald-500/30 mx-1">Compliance</Badge>.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Configurations Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {isLoading ? (
          Array(6).fill(0).map((_, i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-6 w-32" />
                <Skeleton className="h-4 w-48" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-20 w-full" />
              </CardContent>
            </Card>
          ))
        ) : (
          <>
            {configs?.map((config) => (
              <Card 
                key={config.id} 
                className={`transition-all hover:shadow-md ${
                  config.isActive 
                    ? 'border-emerald-500/30 bg-emerald-500/5' 
                    : 'border-muted opacity-60'
                }`}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <ShieldCheck className={`h-5 w-5 ${config.isActive ? 'text-emerald-500' : 'text-muted-foreground'}`} />
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
                      className="text-destructive hover:text-destructive"
                      onClick={() => setDeleteId(config.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}

            {/* Empty State for unconfigured versions */}
            {availableVersions.length > 0 && (
              <Card className="border-dashed border-2 hover:border-primary/50 transition-colors cursor-pointer"
                    onClick={handleNewConfig}>
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
          </>
        )}
      </div>

      {/* Edit Dialog - Responsivo */}
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
                  {/* Campo de búsqueda */}
                  <Input
                    type="text"
                    placeholder="Buscar por KB, versión o CU... (ej: KB5046858, 14.0.3485, CU31)"
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
                              className={`p-2 cursor-pointer hover:bg-muted flex justify-between items-center text-sm border-b last:border-b-0 ${
                                editingConfig?.requiredBuild === build.version ? 'bg-primary/10 border-primary/30' : ''
                              }`}
                              onClick={() => handleBuildSelect(build)}
                            >
                              <div className="flex flex-col">
                                <span className="font-medium">
                                  {buildName}
                                </span>
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

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Build Requerido</Label>
                    <Input
                      value={editingConfig?.requiredBuild || ''}
                      readOnly
                      placeholder="Seleccione un build de la lista"
                      className="font-mono text-sm bg-muted/50 cursor-not-allowed"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>CU/SP/GDR</Label>
                    <Input
                      value={editingConfig?.requiredCU || ''}
                      readOnly
                      placeholder="Se completa automáticamente"
                      className="bg-muted/50 cursor-not-allowed"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>KB Reference</Label>
                  <Input
                    value={editingConfig?.requiredKB || ''}
                    readOnly
                    placeholder="Se completa automáticamente"
                    className="bg-muted/50 cursor-not-allowed"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Descripción</Label>
                  <Textarea
                    value={editingConfig?.description || ''}
                    onChange={(e) => setEditingConfig(prev => prev ? {...prev, description: e.target.value} : null)}
                    placeholder="Descripción del requisito de compliance..."
                    rows={2}
                    className="resize-none"
                  />
                </div>

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

          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={handleCloseDialog} className="w-full sm:w-auto">
              Cancelar
            </Button>
            <Button 
              onClick={handleSave} 
              disabled={saveMutation.isPending || !editingConfig?.sqlVersion || !editingConfig?.requiredBuild}
              className="w-full sm:w-auto"
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

      {/* Delete Confirmation - Responsivo */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar configuración?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción eliminará la configuración de compliance para esta versión de SQL Server.
              Los servidores de esta versión ya no tendrán un requisito de compliance definido.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col sm:flex-row gap-2">
            <AlertDialogCancel className="w-full sm:w-auto">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteId && deleteMutation.mutate(deleteId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 w-full sm:w-auto"
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

