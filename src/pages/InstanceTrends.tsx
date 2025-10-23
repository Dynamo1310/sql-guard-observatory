import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, TrendingUp } from 'lucide-react';
import { HealthScoreTrendChart } from '@/components/HealthScoreTrendChart';
import { DiskTrendChart } from '@/components/DiskTrendChart';

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
              onClick={() => navigate('/health-score')}
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

        {/* Grid de gráficos adicionales */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Gráfico de Disco */}
          <DiskTrendChart instanceName={instanceName} hours={timeRange} />

          {/* Placeholder para otros gráficos */}
          <Card className="p-6">
            <h3 className="text-lg font-semibold mb-4">Latencia de Conexión</h3>
            <div className="h-64 flex items-center justify-center text-gray-400">
              Próximamente
            </div>
          </Card>
        </div>

        {/* Gráfico de Backups (ancho completo) */}
        <Card className="p-6">
          <h3 className="text-lg font-semibold mb-4">Estado de Backups</h3>
          <div className="h-64 flex items-center justify-center text-gray-400">
            Próximamente - Heatmap de estado de backups
          </div>
        </Card>

        {/* Tabla de estadísticas */}
        <Card className="p-6">
          <h3 className="text-lg font-semibold mb-4">Estadísticas del Período</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center p-4 bg-green-50 rounded-lg">
              <div className="text-2xl font-bold text-green-700">95%</div>
              <div className="text-sm text-gray-600">Uptime</div>
            </div>
            <div className="text-center p-4 bg-blue-50 rounded-lg">
              <div className="text-2xl font-bold text-blue-700">23ms</div>
              <div className="text-sm text-gray-600">Latencia Prom.</div>
            </div>
            <div className="text-center p-4 bg-purple-50 rounded-lg">
              <div className="text-2xl font-bold text-purple-700">87</div>
              <div className="text-sm text-gray-600">Score Prom.</div>
            </div>
            <div className="text-center p-4 bg-orange-50 rounded-lg">
              <div className="text-2xl font-bold text-orange-700">2</div>
              <div className="text-sm text-gray-600">Incidentes</div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

