using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SQLGuardObservatory.API.Authorization;
using SQLGuardObservatory.API.Services;
using System.Security.Claims;

namespace SQLGuardObservatory.API.Controllers
{
    /// <summary>
    /// Controlador para gestión de logs del sistema
    /// </summary>
    [Authorize]
    [ViewPermission("AdminLogs")]
    [ApiController]
    [Route("api/[controller]")]
    public class LogsController : ControllerBase
    {
        private readonly ILogger<LogsController> _logger;
        private readonly IConfiguration _configuration;
        private readonly IPermissionService _permissionService;
        private const string LOG_DIRECTORY = "Logs";
        private const string REQUIRED_PERMISSION = "AdminLogs";

        public LogsController(
            ILogger<LogsController> logger,
            IConfiguration configuration,
            IPermissionService permissionService)
        {
            _logger = logger;
            _configuration = configuration;
            _permissionService = permissionService;
        }

        private string GetCurrentUserId()
        {
            return User.FindFirst(ClaimTypes.NameIdentifier)?.Value ?? "";
        }

        private async Task<bool> HasLogsPermissionAsync()
        {
            var userId = GetCurrentUserId();
            if (string.IsNullOrEmpty(userId)) return false;
            return await _permissionService.HasPermissionAsync(userId, REQUIRED_PERMISSION);
        }

        /// <summary>
        /// Obtiene la lista de archivos de log disponibles
        /// </summary>
        [HttpGet("list")]
        public async Task<IActionResult> GetLogFiles()
        {
            if (!await HasLogsPermissionAsync())
            {
                return Forbid();
            }

            try
            {
                if (!Directory.Exists(LOG_DIRECTORY))
                {
                    return Ok(new { success = true, files = Array.Empty<object>(), totalFiles = 0 });
                }

                var todayPattern = DateTime.Now.ToString("yyyyMMdd");
                
                var files = Directory.GetFiles(LOG_DIRECTORY, "*.log")
                    .Select(f => new FileInfo(f))
                    .OrderByDescending(f => f.LastWriteTime)
                    .Select(f => new
                    {
                        name = f.Name,
                        size = FormatFileSize(f.Length),
                        sizeBytes = f.Length,
                        lastModified = f.LastWriteTime,
                        path = f.FullName,
                        // Solo marcar como activo el log de Serilog del día actual
                        isActive = IsSerilogActiveFile(f.Name, todayPattern),
                        // output.log es del servicio NSSM
                        isServiceLog = f.Name.Equals("output.log", StringComparison.OrdinalIgnoreCase) ||
                                      f.Name.Equals("error.log", StringComparison.OrdinalIgnoreCase),
                        canOperate = CanOperateOnFile(f.FullName)
                    })
                    .ToList();

                return Ok(new
                {
                    success = true,
                    files,
                    totalFiles = files.Count
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al listar archivos de log");
                return StatusCode(500, new { success = false, error = ex.Message });
            }
        }

        /// <summary>
        /// Obtiene el contenido de un archivo de log específico
        /// </summary>
        [HttpGet("content/{fileName}")]
        public async Task<IActionResult> GetLogContent(string fileName)
        {
            if (!await HasLogsPermissionAsync())
            {
                return Forbid();
            }

            try
            {
                var filePath = Path.Combine(LOG_DIRECTORY, fileName);

                if (!System.IO.File.Exists(filePath))
                {
                    return NotFound(new { success = false, error = "Archivo de log no encontrado" });
                }

                // Validar que el archivo está en el directorio de logs (seguridad)
                var fullPath = Path.GetFullPath(filePath);
                var logDirectory = Path.GetFullPath(LOG_DIRECTORY);
                
                if (!fullPath.StartsWith(logDirectory))
                {
                    return BadRequest(new { success = false, error = "Acceso no autorizado" });
                }

                // Usar FileShare.ReadWrite para poder leer archivos que están siendo escritos
                string content;
                using (var fileStream = new FileStream(filePath, FileMode.Open, FileAccess.Read, FileShare.ReadWrite))
                using (var reader = new StreamReader(fileStream))
                {
                    content = reader.ReadToEnd();
                }

                return Ok(new
                {
                    success = true,
                    fileName,
                    content,
                    lines = content.Split('\n').Length
                });
            }
            catch (IOException ex) when (ex.Message.Contains("being used"))
            {
                _logger.LogWarning("El archivo {FileName} está en uso", fileName);
                return StatusCode(423, new { success = false, error = $"El archivo {fileName} está siendo usado por el sistema. Si es output.log, necesitas reiniciar el servicio de Windows para liberarlo." });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al leer archivo de log {FileName}", fileName);
                return StatusCode(500, new { success = false, error = ex.Message });
            }
        }

        /// <summary>
        /// Limpia un archivo de log específico.
        /// Requiere capacidad System.ManageLogs.
        /// </summary>
        [HttpDelete("clear/{fileName}")]
        [RequireCapability("System.ManageLogs")]
        public async Task<IActionResult> ClearLogFile(string fileName)
        {
            if (!await HasLogsPermissionAsync())
            {
                return Forbid();
            }

            try
            {
                var filePath = Path.Combine(LOG_DIRECTORY, fileName);

                if (!System.IO.File.Exists(filePath))
                {
                    return NotFound(new { success = false, error = "Archivo de log no encontrado" });
                }

                // Validar que el archivo está en el directorio de logs (seguridad)
                var fullPath = Path.GetFullPath(filePath);
                var logDirectory = Path.GetFullPath(LOG_DIRECTORY);
                
                if (!fullPath.StartsWith(logDirectory))
                {
                    return BadRequest(new { success = false, error = "Acceso no autorizado" });
                }

                // Intentar limpiar el archivo
                var (success, errorMessage) = TryClearFile(filePath);
                
                if (success)
                {
                    _logger.LogInformation("Archivo de log {FileName} limpiado por el usuario", fileName);
                    return Ok(new
                    {
                        success = true,
                        message = $"Archivo {fileName} limpiado exitosamente"
                    });
                }
                else
                {
                    // Mensaje especial para output.log
                    if (fileName.Equals("output.log", StringComparison.OrdinalIgnoreCase))
                    {
                        return StatusCode(423, new 
                        { 
                            success = false, 
                            error = $"El archivo output.log está bloqueado por el servicio de Windows (NSSM). Para limpiarlo:\n1. Detener el servicio: net stop SQLGuardObservatoryAPI\n2. Eliminar o vaciar el archivo manualmente\n3. Iniciar el servicio: net start SQLGuardObservatoryAPI",
                            isServiceLog = true
                        });
                    }
                    
                    return StatusCode(423, new 
                    { 
                        success = false, 
                        error = errorMessage ?? $"No se pudo limpiar {fileName}. El archivo está en uso." 
                    });
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al limpiar archivo de log {FileName}", fileName);
                return StatusCode(500, new { success = false, error = ex.Message });
            }
        }

        /// <summary>
        /// Elimina un archivo de log específico.
        /// Requiere capacidad System.ManageLogs.
        /// </summary>
        [HttpDelete("delete/{fileName}")]
        [RequireCapability("System.ManageLogs")]
        public async Task<IActionResult> DeleteLogFile(string fileName)
        {
            if (!await HasLogsPermissionAsync())
            {
                return Forbid();
            }

            try
            {
                var filePath = Path.Combine(LOG_DIRECTORY, fileName);

                if (!System.IO.File.Exists(filePath))
                {
                    return NotFound(new { success = false, error = "Archivo de log no encontrado" });
                }

                // Validar que el archivo está en el directorio de logs (seguridad)
                var fullPath = Path.GetFullPath(filePath);
                var logDirectory = Path.GetFullPath(LOG_DIRECTORY);
                
                if (!fullPath.StartsWith(logDirectory))
                {
                    return BadRequest(new { success = false, error = "Acceso no autorizado" });
                }

                // Intentar eliminar
                try
                {
                    System.IO.File.Delete(filePath);
                    _logger.LogInformation("Archivo de log {FileName} eliminado por el usuario", fileName);

                    return Ok(new
                    {
                        success = true,
                        message = $"Archivo {fileName} eliminado exitosamente"
                    });
                }
                catch (IOException)
                {
                    // Mensaje especial para output.log
                    if (fileName.Equals("output.log", StringComparison.OrdinalIgnoreCase))
                    {
                        return StatusCode(423, new 
                        { 
                            success = false, 
                            error = $"El archivo output.log está bloqueado por el servicio de Windows (NSSM). Para eliminarlo:\n1. Detener el servicio: net stop SQLGuardObservatoryAPI\n2. Eliminar el archivo manualmente\n3. Iniciar el servicio: net start SQLGuardObservatoryAPI",
                            isServiceLog = true
                        });
                    }
                    
                    return StatusCode(423, new 
                    { 
                        success = false, 
                        error = $"No se puede eliminar {fileName}. El archivo está siendo usado por el sistema." 
                    });
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al eliminar archivo de log {FileName}", fileName);
                return StatusCode(500, new { success = false, error = ex.Message });
            }
        }

        /// <summary>
        /// Limpia todos los archivos de log que sea posible.
        /// Requiere capacidad System.ManageLogs.
        /// </summary>
        [HttpDelete("clear-all")]
        [RequireCapability("System.ManageLogs")]
        public async Task<IActionResult> ClearAllLogs()
        {
            if (!await HasLogsPermissionAsync())
            {
                return Forbid();
            }

            try
            {
                if (!Directory.Exists(LOG_DIRECTORY))
                {
                    return Ok(new { success = true, message = "No hay archivos de log para limpiar", cleared = 0, skipped = 0 });
                }

                var files = Directory.GetFiles(LOG_DIRECTORY, "*.log");
                var clearedCount = 0;
                var skippedFiles = new List<string>();

                foreach (var file in files)
                {
                    var fileName = Path.GetFileName(file);
                    var (success, _) = TryClearFile(file);
                    
                    if (success)
                    {
                        clearedCount++;
                    }
                    else
                    {
                        skippedFiles.Add(fileName);
                    }
                }

                _logger.LogInformation("Se limpiaron {Count} archivos de log, {Skipped} omitidos", clearedCount, skippedFiles.Count);

                var message = clearedCount > 0 
                    ? $"Se limpiaron {clearedCount} archivos de log"
                    : "No se pudo limpiar ningún archivo";
                    
                if (skippedFiles.Any())
                {
                    message += $". {skippedFiles.Count} archivo(s) omitido(s) por estar en uso";
                }

                return Ok(new
                {
                    success = true,
                    message,
                    cleared = clearedCount,
                    skipped = skippedFiles.Count,
                    skippedFiles
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al limpiar todos los archivos de log");
                return StatusCode(500, new { success = false, error = ex.Message });
            }
        }

        /// <summary>
        /// Elimina archivos de log antiguos (más de X días).
        /// Requiere capacidad System.ManageLogs.
        /// </summary>
        [HttpDelete("purge")]
        [RequireCapability("System.ManageLogs")]
        public async Task<IActionResult> PurgeOldLogs([FromQuery] int daysOld = 30)
        {
            if (!await HasLogsPermissionAsync())
            {
                return Forbid();
            }

            try
            {
                if (!Directory.Exists(LOG_DIRECTORY))
                {
                    return Ok(new { success = true, message = "No hay archivos de log para purgar", deleted = 0, skipped = 0 });
                }

                var cutoffDate = DateTime.Now.AddDays(-daysOld);
                var files = Directory.GetFiles(LOG_DIRECTORY, "*.log")
                    .Select(f => new FileInfo(f))
                    .Where(f => f.LastWriteTime < cutoffDate)
                    .ToList();

                var deletedCount = 0;
                var skippedFiles = new List<string>();

                foreach (var file in files)
                {
                    try
                    {
                        file.Delete();
                        deletedCount++;
                    }
                    catch (Exception)
                    {
                        skippedFiles.Add(file.Name);
                    }
                }

                _logger.LogInformation("Se eliminaron {Count} archivos de log antiguos (>{Days} días)", deletedCount, daysOld);

                var message = $"Se eliminaron {deletedCount} archivos de log antiguos (>{daysOld} días)";
                if (skippedFiles.Any())
                {
                    message += $". {skippedFiles.Count} archivo(s) omitido(s) por estar en uso";
                }

                return Ok(new
                {
                    success = true,
                    message,
                    deleted = deletedCount,
                    skipped = skippedFiles.Count,
                    skippedFiles
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al purgar archivos de log antiguos");
                return StatusCode(500, new { success = false, error = ex.Message });
            }
        }

        /// <summary>
        /// Determina si un archivo es el log activo de Serilog del día actual
        /// </summary>
        private static bool IsSerilogActiveFile(string fileName, string todayPattern)
        {
            // El archivo principal de Serilog del día tiene el patrón sqlguard-YYYYMMDD
            // También puede tener sufijos como _001, _002 si excede el tamaño
            return fileName.StartsWith("sqlguard-", StringComparison.OrdinalIgnoreCase) &&
                   fileName.Contains(todayPattern);
        }

        /// <summary>
        /// Verifica si se puede operar en un archivo (no está bloqueado exclusivamente)
        /// </summary>
        private static bool CanOperateOnFile(string filePath)
        {
            try
            {
                // Intentar abrir con FileShare.ReadWrite (como lo hace Serilog)
                using var stream = new FileStream(filePath, FileMode.Open, FileAccess.Write, FileShare.ReadWrite);
                return true;
            }
            catch
            {
                return false;
            }
        }

        /// <summary>
        /// Intenta limpiar un archivo usando múltiples estrategias
        /// </summary>
        private (bool Success, string? ErrorMessage) TryClearFile(string filePath)
        {
            var fileName = Path.GetFileName(filePath);
            
            // Estrategia 1: Truncar con FileShare.ReadWrite (funciona para archivos de Serilog)
            try
            {
                using var fileStream = new FileStream(filePath, FileMode.Open, FileAccess.Write, FileShare.ReadWrite);
                fileStream.SetLength(0);
                return (true, null);
            }
            catch (Exception ex1)
            {
                _logger.LogDebug("Estrategia 1 falló para {FileName}: {Error}", fileName, ex1.Message);
            }

            // Estrategia 2: Truncar modo normal
            try
            {
                using var fileStream = new FileStream(filePath, FileMode.Truncate, FileAccess.Write, FileShare.None);
                return (true, null);
            }
            catch (Exception ex2)
            {
                _logger.LogDebug("Estrategia 2 falló para {FileName}: {Error}", fileName, ex2.Message);
            }

            // Estrategia 3: WriteAllText (último recurso)
            try
            {
                System.IO.File.WriteAllText(filePath, string.Empty);
                return (true, null);
            }
            catch (Exception ex3)
            {
                _logger.LogDebug("Estrategia 3 falló para {FileName}: {Error}", fileName, ex3.Message);
                return (false, $"El archivo {fileName} está bloqueado: {ex3.Message}");
            }
        }

        private static string FormatFileSize(long bytes)
        {
            string[] sizes = { "B", "KB", "MB", "GB", "TB" };
            double len = bytes;
            int order = 0;
            
            while (len >= 1024 && order < sizes.Length - 1)
            {
                order++;
                len = len / 1024;
            }

            return $"{len:0.##} {sizes[order]}";
        }
    }
}
