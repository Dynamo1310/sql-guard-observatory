import { useState, useEffect, useMemo } from 'react';
import { 
  Key, Plus, Pencil, Trash2, Server, Tag, RefreshCw, 
  Shield, CheckCircle, XCircle, Play, ChevronDown, ChevronUp,
  Globe, Layers, Code, Search, X, Cloud, Check, CheckSquare, Square,
  AlertTriangle, Eye, EyeOff, Copy, Loader2, History, Lock
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { Capabilities } from '@/lib/capabilities';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { PasswordInput } from '@/components/ui/password-input';
import { 
  systemCredentialsApi, 
  vaultApi,
  SystemCredentialDto, 
  CreateSystemCredentialRequest,
  UpdateSystemCredentialRequest,
  AddSystemCredentialAssignmentRequest,
  AssignmentTypeInfo,
  TestConnectionResponse,
  AvailableServerDto,
  copyToClipboardWithAutoClear
} from '@/services/vaultApi';

// Agrupar servidores por ambiente
function groupServersByEnvironment(servers: AvailableServerDto[]) {
  const groups: Record<string, AvailableServerDto[]> = {};
  
  servers.forEach(server => {
    const env = server.environment || 'Sin ambiente';
    if (!groups[env]) {
      groups[env] = [];
    }
    groups[env].push(server);
  });
  
  // Ordenar: Producción primero, luego alfabéticamente
  const sortedKeys = Object.keys(groups).sort((a, b) => {
    if (a.toLowerCase().includes('prod')) return -1;
    if (b.toLowerCase().includes('prod')) return 1;
    return a.localeCompare(b);
  });
  
  return sortedKeys.map(key => ({
    environment: key,
    servers: groups[key].sort((a, b) => a.fullServerName.localeCompare(b.fullServerName))
  }));
}

export default function SystemCredentials() {
  const { hasCapability } = useAuth();
  const canManageCredentials = hasCapability(Capabilities.SystemManageCredentials);
  
  const [credentials, setCredentials] = useState<SystemCredentialDto[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [assignmentTypes, setAssignmentTypes] = useState<AssignmentTypeInfo[]>([]);
  
  // Servidores disponibles para el selector
  const [availableServers, setAvailableServers] = useState<AvailableServerDto[]>([]);
  const [serverSearchTerm, setServerSearchTerm] = useState('');
  const [expandedGroups, setExpandedGroups] = useState<string[]>([]);
  const [selectedServerForAssignment, setSelectedServerForAssignment] = useState<AvailableServerDto | null>(null);

  // Modal states
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showAddAssignmentModal, setShowAddAssignmentModal] = useState(false);
  const [showTestConnectionModal, setShowTestConnectionModal] = useState(false);
  
  // Selected items
  const [selectedCredential, setSelectedCredential] = useState<SystemCredentialDto | null>(null);
  const [expandedCredentials, setExpandedCredentials] = useState<Set<number>>(new Set());
  
  // Form states
  const [formData, setFormData] = useState<CreateSystemCredentialRequest>({
    name: '',
    description: '',
    username: '',
    domain: '',
    password: ''
  });
  const [editFormData, setEditFormData] = useState<UpdateSystemCredentialRequest>({});
  const [assignmentFormData, setAssignmentFormData] = useState<AddSystemCredentialAssignmentRequest>({
    assignmentType: 'Server',
    assignmentValue: '',
    priority: 100
  });
  const [selectedTestServer, setSelectedTestServer] = useState<string>('');
  const [testPort, setTestPort] = useState<string>('1433');
  const [testResult, setTestResult] = useState<TestConnectionResponse | null>(null);
  
  // Estados para copiar/revelar password
  const [revealedPasswords, setRevealedPasswords] = useState<Map<number, string>>(new Map());
  const [revealingCredential, setRevealingCredential] = useState<number | null>(null);
  const [copyingCredential, setCopyingCredential] = useState<number | null>(null);
  
  const [isTesting, setIsTesting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  
  // Estados para el modal de crear
  const [createCredentialType, setCreateCredentialType] = useState<'SqlAuth' | 'WindowsAD'>('SqlAuth');
  const [createSelectedServers, setCreateSelectedServers] = useState<{serverName: string; instanceName?: string}[]>([]);
  const [createServerSearchTerm, setCreateServerSearchTerm] = useState('');
  const [createExpandedGroups, setCreateExpandedGroups] = useState<string[]>([]);
  
  // Estados para el modal de editar
  const [editCredentialType, setEditCredentialType] = useState<'SqlAuth' | 'WindowsAD'>('SqlAuth');

  useEffect(() => {
    loadCredentials();
    loadAssignmentTypes();
    loadAvailableServers();
  }, []);

  // Filtrar servidores por búsqueda
  const filteredServers = useMemo(() => {
    if (!serverSearchTerm) return availableServers;
    
    const term = serverSearchTerm.toLowerCase();
    return availableServers.filter(s => 
      s.serverName.toLowerCase().includes(term) ||
      s.instanceName?.toLowerCase().includes(term) ||
      s.fullServerName.toLowerCase().includes(term) ||
      s.environment?.toLowerCase().includes(term) ||
      s.hostingSite?.toLowerCase().includes(term)
    );
  }, [availableServers, serverSearchTerm]);

  // Agrupar servidores filtrados
  const groupedServers = useMemo(() => 
    groupServersByEnvironment(filteredServers),
    [filteredServers]
  );

  const loadAvailableServers = async () => {
    try {
      const servers = await vaultApi.getAvailableServers();
      setAvailableServers(servers);
      // Expandir el primer grupo por defecto
      const groups = groupServersByEnvironment(servers);
      if (groups.length > 0) {
        setExpandedGroups([groups[0].environment]);
      }
    } catch (error) {
      console.error('Error loading available servers:', error);
    }
  };

  const toggleExpandGroup = (env: string) => {
    setExpandedGroups(prev => 
      prev.includes(env) 
        ? prev.filter(e => e !== env)
        : [...prev, env]
    );
  };

  // Servidores filtrados y agrupados para el modal de crear
  const createFilteredServers = useMemo(() => {
    if (!createServerSearchTerm) return availableServers;
    const term = createServerSearchTerm.toLowerCase();
    return availableServers.filter(s => 
      s.serverName.toLowerCase().includes(term) ||
      s.instanceName?.toLowerCase().includes(term) ||
      s.fullServerName.toLowerCase().includes(term) ||
      s.environment?.toLowerCase().includes(term) ||
      s.hostingSite?.toLowerCase().includes(term)
    );
  }, [availableServers, createServerSearchTerm]);

  const createGroupedServers = useMemo(() => 
    groupServersByEnvironment(createFilteredServers),
    [createFilteredServers]
  );

  const toggleCreateExpandGroup = (env: string) => {
    setCreateExpandedGroups(prev => 
      prev.includes(env) 
        ? prev.filter(e => e !== env)
        : [...prev, env]
    );
  };

  // Inicializar grupos expandidos para crear
  useEffect(() => {
    const groups = groupServersByEnvironment(availableServers);
    if (groups.length > 0 && createExpandedGroups.length === 0) {
      setCreateExpandedGroups([groups[0].environment]);
    }
  }, [availableServers]);

  const loadCredentials = async (showLoading = true) => {
    if (showLoading) setIsLoading(true);
    setIsRefreshing(true);
    try {
      const data = await systemCredentialsApi.getAll();
      setCredentials(data);
    } catch (error) {
      console.error('Error loading credentials:', error);
      toast.error('Error', { description: 'No se pudieron cargar las credenciales de sistema' });
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  const loadAssignmentTypes = async () => {
    try {
      const types = await systemCredentialsApi.getAssignmentTypes();
      setAssignmentTypes(types);
    } catch (error) {
      console.error('Error loading assignment types:', error);
    }
  };

  const handleCreate = async () => {
    if (!formData.name || !formData.username || !formData.password) {
      toast.error('Error', { description: 'Nombre, usuario y contraseña son requeridos' });
      return;
    }

    setIsSaving(true);
    try {
      // Crear la credencial
      const credential = await systemCredentialsApi.create(formData);
      
      // Si se seleccionaron servidores, crear asignaciones
      if (credential && createSelectedServers.length > 0) {
        for (const server of createSelectedServers) {
          const fullServerName = server.instanceName 
            ? `${server.serverName}\\${server.instanceName}` 
            : server.serverName;
          try {
            await systemCredentialsApi.addAssignment(credential.id, {
              assignmentType: 'Server',
              assignmentValue: fullServerName,
              priority: 100
            });
          } catch (e) {
            console.error('Error adding server assignment:', e);
          }
        }
      }
      
      toast.success('Credencial creada', { 
        description: createSelectedServers.length > 0 
          ? `La credencial "${formData.name}" fue creada con ${createSelectedServers.length} servidor(es) asociado(s)` 
          : `La credencial "${formData.name}" fue creada exitosamente`
      });
      setShowCreateModal(false);
      setFormData({ name: '', description: '', username: '', domain: '', password: '' });
      setCreateCredentialType('SqlAuth');
      setCreateSelectedServers([]);
      setCreateServerSearchTerm('');
      loadCredentials(false);
    } catch (error) {
      console.error('Error creating credential:', error);
      toast.error('Error', { description: 'No se pudo crear la credencial' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleEdit = async () => {
    if (!selectedCredential) return;

    setIsSaving(true);
    try {
      await systemCredentialsApi.update(selectedCredential.id, editFormData);
      toast.success('Credencial actualizada', { description: 'Los cambios fueron guardados' });
      setShowEditModal(false);
      setSelectedCredential(null);
      setEditFormData({});
      loadCredentials(false);
    } catch (error) {
      console.error('Error updating credential:', error);
      toast.error('Error', { description: 'No se pudo actualizar la credencial' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedCredential) return;

    try {
      await systemCredentialsApi.delete(selectedCredential.id);
      toast.success('Credencial eliminada', { description: `La credencial "${selectedCredential.name}" fue eliminada` });
      setShowDeleteDialog(false);
      setSelectedCredential(null);
      loadCredentials(false);
    } catch (error) {
      console.error('Error deleting credential:', error);
      toast.error('Error', { description: 'No se pudo eliminar la credencial' });
    }
  };

  const handleAddAssignment = async () => {
    // Validar según el tipo de asignación
    if (assignmentFormData.assignmentType === 'Server') {
      if (!selectedServerForAssignment) {
        toast.error('Error', { description: 'Debes seleccionar un servidor' });
        return;
      }
    } else {
      if (!assignmentFormData.assignmentValue) {
        toast.error('Error', { description: 'El valor de asignación es requerido' });
        return;
      }
    }

    if (!selectedCredential) return;

    setIsSaving(true);
    try {
      // Si es tipo Server, usar el servidor seleccionado
      const assignmentData: AddSystemCredentialAssignmentRequest = {
        ...assignmentFormData,
        assignmentValue: assignmentFormData.assignmentType === 'Server' 
          ? selectedServerForAssignment!.fullServerName 
          : assignmentFormData.assignmentValue
      };

      await systemCredentialsApi.addAssignment(selectedCredential.id, assignmentData);
      toast.success('Asignación agregada', { description: 'La asignación fue agregada exitosamente' });
      setShowAddAssignmentModal(false);
      setAssignmentFormData({ assignmentType: 'Server', assignmentValue: '', priority: 100 });
      setSelectedServerForAssignment(null);
      setServerSearchTerm('');
      loadCredentials(false);
    } catch (error) {
      console.error('Error adding assignment:', error);
      toast.error('Error', { description: 'No se pudo agregar la asignación' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleRemoveAssignment = async (credentialId: number, assignmentId: number) => {
    try {
      await systemCredentialsApi.removeAssignment(credentialId, assignmentId);
      toast.success('Asignación eliminada');
      loadCredentials(false);
    } catch (error) {
      console.error('Error removing assignment:', error);
      toast.error('Error', { description: 'No se pudo eliminar la asignación' });
    }
  };

  const handleTestConnection = async () => {
    if (!selectedCredential || !selectedTestServer) {
      toast.error('Error', { description: 'Selecciona un servidor para probar' });
      return;
    }

    // Parsear servidor e instancia (formato: SERVER o SERVER\INSTANCE)
    const parts = selectedTestServer.split('\\');
    const serverName = parts[0];
    const instanceName = parts.length > 1 ? parts[1] : undefined;

    setIsTesting(true);
    setTestResult(null);
    try {
      const result = await systemCredentialsApi.testConnection(selectedCredential.id, {
        serverName,
        instanceName,
        port: testPort ? parseInt(testPort, 10) : 1433
      });
      setTestResult(result);
      if (result.success) {
        toast.success('Conexión exitosa', { description: result.sqlVersion });
      } else {
        toast.error('Conexión fallida', { description: result.errorMessage });
      }
    } catch (error) {
      console.error('Error testing connection:', error);
      toast.error('Error', { description: 'Error al probar la conexión' });
    } finally {
      setIsTesting(false);
    }
  };

  // Copiar password al portapapeles sin revelar
  const handleCopyPassword = async (credentialId: number) => {
    setCopyingCredential(credentialId);
    try {
      // Primero revelar el password (esto ya queda auditado)
      const result = await systemCredentialsApi.revealPassword(credentialId);
      
      // Copiar al portapapeles
      const copied = await copyToClipboardWithAutoClear(result.password, 15);
      
      if (!copied) {
        toast.error('Error', { description: 'No se pudo copiar al portapapeles' });
        return;
      }
      
      // Registrar la copia
      await systemCredentialsApi.registerPasswordCopy(credentialId);
      
      toast.success('Copiado', { 
        description: 'La contraseña fue copiada al portapapeles.'
      });
    } catch (error) {
      console.error('Error copying password:', error);
      toast.error('Error', { description: 'No se pudo copiar la contraseña' });
    } finally {
      setCopyingCredential(null);
    }
  };

  // Revelar password (mostrar en pantalla)
  const handleRevealPassword = async (credentialId: number) => {
    // Si ya está revelado, ocultarlo
    if (revealedPasswords.has(credentialId)) {
      setRevealedPasswords(prev => {
        const newMap = new Map(prev);
        newMap.delete(credentialId);
        return newMap;
      });
      return;
    }

    setRevealingCredential(credentialId);
    try {
      const result = await systemCredentialsApi.revealPassword(credentialId);
      
      setRevealedPasswords(prev => {
        const newMap = new Map(prev);
        newMap.set(credentialId, result.password);
        return newMap;
      });
      
      toast.info('Contraseña revelada', { 
        description: 'Se ocultará automáticamente en 30 segundos. (Auditoría registrada)'
      });

      // Auto-ocultar después de 30 segundos
      setTimeout(() => {
        setRevealedPasswords(prev => {
          const newMap = new Map(prev);
          newMap.delete(credentialId);
          return newMap;
        });
      }, 30000);
    } catch (error) {
      console.error('Error revealing password:', error);
      toast.error('Error', { description: 'No se pudo revelar la contraseña' });
    } finally {
      setRevealingCredential(null);
    }
  };

  const toggleExpanded = (id: number) => {
    setExpandedCredentials(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  const getAssignmentTypeIcon = (type: string) => {
    switch (type) {
      case 'Server': return <Server className="h-4 w-4" />;
      case 'HostingSite': return <Globe className="h-4 w-4" />;
      case 'Environment': return <Layers className="h-4 w-4" />;
      case 'Pattern': return <Code className="h-4 w-4" />;
      default: return <Tag className="h-4 w-4" />;
    }
  };

  const getAssignmentTypeLabel = (type: string) => {
    const typeInfo = assignmentTypes.find(t => t.type === type);
    return typeInfo?.displayName || type;
  };

  if (isLoading) {
    return (
      <div className="container mx-auto p-6 space-y-6">
        {/* Header skeleton */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="space-y-2">
            <Skeleton className="h-9 w-64" />
            <Skeleton className="h-5 w-96" />
          </div>
          <div className="flex gap-2">
            <Skeleton className="h-10 w-28" />
            <Skeleton className="h-10 w-36" />
          </div>
        </div>

        {/* Info card skeleton */}
        <Card className="border-border/50 bg-muted/20">
          <CardContent className="py-4">
            <Skeleton className="h-12 w-full" />
          </CardContent>
        </Card>

        {/* Credentials list skeleton */}
        <div className="space-y-4">
          {[1, 2, 3].map(i => (
            <Card key={i}>
              <div className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <Skeleton className="h-10 w-10 rounded-lg" />
                  <div className="space-y-2">
                    <Skeleton className="h-5 w-40" />
                    <Skeleton className="h-4 w-64" />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Skeleton className="h-6 w-24" />
                  <Skeleton className="h-8 w-8" />
                  <Skeleton className="h-8 w-8" />
                  <Skeleton className="h-8 w-8" />
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Shield className="h-8 w-8" />
            Credenciales de Sistema
          </h1>
          <p className="text-muted-foreground">
            Administra las credenciales que SQL Nova usa para conectarse a servidores
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => loadCredentials(false)}
            disabled={isRefreshing}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
            Actualizar
          </Button>
          {canManageCredentials ? (
            <Button onClick={() => setShowCreateModal(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Nueva Credencial
            </Button>
          ) : (
            <Badge variant="outline" className="py-2 px-3">
              <Lock className="h-3 w-3 mr-1" />
              Solo lectura
            </Badge>
          )}
        </div>
      </div>

      {/* Info Card */}
      <Card className="border-border/50 bg-muted/20">
        <CardContent className="py-4">
          <p className="text-sm text-muted-foreground">
            <strong>¿Cómo funciona?</strong> Las credenciales de sistema se asignan a servidores por diferentes criterios 
            (servidor específico, hosting site, ambiente o patrón regex). Cuando la aplicación necesita conectarse a un servidor, 
            busca la credencial más específica que coincida. Si no hay coincidencia, usa Windows Authentication.
          </p>
        </CardContent>
      </Card>

      {/* Credentials List */}
      {credentials.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Key className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-semibold mb-2">No hay credenciales de sistema</h3>
            <p className="text-muted-foreground mb-4">
              Crea tu primera credencial para que SQL Nova pueda conectarse a servidores SQL.
            </p>
            {canManageCredentials && (
              <Button onClick={() => setShowCreateModal(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Crear primera credencial
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {credentials.map(credential => (
            <Card key={credential.id} className="overflow-hidden">
              <Collapsible open={expandedCredentials.has(credential.id)}>
                <div className="p-4 flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className={`p-2 rounded-lg ${credential.isActive ? 'bg-success/10' : 'bg-muted'}`}>
                      <Key className={`h-5 w-5 ${credential.isActive ? 'text-success' : 'text-muted-foreground'}`} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold">{credential.name}</h3>
                        <Badge variant={credential.isActive ? 'default' : 'secondary'}>
                          {credential.isActive ? 'Activa' : 'Inactiva'}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        Usuario: <span className="font-mono">{credential.domain ? `${credential.domain}\\` : ''}{credential.username}</span>
                        {credential.description && ` • ${credential.description}`}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="hidden sm:inline-flex">
                      {credential.assignments.length} asignaciones
                    </Badge>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setSelectedCredential(credential);
                        // Resetear estado antes de abrir
                        setSelectedTestServer('');
                        setTestPort('1433');
                        setTestResult(null);
                        setShowTestConnectionModal(true);
                      }}
                    >
                      <Play className="h-4 w-4" />
                    </Button>
                    {canManageCredentials && (
                      <>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setSelectedCredential(credential);
                            setEditFormData({
                              name: credential.name,
                              description: credential.description,
                              username: credential.username,
                              domain: credential.domain,
                              isActive: credential.isActive
                            });
                            // Determinar tipo basado en si hay dominio
                            setEditCredentialType(credential.domain ? 'WindowsAD' : 'SqlAuth');
                            setShowEditModal(true);
                          }}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setSelectedCredential(credential);
                            setShowDeleteDialog(true);
                          }}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </>
                    )}
                    <CollapsibleTrigger asChild>
                      <Button variant="ghost" size="sm" onClick={() => toggleExpanded(credential.id)}>
                        {expandedCredentials.has(credential.id) ? (
                          <ChevronUp className="h-4 w-4" />
                        ) : (
                          <ChevronDown className="h-4 w-4" />
                        )}
                      </Button>
                    </CollapsibleTrigger>
                  </div>
                </div>
                <CollapsibleContent>
                  <div className="border-t px-4 py-4 bg-muted/30">
                    {/* Sección de Contraseña */}
                    <div className="mb-6">
                      <h4 className="font-medium text-sm mb-3">Contraseña</h4>
                      <div className="flex items-center gap-3 p-3 bg-background rounded-lg border">
                        <div className="flex-1">
                          {revealedPasswords.has(credential.id) ? (
                            <code className="font-mono text-sm break-all">
                              {revealedPasswords.get(credential.id)}
                            </code>
                          ) : (
                            <span className="text-muted-foreground text-sm">
                              ••••••••••••••••
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleCopyPassword(credential.id)}
                            disabled={copyingCredential === credential.id}
                            title="Copiar contraseña (queda auditado)"
                          >
                            {copyingCredential === credential.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Copy className="h-4 w-4" />
                            )}
                            <span className="ml-1.5 hidden sm:inline">Copiar</span>
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleRevealPassword(credential.id)}
                            disabled={revealingCredential === credential.id}
                            title={revealedPasswords.has(credential.id) ? "Ocultar contraseña" : "Revelar contraseña (queda auditado)"}
                          >
                            {revealingCredential === credential.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : revealedPasswords.has(credential.id) ? (
                              <EyeOff className="h-4 w-4" />
                            ) : (
                              <Eye className="h-4 w-4" />
                            )}
                            <span className="ml-1.5 hidden sm:inline">
                              {revealedPasswords.has(credential.id) ? 'Ocultar' : 'Revelar'}
                            </span>
                          </Button>
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground mt-2">
                        Las acciones de copiar y revelar quedan registradas en la auditoría del sistema.
                      </p>
                    </div>

                    {/* Sección de Asignaciones */}
                    <div className="flex justify-between items-center mb-3">
                      <h4 className="font-medium text-sm">Asignaciones</h4>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setSelectedCredential(credential);
                          setAssignmentFormData({ assignmentType: 'Server', assignmentValue: '', priority: 100 });
                          setSelectedServerForAssignment(null);
                          setServerSearchTerm('');
                          setShowAddAssignmentModal(true);
                        }}
                      >
                        <Plus className="h-3 w-3 mr-1" />
                        Agregar
                      </Button>
                    </div>
                    {credential.assignments.length === 0 ? (
                      <p className="text-sm text-muted-foreground italic">
                        Sin asignaciones. Esta credencial no se usará automáticamente hasta que agregues asignaciones.
                      </p>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Tipo</TableHead>
                            <TableHead>Valor</TableHead>
                            <TableHead>Prioridad</TableHead>
                            <TableHead className="w-[100px]"></TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {credential.assignments
                            .sort((a, b) => a.priority - b.priority)
                            .map(assignment => (
                            <TableRow key={assignment.id}>
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  {getAssignmentTypeIcon(assignment.assignmentType)}
                                  <span>{getAssignmentTypeLabel(assignment.assignmentType)}</span>
                                </div>
                              </TableCell>
                              <TableCell>
                                <code className="bg-muted px-2 py-1 rounded text-sm">
                                  {assignment.assignmentValue}
                                </code>
                              </TableCell>
                              <TableCell>{assignment.priority}</TableCell>
                              <TableCell>
                                {canManageCredentials && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleRemoveAssignment(credential.id, assignment.id)}
                                  >
                                    <Trash2 className="h-4 w-4 text-destructive" />
                                  </Button>
                                )}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}

                    {/* Info de Auditoría Centralizada */}
                    <div className="mt-6 pt-4 border-t">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <History className="h-4 w-4" />
                          <span>La auditoría de accesos está centralizada en</span>
                        </div>
                        <Button
                          variant="link"
                          size="sm"
                          className="text-primary"
                          onClick={() => window.location.href = '/vault-audit'}
                        >
                          Auditoría del Vault →
                        </Button>
                      </div>
                    </div>
                  </div>
                </CollapsibleContent>
              </Collapsible>
            </Card>
          ))}
        </div>
      )}

      {/* Create Modal */}
      <Dialog open={showCreateModal} onOpenChange={(open) => {
        setShowCreateModal(open);
        if (!open) {
          setCreateCredentialType('SqlAuth');
          setCreateSelectedServers([]);
        }
      }}>
        <DialogContent className="w-[95vw] max-w-4xl max-h-[90vh] overflow-y-auto overflow-x-hidden">
          <DialogHeader>
            <DialogTitle>Nueva Credencial de Sistema</DialogTitle>
            <DialogDescription>
              Crea una credencial que SQL Nova usará para conectarse a servidores. Los campos con * son obligatorios.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            {/* Nombre */}
            <div className="grid gap-2">
              <Label htmlFor="name">Nombre *</Label>
              <Input
                id="name"
                placeholder="Ej: AWS SQL Auth, Producción SA"
                value={formData.name}
                onChange={e => setFormData({ ...formData, name: e.target.value })}
              />
            </div>

            {/* Tipo de credencial */}
            <div className="grid gap-2">
              <Label>Tipo *</Label>
              <Select
                value={createCredentialType}
                onValueChange={(value: 'SqlAuth' | 'WindowsAD') => {
                  setCreateCredentialType(value);
                  if (value === 'SqlAuth') {
                    setFormData({ ...formData, domain: '' });
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona el tipo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="SqlAuth">SQL Server Authentication</SelectItem>
                  <SelectItem value="WindowsAD">Windows / Active Directory</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Dominio (solo para Windows) */}
            {createCredentialType === 'WindowsAD' && (
              <div className="grid gap-2">
                <Label htmlFor="domain">Dominio</Label>
                <Input
                  id="domain"
                  placeholder="Ej: GSCORP"
                  value={formData.domain}
                  onChange={e => setFormData({ ...formData, domain: e.target.value })}
                />
              </div>
            )}

            {/* Usuario */}
            <div className="grid gap-2">
              <Label htmlFor="username">Usuario *</Label>
              <Input
                id="username"
                placeholder={createCredentialType === 'SqlAuth' ? 'Ej: sa' : 'Ej: TB03260'}
                value={formData.username}
                onChange={e => setFormData({ ...formData, username: e.target.value })}
              />
            </div>

            {/* Contraseña */}
            <div className="grid gap-2">
              <Label htmlFor="password">Contraseña *</Label>
              <PasswordInput
                id="password"
                value={formData.password}
                onChange={(value) => setFormData({ ...formData, password: value })}
                placeholder="Ingresa la contraseña"
              />
            </div>

            {/* Descripción */}
            <div className="grid gap-2">
              <Label htmlFor="description">Descripción</Label>
              <Input
                id="description"
                placeholder="Descripción breve (opcional)"
                value={formData.description}
                onChange={e => setFormData({ ...formData, description: e.target.value })}
              />
            </div>

            {/* Info: Credencial de sistema */}
            <div className="flex flex-row items-center gap-3 rounded-lg border p-4 bg-muted/20 border-border/50">
              <Shield className="h-5 w-5 text-muted-foreground flex-shrink-0" />
              <div className="space-y-0.5">
                <p className="text-sm font-medium">Credencial de sistema</p>
                <p className="text-xs text-muted-foreground">
                  Esta credencial será utilizada por SQL Nova para conectarse a servidores SQL.
                  Solo usuarios Admin y SuperAdmin pueden gestionar credenciales de sistema.
                </p>
              </div>
            </div>

            {/* Servidores asociados */}
            <div className="space-y-3">
              <Label>Servidores Asociados (opcional)</Label>
              <p className="text-xs text-muted-foreground -mt-2">
                Selecciona los servidores que usarán esta credencial. Puedes agregar más servidores después.
              </p>
              
              {/* Chips de servidores seleccionados */}
              {createSelectedServers.length > 0 && (
                <div className="flex flex-wrap gap-2 p-2 bg-muted/50 rounded-lg">
                  {createSelectedServers.map((server, index) => (
                    <Badge 
                      key={`${server.serverName}-${server.instanceName}-${index}`}
                      variant="secondary" 
                      className="gap-1 pr-1"
                    >
                      <Server className="h-3 w-3" />
                      {server.instanceName 
                        ? `${server.serverName}\\${server.instanceName}`
                        : server.serverName
                      }
                      <button
                        type="button"
                        onClick={() => setCreateSelectedServers(prev => 
                          prev.filter((_, i) => i !== index)
                        )}
                        className="ml-1 p-0.5 hover:bg-destructive/20 rounded"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                  <span className="text-xs text-muted-foreground self-center ml-1">
                    {createSelectedServers.length} seleccionado{createSelectedServers.length !== 1 ? 's' : ''}
                  </span>
                </div>
              )}

              {/* Barra de búsqueda */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar servidores..."
                  value={createServerSearchTerm}
                  onChange={(e) => setCreateServerSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>

              {/* Lista de servidores agrupados */}
              <ScrollArea className="h-[200px] border rounded-lg">
                <div className="p-2 space-y-1">
                  {createFilteredServers.length === 0 ? (
                    <div className="flex items-center justify-center h-[150px] text-muted-foreground text-sm">
                      {createServerSearchTerm ? 'No se encontraron servidores' : 'No hay servidores disponibles'}
                    </div>
                  ) : (
                    createGroupedServers.map(group => {
                      const isExpanded = createExpandedGroups.includes(group.environment);
                      const selectedInGroup = group.servers.filter(s => 
                        createSelectedServers.some(sel => 
                          sel.serverName === s.serverName && sel.instanceName === s.instanceName
                        )
                      ).length;
                      
                      return (
                        <Collapsible
                          key={group.environment}
                          open={isExpanded}
                          onOpenChange={() => toggleCreateExpandGroup(group.environment)}
                        >
                          <div className="flex items-center gap-2 p-2 hover:bg-muted/50 rounded-lg">
                            <Checkbox
                              checked={selectedInGroup === group.servers.length && group.servers.length > 0}
                              onCheckedChange={(checked) => {
                                if (checked) {
                                  // Agregar todos los del grupo
                                  const newServers = group.servers.filter(s => 
                                    !createSelectedServers.some(sel => 
                                      sel.serverName === s.serverName && sel.instanceName === s.instanceName
                                    )
                                  ).map(s => ({ serverName: s.serverName, instanceName: s.instanceName }));
                                  setCreateSelectedServers(prev => [...prev, ...newServers]);
                                } else {
                                  // Quitar todos los del grupo
                                  setCreateSelectedServers(prev => 
                                    prev.filter(sel => 
                                      !group.servers.some(s => 
                                        s.serverName === sel.serverName && s.instanceName === sel.instanceName
                                      )
                                    )
                                  );
                                }
                              }}
                            />
                            <CollapsibleTrigger asChild>
                              <button
                                type="button"
                                className="flex items-center gap-2 flex-1 text-left"
                              >
                                <ChevronDown 
                                  className={cn(
                                    "h-4 w-4 transition-transform",
                                    isExpanded && "rotate-180"
                                  )}
                                />
                                <span className="font-medium text-sm">{group.environment}</span>
                                <span className="text-xs text-muted-foreground">
                                  ({selectedInGroup}/{group.servers.length})
                                </span>
                              </button>
                            </CollapsibleTrigger>
                          </div>
                          
                          <CollapsibleContent>
                            <div className="ml-6 space-y-0.5">
                              {group.servers.map(server => {
                                const isSelected = createSelectedServers.some(
                                  s => s.serverName === server.serverName && s.instanceName === server.instanceName
                                );
                                return (
                                  <div
                                    key={server.fullServerName}
                                    className={cn(
                                      "flex items-center gap-2 p-2 rounded-lg cursor-pointer hover:bg-muted/50 transition-colors",
                                      isSelected && "bg-primary/5"
                                    )}
                                    onClick={() => {
                                      if (isSelected) {
                                        setCreateSelectedServers(prev => 
                                          prev.filter(s => 
                                            !(s.serverName === server.serverName && s.instanceName === server.instanceName)
                                          )
                                        );
                                      } else {
                                        setCreateSelectedServers(prev => [
                                          ...prev,
                                          { serverName: server.serverName, instanceName: server.instanceName }
                                        ]);
                                      }
                                    }}
                                    title={server.fullServerName}
                                  >
                                    <Checkbox checked={isSelected} className="flex-shrink-0" />
                                    <Server className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                                    <div className="flex-1 min-w-0 overflow-hidden">
                                      <p className="text-sm font-medium truncate" title={server.fullServerName}>{server.fullServerName}</p>
                                      {server.hostingSite && (
                                        <p className="text-xs text-muted-foreground truncate">{server.hostingSite}</p>
                                      )}
                                    </div>
                                    <div className="flex items-center gap-1 flex-shrink-0">
                                      {server.isAws && <Cloud className="h-3.5 w-3.5 text-muted-foreground" title="AWS" />}
                                      {server.isDmz && <Shield className="h-3.5 w-3.5 text-destructive" title="DMZ" />}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </CollapsibleContent>
                        </Collapsible>
                      );
                    })
                  )}
                </div>
              </ScrollArea>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateModal(false)}>
              Cancelar
            </Button>
            <Button onClick={handleCreate} disabled={isSaving}>
              {isSaving ? 'Creando...' : 'Crear Credencial'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Modal */}
      <Dialog open={showEditModal} onOpenChange={setShowEditModal}>
        <DialogContent className="w-[95vw] max-w-2xl max-h-[90vh] overflow-y-auto overflow-x-hidden">
          <DialogHeader>
            <DialogTitle>Editar Credencial</DialogTitle>
            <DialogDescription>
              Modifica los datos de la credencial. Deja el campo de contraseña vacío para mantener la actual.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            {/* Nombre */}
            <div className="grid gap-2">
              <Label htmlFor="edit-name">Nombre *</Label>
              <Input
                id="edit-name"
                placeholder="Ej: AWS SQL Auth, Producción SA"
                value={editFormData.name || ''}
                onChange={e => setEditFormData({ ...editFormData, name: e.target.value })}
              />
            </div>

            {/* Tipo de credencial */}
            <div className="grid gap-2">
              <Label>Tipo *</Label>
              <Select
                value={editCredentialType}
                onValueChange={(value: 'SqlAuth' | 'WindowsAD') => {
                  setEditCredentialType(value);
                  if (value === 'SqlAuth') {
                    setEditFormData({ ...editFormData, domain: '' });
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona el tipo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="SqlAuth">SQL Server Authentication</SelectItem>
                  <SelectItem value="WindowsAD">Windows / Active Directory</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Dominio (solo para Windows) */}
            {editCredentialType === 'WindowsAD' && (
              <div className="grid gap-2">
                <Label htmlFor="edit-domain">Dominio</Label>
                <Input
                  id="edit-domain"
                  placeholder="Ej: GSCORP"
                  value={editFormData.domain || ''}
                  onChange={e => setEditFormData({ ...editFormData, domain: e.target.value })}
                />
              </div>
            )}

            {/* Usuario */}
            <div className="grid gap-2">
              <Label htmlFor="edit-username">Usuario *</Label>
              <Input
                id="edit-username"
                placeholder={editCredentialType === 'SqlAuth' ? 'Ej: sa' : 'Ej: TB03260'}
                value={editFormData.username || ''}
                onChange={e => setEditFormData({ ...editFormData, username: e.target.value })}
              />
            </div>

            {/* Nueva Contraseña */}
            <div className="grid gap-2">
              <Label htmlFor="edit-password">Nueva Contraseña</Label>
              <PasswordInput
                id="edit-password"
                value={editFormData.password || ''}
                onChange={(value) => setEditFormData({ ...editFormData, password: value || undefined })}
                placeholder="Dejar vacío para mantener la actual"
                showStrengthIndicator={!!editFormData.password}
              />
            </div>

            {/* Descripción */}
            <div className="grid gap-2">
              <Label htmlFor="edit-description">Descripción</Label>
              <Input
                id="edit-description"
                placeholder="Descripción breve (opcional)"
                value={editFormData.description || ''}
                onChange={e => setEditFormData({ ...editFormData, description: e.target.value })}
              />
            </div>

            {/* Estado activo */}
            <div className="flex flex-row items-center justify-between rounded-lg border p-4">
              <div className="space-y-0.5">
                <Label htmlFor="edit-active" className="cursor-pointer">Credencial activa</Label>
                <p className="text-xs text-muted-foreground">
                  Las credenciales inactivas no se usarán para conectarse a servidores.
                </p>
              </div>
              <Switch
                id="edit-active"
                checked={editFormData.isActive ?? true}
                onCheckedChange={checked => setEditFormData({ ...editFormData, isActive: checked })}
              />
            </div>

            {/* Info: Credencial de sistema */}
            <div className="flex flex-row items-center gap-3 rounded-lg border p-4 bg-muted/20 border-border/50">
              <Shield className="h-5 w-5 text-muted-foreground flex-shrink-0" />
              <div className="space-y-0.5">
                <p className="text-sm font-medium">Credencial de sistema</p>
                <p className="text-xs text-muted-foreground">
                  Las asignaciones de servidores se gestionan desde la lista principal.
                </p>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditModal(false)}>
              Cancelar
            </Button>
            <Button onClick={handleEdit} disabled={isSaving}>
              {isSaving ? 'Guardando...' : 'Guardar Cambios'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar credencial?</AlertDialogTitle>
            <AlertDialogDescription>
              ¿Estás seguro de que deseas eliminar la credencial "{selectedCredential?.name}"? 
              Esta acción no se puede deshacer y la aplicación dejará de usar esta credencial para conectarse a servidores.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Add Assignment Modal */}
      <Dialog open={showAddAssignmentModal} onOpenChange={(open) => {
        setShowAddAssignmentModal(open);
        if (!open) {
          setSelectedServerForAssignment(null);
          setServerSearchTerm('');
        }
      }}>
        <DialogContent className="w-[95vw] max-w-3xl max-h-[90vh] overflow-y-auto overflow-x-hidden">
          <DialogHeader>
            <DialogTitle>Agregar Asignación</DialogTitle>
            <DialogDescription>
              Define cuándo se usará esta credencial para conectarse a servidores.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>Tipo de Asignación</Label>
              <Select
                value={assignmentFormData.assignmentType}
                onValueChange={value => {
                  setAssignmentFormData({ ...assignmentFormData, assignmentType: value, assignmentValue: '' });
                  setSelectedServerForAssignment(null);
                  setServerSearchTerm('');
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {assignmentTypes.map(type => (
                    <SelectItem key={type.type} value={type.type}>
                      <div className="flex items-center gap-2">
                        {getAssignmentTypeIcon(type.type)}
                        <span>{type.displayName}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {assignmentTypes.find(t => t.type === assignmentFormData.assignmentType)?.description}
              </p>
            </div>

            {/* Selector de servidor (solo cuando el tipo es "Server") */}
            {assignmentFormData.assignmentType === 'Server' ? (
              <div className="grid gap-2">
                <Label>Seleccionar Servidor</Label>
                
                {/* Servidor seleccionado */}
                {selectedServerForAssignment && (
                  <div className="flex items-center gap-2 p-3 bg-primary/10 border border-primary/20 rounded-lg">
                    <Server className="h-4 w-4 text-primary" />
                    <div className="flex-1">
                      <p className="font-medium text-sm">{selectedServerForAssignment.fullServerName}</p>
                      <p className="text-xs text-muted-foreground">
                        {selectedServerForAssignment.environment} • {selectedServerForAssignment.hostingSite}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setSelectedServerForAssignment(null)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                )}

                {/* Barra de búsqueda */}
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar servidores..."
                    value={serverSearchTerm}
                    onChange={(e) => setServerSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>

                {/* Lista de servidores agrupados */}
                <ScrollArea className="h-[280px] border rounded-lg">
                  <div className="p-2 space-y-1">
                    {groupedServers.length === 0 ? (
                      <div className="flex items-center justify-center h-[200px] text-muted-foreground">
                        {serverSearchTerm ? 'No se encontraron servidores' : 'No hay servidores disponibles'}
                      </div>
                    ) : (
                      groupedServers.map(group => {
                        const isExpanded = expandedGroups.includes(group.environment);
                        
                        return (
                          <Collapsible
                            key={group.environment}
                            open={isExpanded}
                            onOpenChange={() => toggleExpandGroup(group.environment)}
                          >
                            <div className="flex items-center gap-2 p-2 hover:bg-muted/50 rounded-lg">
                              <CollapsibleTrigger asChild>
                                <button
                                  type="button"
                                  className="flex items-center gap-2 flex-1 text-left"
                                >
                                  <ChevronDown 
                                    className={cn(
                                      "h-4 w-4 transition-transform",
                                      isExpanded && "rotate-180"
                                    )}
                                  />
                                  <span className="font-medium text-sm">{group.environment}</span>
                                  <span className="text-xs text-muted-foreground">
                                    ({group.servers.length} servidores)
                                  </span>
                                </button>
                              </CollapsibleTrigger>
                            </div>
                            
                            <CollapsibleContent>
                              <div className="ml-6 space-y-0.5">
                                {group.servers.map(server => {
                                  const isSelectedServer = selectedServerForAssignment?.fullServerName === server.fullServerName;
                                  // Verificar si ya está asignado
                                  const isAlreadyAssigned = selectedCredential?.assignments.some(
                                    a => a.assignmentType === 'Server' && a.assignmentValue === server.fullServerName
                                  );
                                  
                                  return (
                                    <div
                                      key={server.fullServerName}
                                      className={cn(
                                        "flex items-center gap-2 p-2 rounded-lg transition-colors",
                                        isAlreadyAssigned 
                                          ? "opacity-50 cursor-not-allowed" 
                                          : "cursor-pointer hover:bg-muted/50",
                                        isSelectedServer && "bg-primary/10 border border-primary/20"
                                      )}
                                      onClick={() => {
                                        if (!isAlreadyAssigned) {
                                          setSelectedServerForAssignment(server);
                                        }
                                      }}
                                      title={server.fullServerName}
                                    >
                                      <div className={cn(
                                        "w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0",
                                        isSelectedServer ? "border-primary bg-primary" : "border-muted-foreground/30"
                                      )}>
                                        {isSelectedServer && <Check className="h-3 w-3 text-primary-foreground" />}
                                      </div>
                                      <Server className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                                      <div className="flex-1 min-w-0 overflow-hidden">
                                        <p className="text-sm font-medium truncate" title={server.fullServerName}>
                                          {server.fullServerName}
                                          {isAlreadyAssigned && (
                                            <span className="ml-2 text-xs text-warning">(ya asignado)</span>
                                          )}
                                        </p>
                                        {server.hostingSite && (
                                          <p className="text-xs text-muted-foreground truncate">
                                            {server.hostingSite}
                                          </p>
                                        )}
                                      </div>
                                      <div className="flex items-center gap-1 flex-shrink-0">
                                        {server.isAws && (
                                          <Cloud className="h-3.5 w-3.5 text-muted-foreground" title="AWS" />
                                        )}
                                        {server.isDmz && (
                                          <Shield className="h-3.5 w-3.5 text-destructive" title="DMZ" />
                                        )}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </CollapsibleContent>
                          </Collapsible>
                        );
                      })
                    )}
                  </div>
                </ScrollArea>
              </div>
            ) : (
              /* Campo de texto para otros tipos de asignación */
              <div className="grid gap-2">
                <Label htmlFor="assignment-value">Valor *</Label>
                <Input
                  id="assignment-value"
                  placeholder={
                    assignmentFormData.assignmentType === 'HostingSite' ? 'AWS, OnPremise, DMZ' :
                    assignmentFormData.assignmentType === 'Environment' ? 'Produccion, Testing' :
                    '.*AWS.*'
                  }
                  value={assignmentFormData.assignmentValue}
                  onChange={e => setAssignmentFormData({ ...assignmentFormData, assignmentValue: e.target.value })}
                />
              </div>
            )}

            <div className="grid gap-2">
              <Label htmlFor="assignment-priority">Prioridad (menor = mayor prioridad)</Label>
              <Input
                id="assignment-priority"
                type="number"
                min={1}
                max={1000}
                value={assignmentFormData.priority}
                onChange={e => setAssignmentFormData({ ...assignmentFormData, priority: parseInt(e.target.value) || 100 })}
              />
              <p className="text-xs text-muted-foreground">
                Cuando múltiples asignaciones coincidan, se usará la de menor prioridad.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddAssignmentModal(false)}>
              Cancelar
            </Button>
            <Button 
              onClick={handleAddAssignment} 
              disabled={isSaving || (assignmentFormData.assignmentType === 'Server' && !selectedServerForAssignment)}
            >
              {isSaving ? 'Agregando...' : 'Agregar Asignación'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Test Connection Modal */}
      <Dialog open={showTestConnectionModal} onOpenChange={(open) => {
        setShowTestConnectionModal(open);
        if (!open) {
          // Limpiar estado al cerrar
          setSelectedTestServer('');
          setTestPort('1433');
          setTestResult(null);
        }
      }}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Probar Conexión</DialogTitle>
            <DialogDescription>
              Prueba la conexión a un servidor vinculado usando la credencial "{selectedCredential?.name}".
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            {/* Lista de servidores vinculados */}
            {(() => {
              const serverAssignments = selectedCredential?.assignments.filter(
                a => a.assignmentType === 'Server'
              ) || [];
              
              if (serverAssignments.length === 0) {
                return (
                  <div className="p-4 rounded-lg bg-warning/10 border border-warning/30">
                    <div className="flex items-center gap-2 text-warning">
                      <AlertTriangle className="h-5 w-5" />
                      <span className="font-medium">Sin servidores vinculados</span>
                    </div>
                    <p className="text-sm text-muted-foreground mt-2">
                      Esta credencial no tiene servidores asignados. Agrega una asignación de tipo "Server" primero.
                    </p>
                  </div>
                );
              }
              
              return (
                <div className="grid gap-2">
                  <Label>Servidor a probar *</Label>
                  <Select value={selectedTestServer} onValueChange={setSelectedTestServer}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecciona un servidor..." />
                    </SelectTrigger>
                    <SelectContent>
                      {serverAssignments.map(assignment => (
                        <SelectItem key={assignment.id} value={assignment.assignmentValue}>
                          <div className="flex items-center gap-2">
                            <Server className="h-4 w-4 text-muted-foreground" />
                            {assignment.assignmentValue}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              );
            })()}
            
            {/* Puerto TCP */}
            <div className="grid gap-2">
              <Label htmlFor="test-port">Puerto TCP</Label>
              <Input
                id="test-port"
                type="number"
                placeholder="1433"
                value={testPort}
                onChange={e => setTestPort(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Por defecto 1433. Cambiar si el servidor usa otro puerto.
              </p>
            </div>
            
            {/* Resultado de la prueba */}
            {testResult && (
              <div className={`p-4 rounded-lg ${testResult.success ? 'bg-success/10 border border-success/30' : 'bg-destructive/10 border border-destructive/30'}`}>
                <div className="flex items-center gap-2 mb-2">
                  {testResult.success ? (
                    <CheckCircle className="h-5 w-5 text-success" />
                  ) : (
                    <XCircle className="h-5 w-5 text-destructive" />
                  )}
                  <span className="font-medium">
                    {testResult.success ? 'Conexión exitosa' : 'Conexión fallida'}
                  </span>
                </div>
                {testResult.success ? (
                  <p className="text-sm text-muted-foreground">{testResult.sqlVersion}</p>
                ) : (
                  <p className="text-sm text-destructive break-words">{testResult.errorMessage}</p>
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowTestConnectionModal(false)}>
              Cerrar
            </Button>
            <Button 
              onClick={handleTestConnection} 
              disabled={isTesting || !selectedTestServer}
            >
              {isTesting ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Probando...
                </>
              ) : (
                <>
                  <Play className="h-4 w-4 mr-2" />
                  Probar Conexión
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

