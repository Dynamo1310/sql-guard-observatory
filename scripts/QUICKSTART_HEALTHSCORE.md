# 🚀 Quick Start - HealthScore

Esta guía te ayudará a ejecutar tu primera prueba del sistema HealthScore en menos de 5 minutos.

---

## 📋 Requisitos Previos

- ✅ PowerShell 7 o superior
- ✅ Acceso de red a las instancias SQL Server
- ✅ Permisos de lectura en las instancias

---

## 🧪 Primera Ejecución (Modo de Prueba)

El modo de prueba es **perfecto para empezar**. Procesa solo 5 instancias con salida detallada.

### Opción A: Usando el Menú Interactivo (Recomendado)

```powershell
# 1. Navegar a la carpeta scripts
cd C:\Users\tobia\OneDrive\Desktop\sql-guard-observatory\scripts

# 2. Ejecutar el menú
.\EjecutarHealthScore.ps1

# 3. Seleccionar opción 1: 🧪 Modo de Prueba
```

### Opción B: Línea de Comandos Directa

```powershell
# 1. Navegar a la carpeta scripts
cd C:\Users\tobia\OneDrive\Desktop\sql-guard-observatory\scripts

# 2. Ejecutar en modo de prueba
.\RelevamientoHealthScoreMant.ps1 -TestMode
```

---

## 🎯 ¿Qué hace el Modo de Prueba?

El parámetro `-TestMode` activa automáticamente:

- ✅ **Procesa solo 5 instancias** (rápido)
- ✅ **Salida detallada en consola** (ver problemas en tiempo real)
- ✅ **NO escribe a SQL** (solo archivos locales)
- ✅ **Genera JSON y CSV** (para análisis)
- ✅ **Banner visual claro** (sabes que estás en modo test)

---

## 📊 Salida del Modo de Prueba

Durante la ejecución verás algo como esto:

```
╔════════════════════════════════════════╗
║                                        ║
║     🧪 MODO DE PRUEBA ACTIVADO 🧪     ║
║                                        ║
╚════════════════════════════════════════╝

  → Límite de instancias: 5
  → Escritura a SQL: DESHABILITADA (usar -WriteToSql para forzar)
  → Salida detallada: HABILITADA
  → Archivos JSON/CSV: HABILITADOS

========================================
 SQL Server Health Score - Relevamiento
========================================

[1/5] Obteniendo inventario...
      [OK] 150 instancias obtenidas

[2/5] Filtrando instancias (excluye DMZ)...
      [OK] 5 instancias a procesar (límite: 5)

[3/5] Procesando instancias...

  [1/5] SSPR17-01 - [Healthy] Score: 95
      Latencia: 150ms | Disco: 35.5% libre

  [2/5] SSDS16-03 - [Warning] Score: 78
      Latencia: 250ms | Disco: 18.2% libre
      ⚠️  Backups: 1 breach(es)

  [3/5] SSAWS-01 - [Critical] Score: 55
      Latencia: 8500ms | Disco: 8.3% libre
      ⚠️  Backups: 5 breach(es)
      ⚠️  Errores críticos: 3

...

========================================
 RESUMEN
========================================
Instancias procesadas: 5
  Healthy (>=90):      2
  Warning (70-89):     2
  Critical (<70):      1

Score promedio: 76

Tiempo de ejecución: 00:00:35

╔════════════════════════════════════════╗
║                                        ║
║    🧪 MODO DE PRUEBA COMPLETADO 🧪    ║
║                                        ║
╚════════════════════════════════════════╝

Próximos pasos:
  1. Revisar archivos generados:
     • .\InstanceHealth.json
     • .\InstanceHealth.csv

  2. Ver resultados en consola:
     Import-Csv '.\InstanceHealth.csv' | Format-Table

  3. Para ejecutar sobre TODAS las instancias:
     .\RelevamientoHealthScoreMant.ps1 -Parallel -WriteToSql

Detalle de instancias procesadas:
  ✅ SSPR17-01 - Score: 95 - Healthy
  ✅ SSPR17-02 - Score: 92 - Healthy
  ⚠️  SSDS16-03 - Score: 78 - Warning
  ⚠️  SSPR16-05 - Score: 72 - Warning
  ❌ SSAWS-01 - Score: 55 - Critical

[OK] Proceso completado
```

---

## 📁 Archivos Generados

Después de la ejecución, encontrarás dos archivos en la carpeta `scripts`:

### 1. `InstanceHealth.json`

Archivo JSON completo con todos los detalles de cada instancia.

**Ver en PowerShell:**
```powershell
# Ver todo
Get-Content .\InstanceHealth.json | ConvertFrom-Json | Format-List

# Solo instancias críticas
Get-Content .\InstanceHealth.json | ConvertFrom-Json | 
    Where-Object HealthStatus -eq 'Critical' | 
    Select-Object InstanceName, HealthScore, HealthStatus
```

### 2. `InstanceHealth.csv`

Archivo CSV simplificado, ideal para Excel o análisis rápido.

**Ver en PowerShell:**
```powershell
# Ver todo en tabla
Import-Csv .\InstanceHealth.csv | Format-Table

# Solo instancias críticas
Import-Csv .\InstanceHealth.csv | 
    Where-Object HealthStatus -eq 'Critical'

# Ordenar por score (peores primero)
Import-Csv .\InstanceHealth.csv | 
    Sort-Object HealthScore | 
    Format-Table
```

**Abrir en Excel:**
```powershell
.\InstanceHealth.csv
```

---

## 🔍 Interpretar Resultados

### Health Status

| Estado | Score | Significado | Acción |
|--------|-------|-------------|--------|
| 🟢 **Healthy** | 90-100 | Todo bien | Monitoreo normal |
| 🟡 **Warning** | 70-89 | Atención requerida | Revisar en días |
| 🔴 **Critical** | 0-69 | Problemas serios | Atención urgente |

### Métricas Clave

**En el CSV encontrarás:**

- `HealthScore`: Puntuación general (0-100)
- `HealthStatus`: Estado (Healthy/Warning/Critical)
- `ConnectLatencyMs`: Latencia de conexión en milisegundos
- `WorstVolumeFreePct`: % libre del disco más lleno
- `BackupBreachesCount`: Número de backups vencidos
- `AlwaysOnIssuesCount`: Problemas de AlwaysOn (si aplica)
- `Severity20PlusCount24h`: Errores críticos en últimas 24h

**Ejemplos de interpretación:**

```csv
InstanceName,HealthScore,WorstVolumeFreePct,BackupBreachesCount
SSPR17-01,95,35.50,0              ← ✅ Perfecto: score alto, buen espacio
SSDS16-03,78,18.20,1              ← ⚠️  Warning: disco bajo, 1 backup vencido
SSAWS-01,55,8.30,5                ← 🔴 Crítico: disco muy bajo, múltiples backups
```

---

## ➡️ Próximos Pasos

### Después del Modo de Prueba

Una vez que confirmes que funciona correctamente:

#### 1. **Ejecución Completa (Todas las Instancias)**

```powershell
# Modo paralelo (más rápido)
.\RelevamientoHealthScoreMant.ps1 -Parallel -Throttle 10

# Resultado: archivos JSON/CSV con todas las instancias
```

#### 2. **Guardar en Base de Datos SQL**

```powershell
# Guarda en SSPR17MON-01.SQLNova.dbo.InstanceHealthSnapshot
.\RelevamientoHealthScoreMant.ps1 -Parallel -WriteToSql

# Luego consulta desde SQL Server:
SELECT * FROM dbo.vw_HealthScoreSummary
WHERE HealthStatus = 'Critical'
ORDER BY HealthScore ASC;
```

#### 3. **Automatizar (Ejecución Diaria)**

Configura Task Scheduler para ejecutar automáticamente:

```powershell
# Ver: IMPLEMENTACION_HEALTHSCORE.md sección "Automatización"
```

---

## 🔧 Troubleshooting

### Problema: "No se puede conectar a algunas instancias"

**Normal**. El script maneja errores automáticamente. Instancias sin conexión recibirán score 0 y estado Critical.

**Ver cuáles fallaron:**
```powershell
Import-Csv .\InstanceHealth.csv | 
    Where-Object ConnectSuccess -eq 'False'
```

### Problema: "Muy lento"

**Solución 1**: Aumentar timeout si las instancias son lentas
```powershell
.\RelevamientoHealthScoreMant.ps1 -TestMode -TimeoutSec 30
```

**Solución 2**: Usar modo paralelo (cuando ejecutes todas)
```powershell
.\RelevamientoHealthScoreMant.ps1 -Parallel -Throttle 12
```

### Problema: "Error: Módulo SqlServer no encontrado"

El script lo instala automáticamente. Si falla:
```powershell
Install-Module SqlServer -Scope CurrentUser -Force
```

---

## 💡 Comandos Útiles Post-Ejecución

### Ver Resumen en Consola

```powershell
# Tabla básica
Import-Csv .\InstanceHealth.csv | 
    Format-Table InstanceName, HealthScore, HealthStatus

# Solo críticos
Import-Csv .\InstanceHealth.csv | 
    Where-Object HealthStatus -eq 'Critical' | 
    Format-Table

# Top 10 peores scores
Import-Csv .\InstanceHealth.csv | 
    Sort-Object HealthScore | 
    Select-Object -First 10 | 
    Format-Table

# Estadísticas
Import-Csv .\InstanceHealth.csv | 
    Group-Object HealthStatus | 
    Select-Object Name, Count
```

### Filtros Útiles

```powershell
# Instancias con disco < 15%
Import-Csv .\InstanceHealth.csv | 
    Where-Object { [decimal]$_.WorstVolumeFreePct -lt 15 }

# Instancias con backups vencidos
Import-Csv .\InstanceHealth.csv | 
    Where-Object BackupBreachesCount -gt 0

# Instancias de producción críticas
Import-Csv .\InstanceHealth.csv | 
    Where-Object { $_.Ambiente -eq 'Producción' -and $_.HealthStatus -eq 'Critical' }
```

---

## 📚 Documentación Completa

Para más información, consulta:

- **README_HEALTHSCORE.md**: Documentación completa y detallada
- **IMPLEMENTACION_HEALTHSCORE.md**: Guía de implementación y arquitectura
- **ConsultarHealthScore.sql**: Queries útiles para análisis en SQL Server

---

## ✅ Checklist de Primera Ejecución

- [ ] Navegar a carpeta `scripts`
- [ ] Ejecutar `.\RelevamientoHealthScoreMant.ps1 -TestMode`
- [ ] Revisar salida en consola
- [ ] Verificar archivos `InstanceHealth.json` y `InstanceHealth.csv`
- [ ] Abrir CSV en Excel o PowerShell
- [ ] Identificar instancias críticas
- [ ] Planificar siguiente ejecución (completa o automática)

---

**🎉 ¡Listo! Ya ejecutaste tu primer relevamiento de HealthScore.**

Para ayuda adicional, consulta la documentación completa o ejecuta:
```powershell
Get-Help .\RelevamientoHealthScoreMant.ps1 -Full
```

