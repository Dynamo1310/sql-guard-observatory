import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Navigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Shield, 
  Play, 
  CheckCircle2, 
  XCircle, 
  AlertTriangle, 
  RefreshCw,
  Database,
  Key,
  Clock,
  ArrowRight,
  Loader2,
  RotateCcw,
  ShieldCheck,
  ShieldAlert
} from 'lucide-react';
import { toast } from 'sonner';
import { vaultApi, BackfillStatus, BackfillResult, ValidationResult, CleanupReadinessResult } from '@/services/vaultApi';

export default function VaultMigration() {
  const { isSuperAdmin } = useAuth();
  
  // Si no es SuperAdmin, redirigir
  if (!isSuperAdmin) {
    return <Navigate to="/unauthorized" replace />;
  }

  const [status, setStatus] = useState<BackfillStatus | null>(null);
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [cleanupReadiness, setCleanupReadiness] = useState<CleanupReadinessResult | null>(null);
  const [lastBackfillResult, setLastBackfillResult] = useState<BackfillResult | null>(null);
  
  const [loading, setLoading] = useState(true);
  const [backfillRunning, setBackfillRunning] = useState(false);
  const [validating, setValidating] = useState(false);
  const [checkingCleanup, setCheckingCleanup] = useState(false);

  useEffect(() => {
    loadStatus();
  }, []);

  const loadStatus = async () => {
    setLoading(true);
    try {
      const statusData = await vaultApi.getMigrationStatus();
      setStatus(statusData);
    } catch (error) {
      console.error('Error loading migration status:', error);
      toast.error('Error al cargar el estado de migración');
    } finally {
      setLoading(false);
    }
  };

  const handleBackfill = async () => {
    setBackfillRunning(true);
    try {
      const result = await vaultApi.executeBackfill(100);
      setLastBackfillResult(result);
      
      if (result.failed > 0) {
        toast.warning(`Backfill completado con ${result.failed} errores`);
      } else {
        toast.success(`Backfill completado: ${result.successful} credenciales migradas`);
      }
      
      // Recargar estado
      await loadStatus();
    } catch (error) {
      console.error('Error executing backfill:', error);
      toast.error('Error al ejecutar el backfill');
    } finally {
      setBackfillRunning(false);
    }
  };

  const handleValidate = async () => {
    setValidating(true);
    try {
      const result = await vaultApi.validateMigration();
      setValidation(result);
      
      if (result.allValid) {
        toast.success('Todas las credenciales fueron validadas correctamente');
      } else {
        toast.warning(`${result.invalidCount} credenciales tienen problemas`);
      }
    } catch (error) {
      console.error('Error validating migration:', error);
      toast.error('Error al validar la migración');
    } finally {
      setValidating(false);
    }
  };

  const handleCheckCleanup = async () => {
    setCheckingCleanup(true);
    try {
      const result = await vaultApi.canProceedWithCleanup();
      setCleanupReadiness(result);
      
      if (result.canProceed) {
        toast.success('✅ Puede proceder con Phase 8 (Cleanup)');
      } else {
        toast.warning('⚠️ Aún no puede proceder con el cleanup');
      }
    } catch (error) {
      console.error('Error checking cleanup readiness:', error);
      toast.error('Error al verificar readiness');
    } finally {
      setCheckingCleanup(false);
    }
  };

  const handleRevertCredential = async (credentialId: number) => {
    if (!confirm(`¿Revertir credencial #${credentialId} al formato legacy?`)) return;
    
    try {
      await vaultApi.revertCredential(credentialId);
      toast.success('Credencial revertida al formato legacy');
      await loadStatus();
      if (validation) {
        await handleValidate();
      }
    } catch (error) {
      console.error('Error reverting credential:', error);
      toast.error('Error al revertir la credencial');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-3">
            <Shield className="h-8 w-8 text-purple-500" />
            Vault Enterprise Migration
          </h1>
          <p className="text-muted-foreground mt-1">
            Panel de administración para migración a formato enterprise (v2.1)
          </p>
        </div>
        <Button variant="outline" onClick={loadStatus} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Actualizar
        </Button>
      </div>

      {/* Status Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Credenciales
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <Database className="h-5 w-5 text-blue-500" />
              <span className="text-2xl font-bold">{status?.totalCredentials ?? 0}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Migradas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-500" />
              <span className="text-2xl font-bold text-green-600">
                {status?.migratedCredentials ?? 0}
              </span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Pendientes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-amber-500" />
              <span className="text-2xl font-bold text-amber-600">
                {status?.pendingCredentials ?? 0}
              </span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Progreso
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-2xl font-bold">{status?.percentComplete ?? 0}%</span>
              </div>
              <Progress value={status?.percentComplete ?? 0} className="h-2" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content Tabs */}
      <Tabs defaultValue="backfill" className="space-y-4">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="backfill" className="flex items-center gap-2">
            <Play className="h-4 w-4" />
            Backfill
          </TabsTrigger>
          <TabsTrigger value="validation" className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4" />
            Validación
          </TabsTrigger>
          <TabsTrigger value="cleanup" className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4" />
            Cleanup Gate
          </TabsTrigger>
          <TabsTrigger value="guide" className="flex items-center gap-2">
            <Key className="h-4 w-4" />
            Guía
          </TabsTrigger>
        </TabsList>

        {/* Backfill Tab */}
        <TabsContent value="backfill" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Play className="h-5 w-5" />
                Ejecutar Backfill
              </CardTitle>
              <CardDescription>
                Migra las credenciales del formato Base64 (legacy) al formato VARBINARY (enterprise).
                El proceso es idempotente y puede ejecutarse múltiples veces.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {status?.pendingCredentials === 0 ? (
                <Alert>
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                  <AlertTitle>Backfill Completo</AlertTitle>
                  <AlertDescription>
                    Todas las credenciales han sido migradas al formato enterprise.
                  </AlertDescription>
                </Alert>
              ) : (
                <Alert variant="default">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>Credenciales Pendientes</AlertTitle>
                  <AlertDescription>
                    Hay {status?.pendingCredentials} credenciales pendientes de migrar.
                    Ejecute el backfill para migrarlas al formato enterprise.
                  </AlertDescription>
                </Alert>
              )}

              <div className="flex gap-4">
                <Button 
                  onClick={handleBackfill} 
                  disabled={backfillRunning || status?.pendingCredentials === 0}
                  className="flex items-center gap-2"
                >
                  {backfillRunning ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Play className="h-4 w-4" />
                  )}
                  {backfillRunning ? 'Ejecutando...' : 'Ejecutar Backfill'}
                </Button>
              </div>

              {/* Último resultado */}
              {lastBackfillResult && (
                <div className="mt-6 space-y-4">
                  <h4 className="font-semibold">Último Resultado</h4>
                  <div className="grid grid-cols-4 gap-4 text-sm">
                    <div className="p-3 bg-muted rounded-lg">
                      <div className="text-muted-foreground">Procesadas</div>
                      <div className="text-xl font-bold">{lastBackfillResult.totalProcessed}</div>
                    </div>
                    <div className="p-3 bg-green-500/10 rounded-lg">
                      <div className="text-green-600">Exitosas</div>
                      <div className="text-xl font-bold text-green-600">{lastBackfillResult.successful}</div>
                    </div>
                    <div className="p-3 bg-red-500/10 rounded-lg">
                      <div className="text-red-600">Fallidas</div>
                      <div className="text-xl font-bold text-red-600">{lastBackfillResult.failed}</div>
                    </div>
                    <div className="p-3 bg-muted rounded-lg">
                      <div className="text-muted-foreground">Duración</div>
                      <div className="text-xl font-bold">{lastBackfillResult.duration}</div>
                    </div>
                  </div>

                  {lastBackfillResult.errors.length > 0 && (
                    <div className="mt-4">
                      <h5 className="font-medium text-red-600 mb-2">Errores</h5>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>ID</TableHead>
                            <TableHead>Credencial</TableHead>
                            <TableHead>Error</TableHead>
                            <TableHead>Fecha</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {lastBackfillResult.errors.map((error, idx) => (
                            <TableRow key={idx}>
                              <TableCell>{error.credentialId}</TableCell>
                              <TableCell>{error.credentialName}</TableCell>
                              <TableCell className="text-red-600">{error.errorMessage}</TableCell>
                              <TableCell>{new Date(error.occurredAt).toLocaleString()}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Validation Tab */}
        <TabsContent value="validation" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5" />
                Validar Migración
              </CardTitle>
              <CardDescription>
                Verifica que todas las credenciales migradas pueden ser descifradas correctamente.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Button 
                onClick={handleValidate} 
                disabled={validating}
                variant="outline"
                className="flex items-center gap-2"
              >
                {validating ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-4 w-4" />
                )}
                {validating ? 'Validando...' : 'Ejecutar Validación'}
              </Button>

              {validation && (
                <div className="mt-6 space-y-4">
                  <div className="grid grid-cols-3 gap-4">
                    <div className="p-4 bg-muted rounded-lg text-center">
                      <div className="text-2xl font-bold">{validation.totalValidated}</div>
                      <div className="text-sm text-muted-foreground">Total Validadas</div>
                    </div>
                    <div className="p-4 bg-green-500/10 rounded-lg text-center">
                      <div className="text-2xl font-bold text-green-600">{validation.validCount}</div>
                      <div className="text-sm text-green-600">Válidas</div>
                    </div>
                    <div className="p-4 bg-red-500/10 rounded-lg text-center">
                      <div className="text-2xl font-bold text-red-600">{validation.invalidCount}</div>
                      <div className="text-sm text-red-600">Con Problemas</div>
                    </div>
                  </div>

                  {validation.allValid ? (
                    <Alert>
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                      <AlertTitle className="text-green-600">Validación Exitosa</AlertTitle>
                      <AlertDescription>
                        Todas las credenciales pueden ser descifradas correctamente.
                      </AlertDescription>
                    </Alert>
                  ) : (
                    <>
                      <Alert variant="destructive">
                        <XCircle className="h-4 w-4" />
                        <AlertTitle>Problemas Detectados</AlertTitle>
                        <AlertDescription>
                          {validation.invalidCount} credenciales no pueden ser descifradas.
                        </AlertDescription>
                      </Alert>

                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>ID</TableHead>
                            <TableHead>Credencial</TableHead>
                            <TableHead>Error</TableHead>
                            <TableHead>Legacy</TableHead>
                            <TableHead>Enterprise</TableHead>
                            <TableHead>Acciones</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {validation.errors.map((error, idx) => (
                            <TableRow key={idx}>
                              <TableCell>{error.credentialId}</TableCell>
                              <TableCell>{error.credentialName}</TableCell>
                              <TableCell className="text-red-600 max-w-xs truncate">
                                {error.validationError_}
                              </TableCell>
                              <TableCell>
                                {error.canDecryptLegacy ? (
                                  <Badge variant="outline" className="text-green-600">OK</Badge>
                                ) : (
                                  <Badge variant="destructive">FAIL</Badge>
                                )}
                              </TableCell>
                              <TableCell>
                                {error.canDecryptEnterprise ? (
                                  <Badge variant="outline" className="text-green-600">OK</Badge>
                                ) : (
                                  <Badge variant="destructive">FAIL</Badge>
                                )}
                              </TableCell>
                              <TableCell>
                                {error.canDecryptLegacy && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => handleRevertCredential(error.credentialId)}
                                  >
                                    <RotateCcw className="h-3 w-3 mr-1" />
                                    Revertir
                                  </Button>
                                )}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Cleanup Gate Tab */}
        <TabsContent value="cleanup" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5" />
                Verificar Readiness para Phase 8 (Cleanup)
              </CardTitle>
              <CardDescription>
                Verifica si se cumplen todos los requisitos para proceder con la eliminación de columnas legacy.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Button 
                onClick={handleCheckCleanup} 
                disabled={checkingCleanup}
                className="flex items-center gap-2"
              >
                {checkingCleanup ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ShieldCheck className="h-4 w-4" />
                )}
                {checkingCleanup ? 'Verificando...' : 'Verificar Cleanup Readiness'}
              </Button>

              {cleanupReadiness && (
                <div className="mt-6 space-y-4">
                  {cleanupReadiness.canProceed ? (
                    <Alert className="border-green-500 bg-green-500/10">
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                      <AlertTitle className="text-green-600">✅ PUEDE PROCEDER CON PHASE 8</AlertTitle>
                      <AlertDescription className="text-green-600">
                        Todos los requisitos se cumplen. Es seguro ejecutar el script de cleanup.
                      </AlertDescription>
                    </Alert>
                  ) : (
                    <>
                      <Alert variant="destructive">
                        <ShieldAlert className="h-4 w-4" />
                        <AlertTitle>❌ NO PUEDE PROCEDER CON PHASE 8</AlertTitle>
                        <AlertDescription>
                          Debe resolver los siguientes problemas antes de continuar:
                        </AlertDescription>
                      </Alert>

                      <div className="bg-red-500/10 rounded-lg p-4 space-y-2">
                        <h4 className="font-semibold text-red-600">Blockers:</h4>
                        <ul className="list-disc list-inside space-y-1">
                          {cleanupReadiness.blockers.map((blocker, idx) => (
                            <li key={idx} className="text-red-600">{blocker}</li>
                          ))}
                        </ul>
                      </div>
                    </>
                  )}

                  {/* Detalles */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-4 border rounded-lg">
                      <h4 className="font-semibold mb-2">Estado de Migración</h4>
                      <div className="space-y-1 text-sm">
                        <div className="flex justify-between">
                          <span>Total:</span>
                          <span>{cleanupReadiness.migrationStatus.totalCredentials}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Migradas:</span>
                          <span className="text-green-600">{cleanupReadiness.migrationStatus.migratedCredentials}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Pendientes:</span>
                          <span className={cleanupReadiness.migrationStatus.pendingCredentials > 0 ? 'text-red-600' : 'text-green-600'}>
                            {cleanupReadiness.migrationStatus.pendingCredentials}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="p-4 border rounded-lg">
                      <h4 className="font-semibold mb-2">Estado de Validación</h4>
                      <div className="space-y-1 text-sm">
                        <div className="flex justify-between">
                          <span>Validadas:</span>
                          <span>{cleanupReadiness.validationResult.totalValidated}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Válidas:</span>
                          <span className="text-green-600">{cleanupReadiness.validationResult.validCount}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Inválidas:</span>
                          <span className={cleanupReadiness.validationResult.invalidCount > 0 ? 'text-red-600' : 'text-green-600'}>
                            {cleanupReadiness.validationResult.invalidCount}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Guide Tab */}
        <TabsContent value="guide" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Key className="h-5 w-5" />
                Guía de Migración Enterprise
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Pasos */}
              <div className="space-y-4">
                <div className="flex items-start gap-4 p-4 border rounded-lg">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-500 text-white font-bold">1</div>
                  <div>
                    <h4 className="font-semibold">Ejecutar Scripts SQL Previos</h4>
                    <p className="text-sm text-muted-foreground mt-1">
                      Ejecutar en orden: Phase0_Prerequisites.sql, Phase1_EncryptionKeys.sql, 
                      Phase1_InitialKey.sql, Phase1_ForeignKeys.sql, Phase3_Permissions.sql, 
                      Phase4_AuditAccessLog.sql, Phase7_Indexes.sql
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-4 p-4 border rounded-lg">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-500 text-white font-bold">2</div>
                  <div>
                    <h4 className="font-semibold">Verificar Llave Inicial</h4>
                    <p className="text-sm text-muted-foreground mt-1">
                      Asegurarse de que existe una llave activa para 'CredentialPassword' en VaultEncryptionKeys.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-4 p-4 border rounded-lg bg-amber-500/10">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-500 text-white font-bold">3</div>
                  <div>
                    <h4 className="font-semibold">Ejecutar Backfill (Esta página)</h4>
                    <p className="text-sm text-muted-foreground mt-1">
                      Usar la pestaña "Backfill" para migrar todas las credenciales al formato enterprise.
                      El proceso puede ejecutarse múltiples veces.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-4 p-4 border rounded-lg">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-500 text-white font-bold">4</div>
                  <div>
                    <h4 className="font-semibold">Validar Migración</h4>
                    <p className="text-sm text-muted-foreground mt-1">
                      Usar la pestaña "Validación" para verificar que todas las credenciales pueden ser descifradas.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-4 p-4 border rounded-lg">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-500 text-white font-bold">5</div>
                  <div>
                    <h4 className="font-semibold">Verificar Cleanup Gate</h4>
                    <p className="text-sm text-muted-foreground mt-1">
                      Usar la pestaña "Cleanup Gate" para verificar si puede proceder con Phase 8.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-4 p-4 border rounded-lg border-red-500">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-red-500 text-white font-bold">6</div>
                  <div>
                    <h4 className="font-semibold text-red-600">Ejecutar Phase 8 Cleanup (SQL)</h4>
                    <p className="text-sm text-muted-foreground mt-1">
                      <strong className="text-red-600">SOLO después de que Cleanup Gate indique OK:</strong><br/>
                      Ejecutar VaultEnterprise_Phase8_Cleanup.sql para eliminar columnas legacy.
                      <br/><span className="text-red-600">⚠️ Esta acción es irreversible.</span>
                    </p>
                  </div>
                </div>
              </div>

              {/* Estado actual */}
              <div className="mt-8 p-4 bg-muted rounded-lg">
                <h4 className="font-semibold mb-2">Estado Actual del Proceso</h4>
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    {(status?.pendingCredentials ?? 0) > 0 ? (
                      <XCircle className="h-5 w-5 text-amber-500" />
                    ) : (
                      <CheckCircle2 className="h-5 w-5 text-green-500" />
                    )}
                    <span>Backfill</span>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                  <div className="flex items-center gap-2">
                    {validation?.allValid ? (
                      <CheckCircle2 className="h-5 w-5 text-green-500" />
                    ) : validation ? (
                      <XCircle className="h-5 w-5 text-red-500" />
                    ) : (
                      <Clock className="h-5 w-5 text-muted-foreground" />
                    )}
                    <span>Validación</span>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                  <div className="flex items-center gap-2">
                    {cleanupReadiness?.canProceed ? (
                      <CheckCircle2 className="h-5 w-5 text-green-500" />
                    ) : cleanupReadiness ? (
                      <XCircle className="h-5 w-5 text-red-500" />
                    ) : (
                      <Clock className="h-5 w-5 text-muted-foreground" />
                    )}
                    <span>Cleanup Gate</span>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                  <div className="flex items-center gap-2">
                    <Clock className="h-5 w-5 text-muted-foreground" />
                    <span className="text-muted-foreground">Phase 8 (SQL)</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

