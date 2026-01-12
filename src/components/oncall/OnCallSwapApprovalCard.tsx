import { useState } from 'react';
import { Check, X, Clock, ArrowRightLeft, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { onCallApi, OnCallSwapRequestDto } from '@/services/api';
import { cn } from '@/lib/utils';

interface OnCallSwapApprovalCardProps {
  requests: OnCallSwapRequestDto[];
  currentUserId?: string;
  isEscalation: boolean;
  onRequestProcessed: () => void;
}

export function OnCallSwapApprovalCard({
  requests,
  currentUserId,
  isEscalation,
  onRequestProcessed,
}: OnCallSwapApprovalCardProps) {
  const [processingId, setProcessingId] = useState<number | null>(null);
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<OnCallSwapRequestDto | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const pendingRequests = requests.filter((r) => r.status === 'Pending');
  const myPendingRequests = pendingRequests.filter(
    (r) => r.targetUserId === currentUserId || isEscalation
  );

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('es-AR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getTimeSince = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);

    if (diffDays > 0) return `hace ${diffDays} día${diffDays > 1 ? 's' : ''}`;
    if (diffHours > 0) return `hace ${diffHours} hora${diffHours > 1 ? 's' : ''}`;
    return 'hace unos minutos';
  };

  const handleApprove = async (request: OnCallSwapRequestDto) => {
    try {
      setProcessingId(request.id);
      await onCallApi.approveSwapRequest(request.id);
      toast.success('Intercambio aprobado. El calendario ha sido actualizado.');
      onRequestProcessed();
    } catch (err: any) {
      toast.error('Error al aprobar: ' + err.message);
    } finally {
      setProcessingId(null);
    }
  };

  const openRejectDialog = (request: OnCallSwapRequestDto) => {
    setSelectedRequest(request);
    setRejectReason('');
    setRejectDialogOpen(true);
  };

  const handleReject = async () => {
    if (!selectedRequest) return;
    if (!rejectReason.trim()) {
      toast.error('Ingresa un motivo para el rechazo');
      return;
    }

    try {
      setProcessingId(selectedRequest.id);
      await onCallApi.rejectSwapRequest(selectedRequest.id, rejectReason);
      toast.success('Solicitud rechazada. Se ha notificado al solicitante.');
      setRejectDialogOpen(false);
      onRequestProcessed();
    } catch (err: any) {
      toast.error('Error al rechazar: ' + err.message);
    } finally {
      setProcessingId(null);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'Pending':
        return <Badge variant="soft-warning">Pendiente</Badge>;
      case 'Approved':
        return <Badge variant="soft-success">Aprobado</Badge>;
      case 'Rejected':
        return <Badge variant="soft-destructive">Rechazado</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  if (myPendingRequests.length === 0) {
    return null;
  }

  return (
    <>
      <Card className="border-warning/30 bg-warning/5">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-warning">
            <div className="p-2 rounded-lg bg-warning/10">
              <Clock className="h-5 w-5" />
            </div>
            Solicitudes de Intercambio Pendientes ({myPendingRequests.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {myPendingRequests.map((request) => (
              <div
                key={request.id}
                className="flex items-start gap-4 p-4 rounded-xl border bg-card transition-all duration-200 hover:shadow-sm"
              >
                <div className="p-2 rounded-lg bg-muted/50">
                  <ArrowRightLeft className="h-5 w-5 text-muted-foreground" />
                </div>
                
                <div className="flex-1 space-y-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium">{request.requesterDisplayName}</span>
                    <span className="text-muted-foreground">solicita intercambio</span>
                    {getStatusBadge(request.status)}
                  </div>
                  
                  <div className="text-sm text-muted-foreground space-y-1">
                    <p>
                      <strong>Guardia:</strong>{' '}
                      {formatDate(request.originalWeekStartDate)} - {formatDate(request.originalWeekEndDate)}
                    </p>
                    {request.requestReason && (
                      <p>
                        <strong>Motivo:</strong> {request.requestReason}
                      </p>
                    )}
                    <p className="text-xs">{getTimeSince(request.requestedAt)}</p>
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="soft-success"
                    onClick={() => handleApprove(request)}
                    disabled={processingId === request.id}
                  >
                    {processingId === request.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Check className="h-4 w-4" />
                    )}
                    <span className="ml-1 hidden sm:inline">Aprobar</span>
                  </Button>
                  <Button
                    size="sm"
                    variant="soft-destructive"
                    onClick={() => openRejectDialog(request)}
                    disabled={processingId === request.id}
                  >
                    <X className="h-4 w-4" />
                    <span className="ml-1 hidden sm:inline">Rechazar</span>
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Reject Dialog */}
      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rechazar Solicitud de Intercambio</DialogTitle>
            <DialogDescription>
              Indica el motivo por el cual rechazas la solicitud. 
              Se notificará a {selectedRequest?.requesterDisplayName} por email.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="rejectReason">Motivo del rechazo</Label>
              <Textarea
                id="rejectReason"
                placeholder="Ej: No puedo cubrir esa fecha, ya tengo compromisos, etc."
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectDialogOpen(false)}>
              Cancelar
            </Button>
            <Button 
              variant="destructive" 
              onClick={handleReject}
              disabled={!rejectReason.trim() || processingId !== null}
            >
              {processingId ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <X className="mr-2 h-4 w-4" />
              )}
              Rechazar Solicitud
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
