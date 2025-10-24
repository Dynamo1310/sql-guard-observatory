namespace SQLGuardObservatory.API.DTOs
{
    /// <summary>
    /// DTO principal para Health Score V2
    /// </summary>
    public class HealthScoreV2Dto
    {
        public string Instance { get; set; } = string.Empty;
        public int HealthRaw { get; set; }
        public string? CapApplied { get; set; }
        public int HealthFinal { get; set; }
        public string Top3Penalizaciones { get; set; } = string.Empty;
        public string ColorSemaforo { get; set; } = string.Empty;
        public DateTime CalculadoAt { get; set; }
        
        // Metadatos adicionales
        public string StatusText => ColorSemaforo switch
        {
            "Verde" => "Saludable",
            "Amarillo" => "Advertencia",
            "Naranja" => "Crítico",
            "Rojo" => "Emergencia",
            _ => "Desconocido"
        };
        
        public string StatusColor => ColorSemaforo switch
        {
            "Verde" => "#10b981",
            "Amarillo" => "#f59e0b",
            "Naranja" => "#f97316",
            "Rojo" => "#ef4444",
            _ => "#6b7280"
        };
    }

    /// <summary>
    /// DTO detallado con desglose por categorías
    /// </summary>
    public class HealthScoreDetailV2Dto
    {
        public string Instance { get; set; } = string.Empty;
        public int HealthFinal { get; set; }
        public int HealthRaw { get; set; }
        public string? CapApplied { get; set; }
        public string ColorSemaforo { get; set; } = string.Empty;
        public DateTime CalculadoAt { get; set; }
        
        // Categorías
        public List<CategoryScoreDto> Categories { get; set; } = new();
        
        // Tendencias
        public List<HealthTrendPointDto>? Trends24h { get; set; }
        public List<HealthTrendPointDto>? Trends7d { get; set; }
    }

    /// <summary>
    /// DTO para una categoría individual
    /// </summary>
    public class CategoryScoreDto
    {
        public string Name { get; set; } = string.Empty;
        public string DisplayName { get; set; } = string.Empty;
        public int Score { get; set; }
        public string Notes { get; set; } = string.Empty;
        public double Weight { get; set; }
        public string Icon { get; set; } = string.Empty;
        
        public string StatusColor => Score switch
        {
            >= 85 => "#10b981",
            >= 75 => "#22c55e",
            >= 65 => "#f59e0b",
            >= 50 => "#f97316",
            _ => "#ef4444"
        };
    }

    /// <summary>
    /// DTO para punto de tendencia
    /// </summary>
    public class HealthTrendPointDto
    {
        public DateTime Timestamp { get; set; }
        public int? HealthScore { get; set; }
    }

    /// <summary>
    /// DTO para resumen general (dashboard)
    /// </summary>
    public class HealthScoreSummaryV2Dto
    {
        public int TotalInstances { get; set; }
        public int HealthyInstances { get; set; }
        public int WarningInstances { get; set; }
        public int CriticalInstances { get; set; }
        public int EmergencyInstances { get; set; }
        public double AverageHealth { get; set; }
        
        public List<HealthScoreV2Dto> Instances { get; set; } = new();
        public List<AlertaRecienteDto> RecentAlerts { get; set; } = new();
    }

    /// <summary>
    /// DTO para alerta reciente
    /// </summary>
    public class AlertaRecienteDto
    {
        public long AlertaID { get; set; }
        public string Instance { get; set; } = string.Empty;
        public string? EstadoAnterior { get; set; }
        public string EstadoNuevo { get; set; } = string.Empty;
        public int? HealthScoreAnterior { get; set; }
        public int HealthScoreNuevo { get; set; }
        public string? Causa { get; set; }
        public DateTime DetectadoAt { get; set; }
        public string TimeSinceDetection { get; set; } = string.Empty;
    }

    /// <summary>
    /// DTO para logs de collectors
    /// </summary>
    public class CollectorLogDto
    {
        public string CollectorName { get; set; } = string.Empty;
        public string Instance { get; set; } = string.Empty;
        public string Level { get; set; } = string.Empty;
        public string Message { get; set; } = string.Empty;
        public DateTime LoggedAt { get; set; }
    }
}

