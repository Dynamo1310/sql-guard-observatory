using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace SQLGuardObservatory.API.Controllers
{
    /// <summary>
    /// Controlador para gestión de logs del sistema
    /// </summary>
    [Authorize(Roles = "Admin,SuperAdmin")]
    [ApiController]
    [Route("api/[controller]")]
    public class LogsController : ControllerBase
    {
        private readonly ILogger<LogsController> _logger;
        private readonly IConfiguration _configuration;
        private const string LOG_DIRECTORY = "Logs";

        public LogsController(
            ILogger<LogsController> logger,
            IConfiguration configuration)
        {
            _logger = logger;
            _configuration = configuration;
        }

        /// <summary>
        /// Obtiene la lista de archivos de log disponibles
        /// </summary>
        [HttpGet("list")]
        public IActionResult GetLogFiles()
        {
            try
            {
                if (!Directory.Exists(LOG_DIRECTORY))
                {
                    return Ok(new { success = true, files = Array.Empty<object>() });
                }

                var files = Directory.GetFiles(LOG_DIRECTORY, "*.log")
                    .Select(f => new FileInfo(f))
                    .OrderByDescending(f => f.LastWriteTime)
                    .Select(f => new
                    {
                        name = f.Name,
                        size = FormatFileSize(f.Length),
                        sizeBytes = f.Length,
                        lastModified = f.LastWriteTime,
                        path = f.FullName
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
        public IActionResult GetLogContent(string fileName)
        {
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

                var content = System.IO.File.ReadAllText(filePath);

                return Ok(new
                {
                    success = true,
                    fileName,
                    content,
                    lines = content.Split('\n').Length
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al leer archivo de log {FileName}", fileName);
                return StatusCode(500, new { success = false, error = ex.Message });
            }
        }

        /// <summary>
        /// Limpia un archivo de log específico
        /// </summary>
        [HttpDelete("clear/{fileName}")]
        public IActionResult ClearLogFile(string fileName)
        {
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

                // Vaciar el contenido del archivo (no eliminarlo, para que siga activo)
                System.IO.File.WriteAllText(filePath, string.Empty);

                _logger.LogInformation("Archivo de log {FileName} limpiado por el usuario", fileName);

                return Ok(new
                {
                    success = true,
                    message = $"Archivo {fileName} limpiado exitosamente"
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al limpiar archivo de log {FileName}", fileName);
                return StatusCode(500, new { success = false, error = ex.Message });
            }
        }

        /// <summary>
        /// Limpia todos los archivos de log
        /// </summary>
        [HttpDelete("clear-all")]
        public IActionResult ClearAllLogs()
        {
            try
            {
                if (!Directory.Exists(LOG_DIRECTORY))
                {
                    return Ok(new { success = true, message = "No hay archivos de log para limpiar" });
                }

                var files = Directory.GetFiles(LOG_DIRECTORY, "*.log");
                var clearedCount = 0;

                foreach (var file in files)
                {
                    try
                    {
                        System.IO.File.WriteAllText(file, string.Empty);
                        clearedCount++;
                    }
                    catch (Exception ex)
                    {
                        _logger.LogWarning(ex, "No se pudo limpiar el archivo {FileName}", Path.GetFileName(file));
                    }
                }

                _logger.LogInformation("Se limpiaron {Count} archivos de log", clearedCount);

                return Ok(new
                {
                    success = true,
                    message = $"Se limpiaron {clearedCount} archivos de log"
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al limpiar todos los archivos de log");
                return StatusCode(500, new { success = false, error = ex.Message });
            }
        }

        /// <summary>
        /// Elimina archivos de log antiguos (más de X días)
        /// </summary>
        [HttpDelete("purge")]
        public IActionResult PurgeOldLogs([FromQuery] int daysOld = 30)
        {
            try
            {
                if (!Directory.Exists(LOG_DIRECTORY))
                {
                    return Ok(new { success = true, message = "No hay archivos de log para purgar" });
                }

                var cutoffDate = DateTime.Now.AddDays(-daysOld);
                var files = Directory.GetFiles(LOG_DIRECTORY, "*.log")
                    .Select(f => new FileInfo(f))
                    .Where(f => f.LastWriteTime < cutoffDate)
                    .ToList();

                var deletedCount = 0;

                foreach (var file in files)
                {
                    try
                    {
                        file.Delete();
                        deletedCount++;
                    }
                    catch (Exception ex)
                    {
                        _logger.LogWarning(ex, "No se pudo eliminar el archivo {FileName}", file.Name);
                    }
                }

                _logger.LogInformation("Se eliminaron {Count} archivos de log antiguos (>{Days} días)", deletedCount, daysOld);

                return Ok(new
                {
                    success = true,
                    message = $"Se eliminaron {deletedCount} archivos de log antiguos (>{daysOld} días)"
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al purgar archivos de log antiguos");
                return StatusCode(500, new { success = false, error = ex.Message });
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

