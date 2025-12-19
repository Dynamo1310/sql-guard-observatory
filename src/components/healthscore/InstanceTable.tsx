import { cn } from '@/lib/utils';
import { HealthScoreV3Dto } from '@/services/api';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { CheckCircle2, AlertTriangle, AlertCircle, XCircle, Clock, ArrowUpDown, ArrowUp, ArrowDown, Server } from 'lucide-react';
import { getStatusColor, getScoreColor, getWorstCategory, getAmbientePriority } from './types';
import { useState, useMemo } from 'react';

interface InstanceTableProps {
  instances: HealthScoreV3Dto[];
  onInstanceClick: (instanceName: string) => void;
  updatingInstances?: Set<string>;
  className?: string;
}

type SortKey = 'instanceName' | 'ambiente' | 'healthScore' | 'healthStatus' | 'generatedAtUtc';
type SortDirection = 'asc' | 'desc';

export function InstanceTable({ 
  instances, 
  onInstanceClick, 
  updatingInstances = new Set(),
  className 
}: InstanceTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>('healthScore');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDirection('asc');
    }
  };

  const sortedInstances = useMemo(() => {
    return [...instances].sort((a, b) => {
      let comparison = 0;
      
      switch (sortKey) {
        case 'instanceName':
          comparison = a.instanceName.localeCompare(b.instanceName);
          break;
        case 'ambiente':
          comparison = (a.ambiente || '').localeCompare(b.ambiente || '');
          break;
        case 'healthScore':
          comparison = a.healthScore - b.healthScore;
          break;
        case 'healthStatus':
          const statusOrder = { Critical: 0, Risk: 1, Warning: 2, Healthy: 3 };
          comparison = (statusOrder[a.healthStatus] ?? 4) - (statusOrder[b.healthStatus] ?? 4);
          break;
        case 'generatedAtUtc':
          comparison = new Date(a.generatedAtUtc).getTime() - new Date(b.generatedAtUtc).getTime();
          break;
      }
      
      return sortDirection === 'asc' ? comparison : -comparison;
    });
  }, [instances, sortKey, sortDirection]);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'Healthy': return <CheckCircle2 className="h-4 w-4 text-green-600" />;
      case 'Warning': return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
      case 'Risk': return <AlertCircle className="h-4 w-4 text-orange-500" />;
      case 'Critical': return <XCircle className="h-4 w-4 text-red-600" />;
      default: return <AlertCircle className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getAmbienteBadge = (ambiente?: string) => {
    const priority = getAmbientePriority(ambiente);
    if (priority === 0) {
      return <Badge className="text-[9px] px-1.5 py-0 bg-rose-600 text-white border-0">PROD</Badge>;
    }
    if (priority === 1) {
      return <Badge className="text-[9px] px-1.5 py-0 bg-violet-600 text-white border-0">TEST</Badge>;
    }
    return <Badge variant="outline" className="text-[9px] px-1.5 py-0">{ambiente || 'DEV'}</Badge>;
  };

  const SortHeader = ({ label, sortKeyName }: { label: string; sortKeyName: SortKey }) => (
    <button
      onClick={() => handleSort(sortKeyName)}
      className="flex items-center gap-1 hover:text-foreground transition-colors"
    >
      {label}
      {sortKey === sortKeyName ? (
        sortDirection === 'asc' ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />
      ) : (
        <ArrowUpDown className="h-3.5 w-3.5 opacity-50" />
      )}
    </button>
  );

  if (instances.length === 0) {
    return null;
  }

  return (
    <div className={cn('rounded-lg border overflow-hidden', className)}>
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/50">
            <TableHead className="text-xs font-semibold w-[200px]">
              <SortHeader label="Instancia" sortKeyName="instanceName" />
            </TableHead>
            <TableHead className="text-xs font-semibold">
              <SortHeader label="Ambiente" sortKeyName="ambiente" />
            </TableHead>
            <TableHead className="text-xs font-semibold text-center w-[80px]">
              <SortHeader label="Score" sortKeyName="healthScore" />
            </TableHead>
            <TableHead className="text-xs font-semibold w-[120px]">
              Barra
            </TableHead>
            <TableHead className="text-xs font-semibold">
              <SortHeader label="Estado" sortKeyName="healthStatus" />
            </TableHead>
            <TableHead className="text-xs font-semibold">
              Peor
            </TableHead>
            <TableHead className="text-xs font-semibold text-right">
              <SortHeader label="Actualizado" sortKeyName="generatedAtUtc" />
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sortedInstances.map((score) => {
            const worstCategory = getWorstCategory(score);
            const isUpdating = updatingInstances.has(score.instanceName);
            
            return (
              <TableRow 
                key={score.instanceName}
                onClick={() => onInstanceClick(score.instanceName)}
                className={cn(
                  'cursor-pointer transition-colors',
                  'hover:bg-accent/50',
                  isUpdating && 'bg-blue-500/10'
                )}
              >
                <TableCell className="py-2">
                  <div className="flex items-center gap-2">
                    <Server className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="font-mono text-xs font-medium truncate">
                      {score.instanceName}
                    </span>
                  </div>
                </TableCell>
                <TableCell className="py-2">
                  <div className="flex items-center gap-1.5">
                    {getAmbienteBadge(score.ambiente)}
                    <Badge variant="outline" className="text-[10px] px-1.5">
                      {score.hostingSite || 'N/A'}
                    </Badge>
                  </div>
                </TableCell>
                <TableCell className="text-center py-2">
                  <span className={cn('font-mono text-sm font-bold', getScoreColor(score.healthScore))}>
                    {score.healthScore}
                  </span>
                </TableCell>
                <TableCell className="py-2">
                  <Progress 
                    value={score.healthScore} 
                    className={cn(
                      'h-2',
                      score.healthScore >= 90 && '[&>div]:bg-green-600',
                      score.healthScore >= 75 && score.healthScore < 90 && '[&>div]:bg-yellow-500',
                      score.healthScore >= 60 && score.healthScore < 75 && '[&>div]:bg-orange-500',
                      score.healthScore < 60 && '[&>div]:bg-red-600'
                    )}
                  />
                </TableCell>
                <TableCell className="py-2">
                  <div className="flex items-center gap-1.5">
                    {getStatusIcon(score.healthStatus)}
                    <Badge 
                      variant="outline" 
                      className={cn('text-[10px] px-1.5 font-medium', getStatusColor(score.healthStatus))}
                    >
                      {score.healthStatus}
                    </Badge>
                  </div>
                </TableCell>
                <TableCell className="py-2">
                  {worstCategory && (
                    <span className={cn('text-xs', worstCategory.color)}>
                      {worstCategory.shortName}
                    </span>
                  )}
                </TableCell>
                <TableCell className="text-right py-2">
                  <div className="flex items-center justify-end gap-1 text-[10px] text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    {formatRelativeTime(score.generatedAtUtc)}
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

function formatRelativeTime(dateStr: string | null): string {
  if (!dateStr) return 'N/A';
  
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  
  if (diffMins < 1) return 'Ahora';
  if (diffMins < 60) return `${diffMins}m`;
  
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h`;
  
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d`;
}
