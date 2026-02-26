using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace SQLGuardObservatory.API.Models;

[Table("TempDbAnalysisCache")]
public class TempDbAnalysisCache
{
    [Key]
    [DatabaseGenerated(DatabaseGeneratedOption.Identity)]
    public int Id { get; set; }

    [Required]
    [MaxLength(255)]
    public string InstanceName { get; set; } = string.Empty;

    [MaxLength(100)]
    public string? Ambiente { get; set; }

    [MaxLength(100)]
    public string? HostingSite { get; set; }

    [MaxLength(100)]
    public string? MajorVersion { get; set; }

    public bool ConnectionSuccess { get; set; }

    public string? ErrorMessage { get; set; }

    /// <summary>
    /// JSON serializado con la lista de TempDbRecommendationDto
    /// </summary>
    [Required]
    public string ResultsJson { get; set; } = "[]";

    public int OverallScore { get; set; }

    public DateTime AnalyzedAt { get; set; } = DateTime.UtcNow;
}
