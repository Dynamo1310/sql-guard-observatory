-- Ver ejemplo de IODetails para entender su estructura
USE SQLNova;
GO

SELECT TOP 1
    InstanceName,
    CollectedAtUtc,
    IODetails
FROM dbo.InstanceHealth_IO
WHERE IODetails IS NOT NULL
ORDER BY CollectedAtUtc DESC;

-- Si quieres ver varios ejemplos:
/*
SELECT TOP 5
    InstanceName,
    CollectedAtUtc,
    LEFT(IODetails, 500) AS IODetails_Preview
FROM dbo.InstanceHealth_IO
WHERE IODetails IS NOT NULL
ORDER BY CollectedAtUtc DESC;
*/

