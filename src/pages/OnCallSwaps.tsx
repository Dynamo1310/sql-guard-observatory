import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRightLeft, Check, X, Clock, History, Filter, RefreshCw, Mail, Calendar, User, ArrowLeft } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { toast } from 'sonner';
import { onCallApi, OnCallSwapRequestDto } from '@/services/api';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';

export default function OnCallSwaps() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [swapRequests, setSwapRequests] = useState<OnCallSwapRequestDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState('pending');
  const [statusFilter, setStatusFilter] = useState<string>('__all__');
  
  // Dialog states
  const [showDetailDialog, setShowDetailDialog] = useState(false);
  const [showApproveDialog, setShowApproveDialog] = useState(false);
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<OnCallSwapRequestDto | null>(null);
  const [responseReason, setResponseReason] = useState('');

  useEffect(() => {
    fetchSwapRequests();
  }, []);

  const fetchSwapRequests = async () => {
    try {
      setLoading(true);
      const data = await onCallApi.getSwapRequests();
      setSwapRequests(data);
    } catch (error: any) {
      toast.error('Error al cargar solicitudes: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('es-AR', {
      weekday: 'short',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  };

  const formatDateTime = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('es-AR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'Pending':
        return <Badge variant="soft-warning">
          <Clock className="h-3 w-3 mr-1" />
          Pendiente
        </Badge>;
      case 'Approved':
        return <Badge variant="soft-success">
          <Check className="h-3 w-3 mr-1" />
          Aprobado
        </Badge>;
      case 'Rejected':
        return <Badge variant="soft-destructive">
          <X className="h-3 w-3 mr-1" />
          Rechazado
        </Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const handleApprove = async () => {
    if (!selectedRequest) return;
    
    try {
      setProcessing(selectedRequest.id);
      await onCallApi.approveSwapRequest(selectedRequest.id);
      toast.success('Solicitud aprobada correctamente');
      setShowApproveDialog(false);
      setSelectedRequest(null);
      setResponseReason('');
      fetchSwapRequests();
    } catch (error: any) {
      toast.error('Error al aprobar: ' + error.message);
    } finally {
      setProcessing(null);
    }
  };

  const handleReject = async () => {
    if (!selectedRequest) return;
    
    try {
      setProcessing(selectedRequest.id);
      await onCallApi.rejectSwapRequest(selectedRequest.id, responseReason);
      toast.success('Solicitud rechazada');
      setShowRejectDialog(false);
      setSelectedRequest(null);
      setResponseReason('');
      fetchSwapRequests();
    } catch (error: any) {
      toast.error('Error al rechazar: ' + error.message);
    } finally {
      setProcessing(null);
    }
  };

  const openApproveDialog = (request: OnCallSwapRequestDto) => {
    setSelectedRequest(request);
    setShowApproveDialog(true);
  };

  const openRejectDialog = (request: OnCallSwapRequestDto) => {
    setSelectedRequest(request);
    setShowRejectDialog(true);
  };

  const openDetailDialog = (request: OnCallSwapRequestDto) => {
    setSelectedRequest(request);
    setShowDetailDialog(true);
  };

  // Helper to get week number from date
  const getWeekNumber = (dateStr: string) => {
    const date = new Date(dateStr);
    const startOfYear = new Date(date.getFullYear(), 0, 1);
    const days = Math.floor((date.getTime() - startOfYear.getTime()) / (24 * 60 * 60 * 1000));
    return Math.ceil((days + startOfYear.getDay() + 1) / 7);
  };

  // Filter requests based on active tab and status filter
  const filteredRequests = swapRequests.filter(req => {
    // Tab filter
    if (activeTab === 'pending' && req.status !== 'Pending') return false;
    if (activeTab === 'history' && req.status === 'Pending') return false;
    
    // My requests tab - requests I created or that target me
    if (activeTab === 'mine') {
      const isMyRequest = req.requesterId === user?.id || 
        req.requesterDomainUser?.toUpperCase() === user?.domainUser?.toUpperCase();
      const targetsMe = req.targetUserId === user?.id ||
        req.targetDomainUser?.toUpperCase() === user?.domainUser?.toUpperCase();
      if (!isMyRequest && !targetsMe) return false;
    }
    
    // Status filter
    if (statusFilter !== '__all__' && req.status !== statusFilter) return false;
    
    return true;
  });

  // Count pending requests that target me
  const pendingForMe = swapRequests.filter(req => 
    req.status === 'Pending' && 
    (req.targetUserId === user?.id || req.targetDomainUser?.toUpperCase() === user?.domainUser?.toUpperCase())
  ).length;

  // Count my pending requests (I created)
  const myPendingRequests = swapRequests.filter(req =>
    req.status === 'Pending' &&
    (req.requesterId === user?.id || req.requesterDomainUser?.toUpperCase() === user?.domainUser?.toUpperCase())
  ).length;

  const approvedCount = swapRequests.filter(r => r.status === 'Approved').length;
  const rejectedCount = swapRequests.filter(r => r.status === 'Rejected').length;

  const canApproveOrReject = (request: OnCallSwapRequestDto) => {
    return request.targetUserId === user?.id || 
      request.targetDomainUser?.toUpperCase() === user?.domainUser?.toUpperCase();
  };

  if (loading) {
    return (
      <div className="container mx-auto p-6 space-y-6">
        {/* Header Skeleton */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Skeleton className="h-10 w-10" />
            <div>
              <Skeleton className="h-8 w-64 mb-2" />
              <Skeleton className="h-4 w-80" />
            </div>
          </div>
          <Skeleton className="h-10 w-32" />
        </div>

        {/* KPIs Skeleton */}
        <div className="grid gap-4 md:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-4 w-4" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-16 mb-1" />
                <Skeleton className="h-3 w-28" />
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Table Skeleton */}
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-64" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-10 w-full mb-4" />
            <div className="space-y-2">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
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
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/oncall')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
              <ArrowRightLeft className="h-8 w-8" />
              Intercambios de Guardia
            </h1>
            <p className="text-muted-foreground">
              Gestiona las solicitudes de intercambio de turnos de guardia
            </p>
          </div>
        </div>
        <Button onClick={fetchSwapRequests} variant="outline" disabled={loading}>
          <RefreshCw className={cn('h-4 w-4 mr-2', loading && 'animate-spin')} />
          Actualizar
        </Button>
      </div>

      {/* Alert for pending requests */}
      {pendingForMe > 0 && (
        <Alert variant="warning">
          <Mail className="h-4 w-4" />
          <AlertTitle>Solicitudes pendientes</AlertTitle>
          <AlertDescription>
            Tenés {pendingForMe} solicitud{pendingForMe > 1 ? 'es' : ''} de intercambio esperando tu aprobación.
          </AlertDescription>
        </Alert>
      )}

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pendientes para mí</CardTitle>
            <Clock className={cn('h-4 w-4', pendingForMe > 0 ? 'text-warning' : 'text-muted-foreground')} />
          </CardHeader>
          <CardContent>
            <div className={cn('text-2xl font-bold', pendingForMe > 0 ? 'text-warning' : 'text-muted-foreground')}>
              {pendingForMe}
            </div>
            <p className="text-xs text-muted-foreground">Esperando mi aprobación</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Mis solicitudes</CardTitle>
            <ArrowRightLeft className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">{myPendingRequests}</div>
            <p className="text-xs text-muted-foreground">Solicitudes que creé pendientes</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Aprobadas</CardTitle>
            <Check className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-500">{approvedCount}</div>
            <p className="text-xs text-muted-foreground">Total histórico</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Rechazadas</CardTitle>
            <X className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-500">{rejectedCount}</div>
            <p className="text-xs text-muted-foreground">Total histórico</p>
          </CardContent>
        </Card>
      </div>

      {/* Main Content */}
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <ArrowRightLeft className="h-5 w-5 text-primary" />
                Solicitudes de Intercambio
              </CardTitle>
              <CardDescription>
                Lista de todas las solicitudes de intercambio de guardia
              </CardDescription>
            </div>
            {activeTab === 'history' && (
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[180px]">
                  <Filter className="h-4 w-4 mr-2" />
                  <SelectValue placeholder="Filtrar por estado" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Todos</SelectItem>
                  <SelectItem value="Approved">Aprobados</SelectItem>
                  <SelectItem value="Rejected">Rechazados</SelectItem>
                </SelectContent>
              </Select>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-3 mb-4">
              <TabsTrigger value="pending" className="relative">
                <Clock className="h-4 w-4 mr-2" />
                Pendientes
                {pendingForMe > 0 && (
                  <span className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-foreground text-background text-xs flex items-center justify-center">
                    {pendingForMe}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="mine">
                <User className="h-4 w-4 mr-2" />
                Mis Intercambios
              </TabsTrigger>
              <TabsTrigger value="history">
                <History className="h-4 w-4 mr-2" />
                Historial
              </TabsTrigger>
            </TabsList>

            <div className="max-h-[500px] overflow-auto rounded-md border">
              <Table>
                <TableHeader className="sticky top-0 bg-background">
                  <TableRow>
                    <TableHead className="text-sm">Solicitante</TableHead>
                    <TableHead className="text-sm">Semana</TableHead>
                    <TableHead className="text-sm">Intercambiar con</TableHead>
                    <TableHead className="text-sm">Motivo</TableHead>
                    <TableHead className="text-sm">Estado</TableHead>
                    <TableHead className="text-sm">Fecha</TableHead>
                    <TableHead className="text-sm text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRequests.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-12">
                        <ArrowRightLeft className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                        <p className="text-lg font-semibold mb-2">Sin solicitudes</p>
                        <p className="text-muted-foreground">
                          {activeTab === 'pending' 
                            ? 'No hay solicitudes pendientes'
                            : activeTab === 'mine'
                            ? 'No tenés solicitudes de intercambio'
                            : 'No hay historial de intercambios'}
                        </p>
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredRequests.map((request) => (
                      <TableRow key={request.id} className={cn(
                        request.status === 'Pending' && canApproveOrReject(request) && 'bg-warning/5'
                      )}>
                        <TableCell>
                          <div className="font-medium">{request.requesterDisplayName}</div>
                          <div className="text-xs text-muted-foreground">{request.requesterDomainUser}</div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Calendar className="h-4 w-4 text-muted-foreground" />
                            <div>
                              <div className="text-sm font-medium">Semana {getWeekNumber(request.originalWeekStartDate)}</div>
                              <div className="text-xs text-muted-foreground">
                                {formatDate(request.originalWeekStartDate)}
                              </div>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="font-medium">{request.targetDisplayName}</div>
                          <div className="text-xs text-muted-foreground">{request.targetDomainUser}</div>
                        </TableCell>
                        <TableCell>
                          <div className="max-w-[200px] truncate" title={request.requestReason || 'Sin motivo'}>
                            {request.requestReason || <span className="text-muted-foreground italic">Sin motivo</span>}
                          </div>
                        </TableCell>
                        <TableCell>{getStatusBadge(request.status)}</TableCell>
                        <TableCell>
                          <div className="text-sm">{formatDateTime(request.requestedAt)}</div>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openDetailDialog(request)}
                            >
                              Ver
                            </Button>
                            {request.status === 'Pending' && canApproveOrReject(request) && (
                              <>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="hover:bg-emerald-500/10 hover:text-emerald-500 hover:border-emerald-500/30"
                                  onClick={() => openApproveDialog(request)}
                                  disabled={processing === request.id}
                                >
                                  <Check className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30"
                                  onClick={() => openRejectDialog(request)}
                                  disabled={processing === request.id}
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              </>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </Tabs>
        </CardContent>
      </Card>

      {/* Detail Dialog */}
      <Dialog open={showDetailDialog} onOpenChange={setShowDetailDialog}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Detalle de Solicitud de Intercambio</DialogTitle>
            <DialogDescription>
              Información completa de la solicitud
            </DialogDescription>
          </DialogHeader>
          {selectedRequest && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label className="text-muted-foreground">Solicitante</Label>
                  <p className="font-medium">{selectedRequest.requesterDisplayName}</p>
                  <p className="text-sm text-muted-foreground">{selectedRequest.requesterDomainUser}</p>
                </div>
                <div className="space-y-1">
                  <Label className="text-muted-foreground">Intercambiar con</Label>
                  <p className="font-medium">{selectedRequest.targetDisplayName}</p>
                  <p className="text-sm text-muted-foreground">{selectedRequest.targetDomainUser}</p>
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-muted-foreground">Semana de guardia</Label>
                <p className="font-medium">Semana {getWeekNumber(selectedRequest.originalWeekStartDate)}</p>
                <p className="text-sm text-muted-foreground">
                  {formatDate(selectedRequest.originalWeekStartDate)} - {formatDate(selectedRequest.originalWeekEndDate)}
                </p>
              </div>

              <div className="space-y-1">
                <Label className="text-muted-foreground">Motivo</Label>
                <p className={selectedRequest.requestReason ? '' : 'text-muted-foreground italic'}>
                  {selectedRequest.requestReason || 'Sin motivo especificado'}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label className="text-muted-foreground">Estado</Label>
                  <div>{getStatusBadge(selectedRequest.status)}</div>
                </div>
                <div className="space-y-1">
                  <Label className="text-muted-foreground">Fecha solicitud</Label>
                  <p className="text-sm">{formatDateTime(selectedRequest.requestedAt)}</p>
                </div>
              </div>

              {selectedRequest.respondedAt && (
                <div className="space-y-1">
                  <Label className="text-muted-foreground">Fecha respuesta</Label>
                  <p className="text-sm">{formatDateTime(selectedRequest.respondedAt)}</p>
                </div>
              )}

              {selectedRequest.rejectionReason && (
                <div className="space-y-1">
                  <Label className="text-muted-foreground">Motivo del rechazo</Label>
                  <p className="text-sm">{selectedRequest.rejectionReason}</p>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDetailDialog(false)}>
              Cerrar
            </Button>
            {selectedRequest?.status === 'Pending' && canApproveOrReject(selectedRequest) && (
              <>
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowDetailDialog(false);
                    openRejectDialog(selectedRequest);
                  }}
                >
                  <X className="h-4 w-4 mr-2" />
                  Rechazar
                </Button>
                <Button
                  onClick={() => {
                    setShowDetailDialog(false);
                    openApproveDialog(selectedRequest);
                  }}
                >
                  <Check className="h-4 w-4 mr-2" />
                  Aprobar
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Approve Dialog */}
      <Dialog open={showApproveDialog} onOpenChange={setShowApproveDialog}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Aprobar Intercambio</DialogTitle>
            <DialogDescription>
              ¿Estás seguro de aprobar este intercambio de guardia?
            </DialogDescription>
          </DialogHeader>
          {selectedRequest && (
            <div className="space-y-4">
              <Alert variant="success">
                <Check className="h-4 w-4" />
                <AlertTitle>Confirmar aprobación</AlertTitle>
                <AlertDescription>
                  <strong>{selectedRequest.requesterDisplayName}</strong> tomará tu guardia de la semana{' '}
                  <strong>{getWeekNumber(selectedRequest.originalWeekStartDate)}</strong> ({formatDate(selectedRequest.originalWeekStartDate)}) y vos tomarás la suya.
                </AlertDescription>
              </Alert>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowApproveDialog(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleApprove}
              disabled={processing !== null}
            >
              {processing !== null ? (
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Check className="h-4 w-4 mr-2" />
              )}
              Aprobar Intercambio
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject Dialog */}
      <Dialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Rechazar Intercambio</DialogTitle>
            <DialogDescription>
              ¿Estás seguro de rechazar esta solicitud de intercambio?
            </DialogDescription>
          </DialogHeader>
          {selectedRequest && (
            <div className="space-y-4">
              <Alert variant="destructive">
                <X className="h-4 w-4" />
                <AlertTitle>Rechazar solicitud</AlertTitle>
                <AlertDescription>
                  La solicitud de <strong>{selectedRequest.requesterDisplayName}</strong> para intercambiar 
                  la guardia de la semana <strong>{getWeekNumber(selectedRequest.originalWeekStartDate)}</strong> ({formatDate(selectedRequest.originalWeekStartDate)}) será rechazada.
                </AlertDescription>
              </Alert>
              <div className="space-y-2">
                <Label htmlFor="rejectReason">Motivo del rechazo (opcional)</Label>
                <Textarea
                  id="rejectReason"
                  placeholder="Ej: No puedo tomar esa semana por compromisos previos..."
                  value={responseReason}
                  onChange={(e) => setResponseReason(e.target.value)}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRejectDialog(false)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={handleReject}
              disabled={processing !== null}
            >
              {processing !== null ? (
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <X className="h-4 w-4 mr-2" />
              )}
              Rechazar Solicitud
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
