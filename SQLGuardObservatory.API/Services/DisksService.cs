using Microsoft.EntityFrameworkCore;
using SQLGuardObservatory.API.Data;
using SQLGuardObservatory.API.DTOs;

namespace SQLGuardObservatory.API.Services;

public class DisksService : IDisksService
{
    private readonly SQLNovaDbContext _context;
    private readonly ILogger<DisksService> _logger;

    public DisksService(SQLNovaDbContext context, ILogger<DisksService> logger)
    {
        _context = context;
        _logger = logger;
    }

    public async Task<List<DiskDto>> GetDisksAsync(string? ambiente = null, string? hosting = null, string? instance = null, string? estado = null)
    {
        try
        {
            // Obtener la última fecha de captura
            var ultimaCaptura = await _context.InventarioDiscosSnapshot
                .MaxAsync(d => (DateTime?)d.CaptureDate);

            if (ultimaCaptura == null)
            {
                return new List<DiskDto>();
            }

            var query = _context.InventarioDiscosSnapshot
                .Where(d => d.CaptureDate == ultimaCaptura.Value);

            // Aplicar filtros
            if (!string.IsNullOrWhiteSpace(ambiente))
            {
                query = query.Where(d => d.Ambiente == ambiente);
            }

            if (!string.IsNullOrWhiteSpace(hosting))
            {
                query = query.Where(d => d.Hosting == hosting);
            }

            if (!string.IsNullOrWhiteSpace(instance))
            {
                query = query.Where(d => d.InstanceName == instance);
            }

            if (!string.IsNullOrWhiteSpace(estado))
            {
                query = query.Where(d => d.Estado == estado);
            }

            var disks = await query
                .OrderBy(d => d.Estado == "Critico" ? 1 : d.Estado == "Advertencia" ? 2 : 3)
                .ThenBy(d => d.PorcentajeLibre)
                .Select(d => new DiskDto
                {
                    Id = d.Id,
                    InstanceName = d.InstanceName,
                    Ambiente = d.Ambiente,
                    Hosting = d.Hosting,
                    Servidor = d.Servidor,
                    Drive = d.Drive,
                    TotalGB = d.TotalGB,
                    LibreGB = d.LibreGB,
                    PorcentajeLibre = d.PorcentajeLibre,
                    Estado = d.Estado,
                    CaptureDate = d.CaptureDate
                })
                .ToListAsync();

            return disks;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al obtener discos");
            throw;
        }
    }

    public async Task<DiskSummaryDto> GetDisksSummaryAsync(string? ambiente = null, string? hosting = null, string? instance = null, string? estado = null)
    {
        try
        {
            // Obtener la última fecha de captura
            var ultimaCaptura = await _context.InventarioDiscosSnapshot
                .MaxAsync(d => (DateTime?)d.CaptureDate);

            if (ultimaCaptura == null)
            {
                return new DiskSummaryDto
                {
                    DiscosCriticos = 0,
                    DiscosAdvertencia = 0,
                    DiscosSaludables = 0,
                    TotalDiscos = 0,
                    UltimaCaptura = null
                };
            }

            var query = _context.InventarioDiscosSnapshot
                .Where(d => d.CaptureDate == ultimaCaptura.Value);

            // Aplicar filtros
            if (!string.IsNullOrWhiteSpace(ambiente))
            {
                query = query.Where(d => d.Ambiente == ambiente);
            }

            if (!string.IsNullOrWhiteSpace(hosting))
            {
                query = query.Where(d => d.Hosting == hosting);
            }

            if (!string.IsNullOrWhiteSpace(instance))
            {
                query = query.Where(d => d.InstanceName == instance);
            }

            if (!string.IsNullOrWhiteSpace(estado))
            {
                query = query.Where(d => d.Estado == estado);
            }

            var summary = await query
                .GroupBy(d => 1)
                .Select(g => new DiskSummaryDto
                {
                    DiscosCriticos = g.Count(d => d.Estado == "Critico"),
                    DiscosAdvertencia = g.Count(d => d.Estado == "Advertencia"),
                    DiscosSaludables = g.Count(d => d.Estado == "Saludable"),
                    TotalDiscos = g.Count(),
                    UltimaCaptura = ultimaCaptura
                })
                .FirstOrDefaultAsync();

            return summary ?? new DiskSummaryDto
            {
                DiscosCriticos = 0,
                DiscosAdvertencia = 0,
                DiscosSaludables = 0,
                TotalDiscos = 0,
                UltimaCaptura = ultimaCaptura
            };
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al obtener resumen de discos");
            throw;
        }
    }

    public async Task<DiskFiltersDto> GetAvailableFiltersAsync()
    {
        try
        {
            // Obtener la última fecha de captura
            var ultimaCaptura = await _context.InventarioDiscosSnapshot
                .MaxAsync(d => (DateTime?)d.CaptureDate);

            if (ultimaCaptura == null)
            {
                return new DiskFiltersDto();
            }

            var disks = await _context.InventarioDiscosSnapshot
                .Where(d => d.CaptureDate == ultimaCaptura.Value)
                .ToListAsync();

            return new DiskFiltersDto
            {
                Ambientes = disks
                    .Where(d => !string.IsNullOrWhiteSpace(d.Ambiente))
                    .Select(d => d.Ambiente!)
                    .Distinct()
                    .OrderBy(a => a)
                    .ToList(),
                Hostings = disks
                    .Where(d => !string.IsNullOrWhiteSpace(d.Hosting))
                    .Select(d => d.Hosting!)
                    .Distinct()
                    .OrderBy(h => h)
                    .ToList(),
                Instancias = disks
                    .Select(d => d.InstanceName)
                    .Distinct()
                    .OrderBy(i => i)
                    .ToList(),
                Estados = disks
                    .Where(d => !string.IsNullOrWhiteSpace(d.Estado))
                    .Select(d => d.Estado!)
                    .Distinct()
                    .OrderBy(e => e == "Critico" ? 1 : e == "Advertencia" ? 2 : 3)
                    .ToList()
            };
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al obtener filtros disponibles");
            throw;
        }
    }
}

