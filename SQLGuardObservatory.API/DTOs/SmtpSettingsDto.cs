namespace SQLGuardObservatory.API.DTOs;

// ==================== SMTP SETTINGS DTOs ====================

public class SmtpSettingsDto
{
    public int Id { get; set; }
    public string Host { get; set; } = string.Empty;
    public int Port { get; set; }
    public string FromEmail { get; set; } = string.Empty;
    public string FromName { get; set; } = string.Empty;
    public bool EnableSsl { get; set; }
    public string? Username { get; set; }
    public bool HasPassword { get; set; } // No exponer la contraseña real
    public bool IsActive { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime? UpdatedAt { get; set; }
    public string? UpdatedByDisplayName { get; set; }
}

public class UpdateSmtpSettingsRequest
{
    public string Host { get; set; } = string.Empty;
    public int Port { get; set; } = 25;
    public string FromEmail { get; set; } = string.Empty;
    public string FromName { get; set; } = "SQL Guard Observatory";
    public bool EnableSsl { get; set; } = false;
    public string? Username { get; set; }
    public string? Password { get; set; } // Solo se actualiza si se proporciona
}

public class TestSmtpRequest
{
    public string TestEmail { get; set; } = string.Empty;
}






