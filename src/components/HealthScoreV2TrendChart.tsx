import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Card } from '@/components/ui/card';

interface TrendPoint {
  timestamp: string;
  healthScore: number;
}

interface Props {
  data: TrendPoint[];
  title: string;
}

export default function HealthScoreV2TrendChart({ data, title }: Props) {
  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleDateString('es-AR', { 
      month: 'short', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getStatusColor = (score: number) => {
    if (score >= 85) return '#22c55e'; // verde
    if (score >= 75) return '#eab308'; // amarillo
    if (score >= 65) return '#f97316'; // naranja
    return '#ef4444'; // rojo
  };

  const chartData = data.map(d => ({
    time: formatTimestamp(d.timestamp),
    score: d.healthScore || 0,
    fullTimestamp: new Date(d.timestamp).toLocaleString('es-AR')
  }));

  return (
    <div className="space-y-4">
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
          <XAxis 
            dataKey="time" 
            tick={{ fontSize: 12 }}
            angle={-45}
            textAnchor="end"
            height={80}
            className="text-muted-foreground"
          />
          <YAxis 
            domain={[0, 100]}
            tick={{ fontSize: 12 }}
            className="text-muted-foreground"
          />
          <Tooltip 
            content={({ active, payload }) => {
              if (active && payload && payload.length) {
                const data = payload[0].payload;
                return (
                  <div className="bg-background border rounded-lg shadow-lg p-3">
                    <p className="text-sm font-semibold">{data.fullTimestamp}</p>
                    <p className="text-sm">
                      Score: <span className="font-bold" style={{ color: getStatusColor(data.score) }}>
                        {data.score}
                      </span>
                    </p>
                  </div>
                );
              }
              return null;
            }}
          />
          <Line 
            type="monotone" 
            dataKey="score" 
            stroke="#3b82f6" 
            strokeWidth={2}
            dot={{ r: 3 }}
            activeDot={{ r: 5 }}
            name="Health Score"
          />
        </LineChart>
      </ResponsiveContainer>

      {/* Leyenda de thresholds */}
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <div className="flex items-center gap-1">
          <div className="w-3 h-0.5 bg-success"></div>
          <span>Verde (≥85)</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-0.5 bg-warning"></div>
          <span>Amarillo (75-84)</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-0.5 bg-orange-500"></div>
          <span>Naranja (65-74)</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-0.5 bg-destructive"></div>
          <span>Rojo (&lt;65)</span>
        </div>
      </div>
    </div>
  );
}

