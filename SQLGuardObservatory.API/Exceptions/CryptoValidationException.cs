namespace SQLGuardObservatory.API.Exceptions;

/// <summary>
/// Excepción lanzada cuando la validación de datos criptográficos falla
/// </summary>
public class CryptoValidationException : Exception
{
    public CryptoValidationException(string message) : base(message)
    {
    }
    
    public CryptoValidationException(string message, Exception innerException) 
        : base(message, innerException)
    {
    }
}

