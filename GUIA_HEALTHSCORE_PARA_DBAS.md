# Guía del Health Score - Para DBAs Junior

## 🎯 **¿Qué es el Health Score?**

El **Health Score** es un número del **0 al 100** que resume la salud de una instancia SQL Server. Piensa en él como un **examen médico** para tus servidores.

```
100 pts = Instancia perfecta 😊
70-89  = Instancia con advertencias ⚠️
0-69   = Instancia crítica 🚨
```

---

## 📊 **¿Cómo se Calcula?**

El Health Score se calcula sumando puntos de **5 categorías**:

### **1️⃣ Conectividad (30 puntos) - "¿Está vivo el servidor?"**

```
┌─────────────────────────────────────────────┐
│ ¿Puedo conectarme?                          │
│   SÍ, rápido (<3 seg)  → 30 puntos ✅      │
│   SÍ, lento (3-5 seg)  → 15 puntos ⚠️      │
│   NO                   → 0 puntos  🚨      │
└─────────────────────────────────────────────┘
```

**¿Por qué importa?**
- Si no puedes conectarte, **nada más importa**
- Latencia alta = usuarios esperando = aplicaciones lentas

**Ejemplo:**
- SQLPROD01 responde en 25ms → ✅ 30 puntos
- SQLTEST02 responde en 4.5s → ⚠️ 15 puntos (¿problemas de red?)
- SQLDEV03 no responde → 🚨 0 puntos (¡servidor caído!)

---

### **2️⃣ Backups (25 puntos) - "¿Puedo recuperar datos si algo falla?"**

```
┌─────────────────────────────────────────────┐
│ FULL Backup (último < 25 horas)             │
│   ✅ OK  → 10 puntos                        │
│   ❌ Atrasado → 0 puntos                    │
│                                             │
│ LOG Backup (último < 2 horas)               │
│   ✅ OK  → 10 puntos                        │
│   ❌ Atrasado → 0 puntos                    │
│                                             │
│ CHECKDB (último < 7 días)                   │
│   ✅ OK  → 5 puntos                         │
│   ❌ Atrasado → 0 puntos                    │
└─────────────────────────────────────────────┘
```

**¿Por qué importa?**
- **FULL Backup**: Puedes restaurar todo hasta esa fecha
- **LOG Backup**: Puedes recuperar hasta hace 2 horas (o menos)
- **CHECKDB**: Verifica que la BD no está corrupta

**Ejemplo Real:**
```
Caso 1: Producción con backups OK
  FULL: Hoy 02:00 AM  ✅ (hace 10 horas) → 10 pts
  LOG:  Hoy 11:45 AM  ✅ (hace 15 min)   → 10 pts
  CHECKDB: Domingo    ✅ (hace 3 días)   → 5 pts
  Total: 25/25 puntos 😊

Caso 2: Desarrollo sin backups
  FULL: Hace 3 días   ❌ (>25h)          → 0 pts
  LOG:  N/A           ❌ (sin log backup) → 0 pts
  CHECKDB: Hace 2 sem ❌ (>7 días)       → 0 pts
  Total: 0/25 puntos 🚨
  
  ⚠️ Si esta instancia se cae, ¡pierdes 3 días de datos!
```

---

### **3️⃣ Discos (20 puntos) - "¿Tengo espacio?"**

```
┌─────────────────────────────────────────────┐
│ % Espacio Libre en el disco más lleno:      │
│   ≥20% libre  → 20 puntos ✅               │
│   10-20% libre → 10 puntos ⚠️              │
│   5-10% libre  → 5 puntos  🚨              │
│   <5% libre    → 0 puntos  💥 ¡EMERGENCIA!│
└─────────────────────────────────────────────┘
```

**¿Por qué importa?**
- **Disco lleno = SQL Server se detiene** (no puede escribir logs)
- Causa errores en aplicaciones
- Usuarios no pueden trabajar

**Ejemplo Real:**
```
SQLPROD01 tiene 3 discos:
  C: 45% libre  ✅
  D: 65% libre  ✅
  E: 8% libre   🚨 ← Este es el problema

Health Score usa el PEOR disco (E: 8%)
→ 5 puntos de 20 posibles

Acción: Expandir disco E o borrar archivos viejos
```

**Calculadora Rápida:**
```
100 GB total, 15 GB libres = 15% libre → 10 puntos ⚠️
500 GB total, 50 GB libres = 10% libre → 10 puntos ⚠️
1 TB total, 300 GB libres = 30% libre → 20 puntos ✅
```

---

### **4️⃣ AlwaysOn (15 puntos) - "¿Está sincronizado con la réplica?"**

**Solo aplica si tienes AlwaysOn / Availability Groups**

```
┌─────────────────────────────────────────────┐
│ Estado de Sincronización:                   │
│   Synchronized (OK)     → 15 puntos ✅     │
│   Redo queue alto       → 10 puntos ⚠️     │
│   Lagging (atrasado)    → 5 puntos  🚨     │
│   NOT_SYNC              → 0 puntos  💥     │
│                                             │
│ Si NO tienes AlwaysOn   → 15 puntos ✅     │
│   (neutro, no penaliza)                     │
└─────────────────────────────────────────────┘
```

**¿Por qué importa?**
- **AlwaysOn** = Alta Disponibilidad (si el primario falla, el secundario toma el control)
- Si está **NOT_SYNC**, pierdes la protección de HA
- Si hay **lag**, el secundario está atrasado (pérdida de datos en failover)

**Ejemplo:**
```
AG: AGPROD (2 nodos)
  SQLPROD01 (Primary):   Synchronized ✅ → 15 pts
  SQLPROD02 (Secondary): Synchronized ✅ → 15 pts

Si SQLPROD01 falla → SQLPROD02 toma control sin pérdida de datos
```

---

### **5️⃣ Errorlog (10 puntos) - "¿Hay errores serios?"**

```
┌─────────────────────────────────────────────┐
│ Errores Severity 20+ en últimas 24 horas:   │
│   0 errores   → 10 puntos ✅               │
│   1-4 errores → 5 puntos  ⚠️               │
│   5+ errores  → 0 puntos  🚨               │
└─────────────────────────────────────────────┘
```

**¿Qué son errores Severity 20+?**
- **Severity 20**: Fatal error (conexión rota)
- **Severity 21**: Database error
- **Severity 22**: Table integrity error
- **Severity 23**: Database integrity error
- **Severity 24**: Hardware error
- **Severity 25**: Sistema error fatal

**Ejemplo Real:**
```
Errorlog de SQLPROD01:
  2025-10-23 08:15 - Severity 14: Login failed (normal ❌ ignorar)
  2025-10-23 10:30 - Severity 20: Fatal error (🚨 PROBLEMA)
  2025-10-23 11:00 - Severity 21: Database suspected (🚨 PROBLEMA)

Total: 2 errores sev 20+ → 5 puntos de 10
  
Acción: Investigar errorlog, revisar integridad de BD
```

---

## 🎓 **Interpretación del Health Score**

### **90-100 puntos = Healthy 😊**
```
Todo está bien:
✅ Conecta rápido
✅ Backups al día
✅ Discos con espacio
✅ AlwaysOn sincronizado
✅ Sin errores críticos

Acción: Mantener monitoreo rutinario
```

### **70-89 puntos = Warning ⚠️**
```
Hay problemas menores que requieren atención:
⚠️ Backup FULL atrasado 30 horas
⚠️ Disco al 18% libre
⚠️ 2 errores severity 20 en errorlog

Acción: Revisar y corregir en las próximas 24-48h
```

### **0-69 puntos = Critical 🚨**
```
Problemas serios que requieren atención INMEDIATA:
🚨 Disco al 3% libre (¡se va a llenar!)
🚨 Sin backup FULL hace 5 días
🚨 AlwaysOn NOT_SYNC (sin protección HA)
🚨 10+ errores severity 20

Acción: Atender AHORA, puede causar outage
```

---

## 📋 **Checklist de Acción por Score**

### **Si tu instancia tiene <70 puntos:**

1. **Primero: Ver el breakdown** (¿qué categoría tiene 0 puntos?)
2. **Acciones por categoría:**

```
❌ Conectividad 0 pts:
   → Verificar si el servidor está up
   → Revisar firewall/red
   → Reiniciar servicio SQL si es necesario

❌ Backups 0 pts:
   → Ejecutar backup FULL manualmente YA
   → Verificar por qué falló el job
   → Ajustar schedule si es necesario

❌ Discos 0 pts:
   → Borrar backups viejos
   → Mover archivos a otro disco
   → Expandir disco (si es VM)
   → Shrink de logs (CUIDADO, solo si es seguro)

❌ AlwaysOn 0 pts:
   → Verificar estado del AG: 
     SELECT * FROM sys.dm_hadr_availability_replica_states
   → Reiniciar sincronización si es necesario
   → Contactar a DBA Senior si no resuelves

❌ Errorlog 0 pts:
   → Abrir SSMS → Management → SQL Server Logs
   → Filtrar por Severity >= 20
   → Investigar causa raíz
   → Ejecutar DBCC CHECKDB si hay errores de integridad
```

---

## 🔍 **¿Cómo Ver el Breakdown?**

En el dashboard, cada instancia muestra:

```
┌──────────────────────────────────────────┐
│ SQLPROD01                    Score: 85   │
├──────────────────────────────────────────┤
│ Breakdown:                               │
│  Availability:  30/30 ✅                │
│  Backups:       15/25 ⚠️ (CHECKDB falta)│
│  Disks:         20/20 ✅                │
│  AlwaysOn:      15/15 ✅                │
│  Errorlog:       5/10 ⚠️ (2 errores)    │
└──────────────────────────────────────────┘
```

**Interpretación:**
- Total: 85/100 = Warning
- Problema 1: CHECKDB atrasado (faltan 10 puntos)
- Problema 2: 2 errores severity 20 (faltan 5 puntos)
- Acción: Ejecutar CHECKDB + revisar errorlog

---

## 🎯 **Preguntas Frecuentes**

### **P: ¿Cada cuánto se actualiza el Health Score?**
R: **Cada 15 minutos** el score final, pero:
- Conectividad/Discos: cada 5 min
- Backups: cada 30 min
- Maintenance: cada 4 horas

### **P: ¿Por qué mi instancia de desarrollo tiene score bajo?**
R: Desarrollo suele tener:
- Backups menos frecuentes (aceptable)
- Sin AlwaysOn (aceptable)
- Pero DEBE tener espacio en disco

Tip: Puedes crear alertas solo para Producción

### **P: ¿Qué score debo tener en producción?**
R: **Mínimo 90 puntos**. Idealmente 95-100.

### **P: Mi instancia tiene 88 puntos, ¿es grave?**
R: No es grave, pero identifica qué categoría está baja:
- Si es CHECKDB: Programar para el fin de semana
- Si es Backup: Arreglar HOY
- Si es Disco: Planear expansión esta semana

### **P: ¿Puedo personalizar los pesos de las categorías?**
R: Sí, pero requiere modificar el código. Consulta con el equipo senior.

---

## 📊 **Tendencias (Gráficos)**

El Health Score no solo muestra el valor actual, sino también **tendencias**:

```
Health Score en últimas 24h:
    
100 ├────────────●────●────────────●
 90 ├─────●────/                    
 80 ├────/                           
 70 ├───●                            
    └────────────────────────────────
     6am  9am  12pm  3pm  6pm  9pm
```

**Interpretación:**
- 6am: 70 pts (backup atrasado)
- 9am: 80 pts (backup ejecutado)
- 12pm-9pm: 95-100 pts (todo OK)

**Tendencia: Mejorando** ✅

Si ves tendencia **bajando** → Investigar antes de que sea crítico

---

## ✅ **Resumen para DBAs Junior**

| Categoría | ¿Qué mide? | ¿Qué hacer si está en 0? |
|-----------|------------|--------------------------|
| **Conectividad** | ¿Responde el servidor? | Verificar servicio SQL, red, firewall |
| **Backups** | ¿Puedo recuperar datos? | Ejecutar backup manualmente, revisar jobs |
| **Discos** | ¿Tengo espacio? | Borrar archivos viejos, expandir disco |
| **AlwaysOn** | ¿Está sincronizado? | Verificar AG, reiniciar sincronización |
| **Errorlog** | ¿Hay errores serios? | Revisar errorlog, ejecutar DBCC CHECKDB |

**Regla de Oro:**
```
Score ≥90: Monitoreo rutinario
Score 70-89: Revisar en 24-48h
Score <70: Atender AHORA
```

**¿Dudas?**
- Consulta la documentación técnica: `IMPLEMENTACION_HEALTHSCORE.md`
- Contacta al DBA Senior de guardia
- Revisa logs en: `C:\HealthScore\Logs\`

---

**Versión:** 1.0  
**Para:** DBAs Junior y Operadores  
**Autor:** SQL Guard Observatory Team

