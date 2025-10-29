import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, TrendingUp } from 'lucide-react';
import { HealthScoreTrendChart } from '@/components/HealthScoreTrendChart';
import { DiskTrendChart } from '@/components/DiskTrendChart';
import { CpuTrendChart } from '@/components/CpuTrendChart';
import { MemoryTrendChart } from '@/components/MemoryTrendChart';
import { IOTrendChart } from '@/components/IOTrendChart';

export default function InstanceTrends() {
  const { instanceName } = useParams<{ instanceName: string }>();
  const navigate = useNavigate();
  const [timeRange, setTimeRange] = useState(24); // horas

  if (!instanceName) {
    return (
      <div className="p-6">
        <Card className="p-6 border-red-200 bg-red-50">
          <p className="text-red-700">Instancia no especificada</p>
        </Card>
      </div>
    );
  }

  const timeRangeOptions = [
    { label: '6 horas', value: 6 },
    { label: '24 horas', value: 24 },
    { label: '7 días', value: 168 },
    { label: '30 días', value: 720 }
  ];

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => navigate('/healthscore')}
              className="flex items-center gap-2"
            >
              <ArrowLeft className="h-4 w-4" />
              Volver
            </Button>
            <div>
              <h1 className="text-3xl font-bold flex items-center gap-2">
                <TrendingUp className="h-8 w-8 text-blue-600" />
                Tendencias - {instanceName}
              </h1>
              <p className="text-gray-600">Análisis histórico de métricas</p>
            </div>
          </div>

          {/* Selector de rango de tiempo */}
          <div className="flex items-center gap-2">
            {timeRangeOptions.map(option => (
              <Button
                key={option.value}
                variant={timeRange === option.value ? 'default' : 'outline'}
                size="sm"
                onClick={() => setTimeRange(option.value)}
              >
                {option.label}
              </Button>
            ))}
          </div>
        </div>

        {/* Gráfico de Health Score */}
        <HealthScoreTrendChart instanceName={instanceName} hours={timeRange} />

        {/* Grid de gráficos - Recursos */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Gráfico de CPU */}
          <CpuTrendChart instanceName={instanceName} hours={timeRange} />

          {/* Gráfico de Memoria */}
          <MemoryTrendChart instanceName={instanceName} hours={timeRange} />
        </div>

        {/* Grid de gráficos - Storage */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Gráfico de Disco */}
          <DiskTrendChart instanceName={instanceName} hours={timeRange} />

          {/* Gráfico de I/O */}
          <IOTrendChart instanceName={instanceName} hours={timeRange} />
        </div>
      </div>
    </div>
  );
}

