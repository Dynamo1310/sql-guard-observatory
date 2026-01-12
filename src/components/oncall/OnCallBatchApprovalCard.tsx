import { useState, useEffect } from 'react';
import { 
  Calendar, 
  CheckCircle, 
  XCircle, 
  Clock, 
  User,
  AlertTriangle,
  RefreshCw
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
import { onCallApi, OnCallScheduleBatchDto } from '@/services/api';

interface OnCallBatchApprovalCardProps {
  onBatchProcessed?: () => void;
}

export function OnCallBatchApprovalCard({ onBatchProcessed }: OnCallBatchApprovalCardProps) {
  const [pendingBatches, setPendingBatches] = useState<OnCallScheduleBatchDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [selectedBatch, setSelectedBatch] = useState<OnCallScheduleBatchDto | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  useEffect(() => {
    loadPendingBatches();
  }, []);

  const loadPendingBatches = async () => {
    try {
      setLoading(true);
      const data = await onCallApi.getPendingBatches();
      setPendingBatches(data);
    } catch (err: any) {
      console.error('Error loading pending batches:', err);
      setPendingBatches([]);
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (batch: OnCallScheduleBatchDto) => {
    try {
      setProcessing(true);
      await onCallApi.approveBatch(batch.id);
      toast.success('Calendario aprobado exitosamente');
      await loadPendingBatches();
      onBatchProcessed?.();
    } catch (err: any) {
      toast.error('Error al aprobar: ' + err.message);
    } finally {
      setProcessing(false);
    }
  };

  const openRejectDialog = (batch: OnCallScheduleBatchDto) => {
    setSelectedBatch(batch);
    setRejectReason('');
    setShowRejectDialog(true);
  };

  const handleReject = async () => {
    if (!selectedBatch) return;
    
    if (!rejectReason.trim()) {
      toast.error('Debes indicar un motivo de rechazo');
      return;
    }

    try {
      setProcessing(true);
      await onCallApi.rejectBatch(selectedBatch.id, rejectReason);
      toast.success('Calendario rechazado');
      setShowRejectDialog(false);
      setSelectedBatch(null);
      setRejectReason('');
      await loadPendingBatches();
      onBatchProcessed?.();
    } catch (err: any) {
      toast.error('Error al rechazar: ' + err.message);
    } finally {
      setProcessing(false);
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('es-AR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  };

  const formatDateTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleString('es-AR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (loading) {
    return null; // No mostrar nada mientras carga
  }

  if (pendingBatches.length === 0) {
    return null; // No mostrar nada si no hay pendientes
  }

  return (
    <>
      <Card className="border-amber-500 bg-amber-50/50 shadow-lg">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-600" />
            <CardTitle className="text-lg text-amber-800">
              Calendarios Pendientes de Aprobación
            </CardTitle>
            <Badge variant="secondary" className="bg-amber-200 text-amber-800">
              {pendingBatches.length}
            </Badge>
          </div>
          <CardDescription className="text-amber-700">
            Los siguientes calendarios requieren tu aprobación para ser confirmados
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {pendingBatches.map((batch) => (
            <div 
              key={batch.id} 
              className="bg-white rounded-lg border border-amber-200 p-4 shadow-sm"
            >
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-blue-600" />
                    <span className="font-semibold text-gray-900">
                      {formatDate(batch.startDate)} - {formatDate(batch.endDate)}
                    </span>
                    <Badge variant="outline" className="text-xs">
                      {batch.weeksGenerated} semanas
                    </Badge>
                  </div>
                  
                  <div className="flex items-center gap-4 text-sm text-gray-600">
                    <div className="flex items-center gap-1">
                      <User className="h-3.5 w-3.5" />
                      <span>Generado por: <strong>{batch.generatedByDisplayName}</strong></span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Clock className="h-3.5 w-3.5" />
                      <span>{formatDateTime(batch.generatedAt)}</span>
                    </div>
                  </div>
                </div>
                
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => openRejectDialog(batch)}
                    disabled={processing}
                    className="text-red-600 border-red-300 hover:bg-red-50 hover:text-red-700"
                  >
                    <XCircle className="h-4 w-4 mr-1" />
                    Rechazar
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => handleApprove(batch)}
                    disabled={processing}
                    className="bg-emerald-600 hover:bg-emerald-700"
                  >
                    {processing ? (
                      <RefreshCw className="h-4 w-4 mr-1 animate-spin" />
                    ) : (
                      <CheckCircle className="h-4 w-4 mr-1" />
                    )}
                    Aprobar
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Reject Dialog */}
      <Dialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <XCircle className="h-5 w-5" />
              Rechazar Calendario
            </DialogTitle>
            <DialogDescription>
              El calendario será rechazado y las guardias NO serán creadas.
              Por favor, indica el motivo del rechazo.
            </DialogDescription>
          </DialogHeader>
          
          {selectedBatch && (
            <div className="space-y-4">
              <div className="bg-gray-50 rounded-lg p-3 text-sm">
                <p><strong>Período:</strong> {formatDate(selectedBatch.startDate)} - {formatDate(selectedBatch.endDate)}</p>
                <p><strong>Semanas:</strong> {selectedBatch.weeksGenerated}</p>
                <p><strong>Generado por:</strong> {selectedBatch.generatedByDisplayName}</p>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="rejectReason">Motivo del rechazo *</Label>
                <Textarea
                  id="rejectReason"
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="Ej: Las fechas no son correctas, hay operadores faltantes..."
                  rows={3}
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRejectDialog(false)} disabled={processing}>
              Cancelar
            </Button>
            <Button 
              variant="destructive" 
              onClick={handleReject}
              disabled={processing || !rejectReason.trim()}
            >
              {processing && <RefreshCw className="h-4 w-4 mr-1 animate-spin" />}
              Confirmar Rechazo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

