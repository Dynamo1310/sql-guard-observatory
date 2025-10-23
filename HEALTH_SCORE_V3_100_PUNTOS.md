# Health Score v3.0 - Sistema de 100 Puntos

## 📋 Resumen Ejecutivo

**Cambio Principal:** Health Score actualizado de 150 puntos a **100 puntos** para mayor simplicidad e intuitividad.

**Fecha de Actualización:** Octubre 2025  
**Versión:** v3.0  
**Impacto:** PowerShell scripts, Backend API (.NET), Frontend (React), Documentación

---

## 🎯 Motivación del Cambio

### ¿Por qué 100 puntos?

1. **Más Intuitivo:** 100 puntos es el estándar universal de calificación
2. **Fácil de Interpretar:** Los porcentajes son directos (90 pts = 90%)
3. **Umbrales Claros:**
   - **≥90**: Saludable (Verde) ✅
   - **70-89**: Advertencia (Amarillo) ⚠️
   - **<70**: Crítico (Rojo) 🚨

4. **Simplicidad:** Elimina confusión al calcular porcentajes manualmente

---

## 📊 Nueva Distribución de Puntos

### Comparación v2.0 (150 pts) vs v3.0 (100 pts)

| Tier | Categoría | v2.0 | v3.0 | % del Total |
|------|-----------|------|------|-------------|
| **Tier 1** | Disponibilidad | 50 pts | **35 pts** | 35% |
| **Tier 2** | Continuidad | 40 pts | **30 pts** | 30% |
| **Tier 3** | Performance & Recursos | 40 pts | **25 pts** | 25% |
| **Tier 4** | Mantenimiento | 20 pts | **10 pts** | 10% |
| | **TOTAL** | **150 pts** | **100 pts** | 100% |

---

## 🔍 Detalle por Tier

### **Tier 1: Disponibilidad (35 pts)** 🚨

**Métricas críticas que impactan acceso inmediato a datos**

| Métrica | v2.0 | v3.0 | Criterios |
|---------|------|------|-----------|
| **Conectividad** | 20 pts | **15 pts** | • 15: Conecta + latencia ≤10ms<br>• 12-14: Latencia 10-100ms<br>• 0: Sin conexión |
| **Blocking** | 10 pts | **10 pts** | • 10: 0 sesiones bloqueadas<br>• 7: 1-3 sesiones<br>• 3: 4-10 sesiones<br>• 0: 10+ sesiones |
| **Memoria (PLE)** | 10 pts | **10 pts** | • 10: PLE ≥300 seg<br>• 7: PLE 200-299<br>• 3: PLE 100-199<br>• 0: PLE <100 |
| ~~AlwaysOn~~ | ~~10 pts~~ | ~~Movido a Tier 2~~ | - |

---

### **Tier 2: Continuidad (30 pts)** 🔄

**Estrategia de backups y alta disponibilidad**

| Métrica | v2.0 | v3.0 | Criterios |
|---------|------|------|-----------|
| **FULL Backup** | 15 pts | **12 pts** | • 12: Todas las bases con backup <24h<br>• 0: Al menos una base sin backup >24h |
| **LOG Backup** | 15 pts | **12 pts** | • 12: Bases FULL con LOG <2h<br>• 0: Al menos una base FULL sin LOG >2h |
| **AlwaysOn** | ~~Tier 1~~ | **6 pts** | • 6: N/A o sincronizado<br>• 3: Sincronización parcial<br>• 0: Desincronizado |

---

### **Tier 3: Performance & Recursos (25 pts)** ⚡

**Rendimiento de disco, I/O y queries**

| Métrica | v2.0 | v3.0 | Criterios |
|---------|------|------|-----------|
| **Disk Space** | 15 pts | **10 pts** | • 10: Volumen crítico ≥30% libre<br>• 7: 20-29% libre<br>• 3: 10-19% libre<br>• 0: <10% libre |
| **IOPS / Latencia** | 15 pts | **8 pts** | • 8: Latencia ≤10ms (SSD)<br>• 6: 11-20ms<br>• 3: 21-50ms (HDD)<br>• 0: >50ms |
| **Query Performance** | 10 pts | **7 pts** | • 7: 0 queries >30 seg<br>• 5: 1-3 queries lentos<br>• 2: 4-10 queries lentos<br>• 0: 10+ queries lentos |

---

### **Tier 4: Mantenimiento (10 pts)** 🛠️

**Tareas preventivas y monitoreo proactivo**

| Métrica | v2.0 | v3.0 | Criterios |
|---------|------|------|-----------|
| **DBCC CHECKDB** | 10 pts | **4 pts** | • 4: Ejecutado y exitoso en últimos 7 días<br>• 0: Falló o sin ejecutar >7 días |
| **Index Optimize** | 5 pts | **3 pts** | • 3: Ejecutado y exitoso en últimos 7 días<br>• 0: Falló o sin ejecutar >7 días |
| **Error Log** | 5 pts | **3 pts** | • 3: 0 errores severity ≥20 en 24h<br>• 2: 1-2 errores<br>• 0: 3+ errores |

---

## 🔧 Archivos Actualizados

### **PowerShell Scripts**

- ✅ `scripts/RelevamientoHealthScore_Consolidate.ps1`
  - Todas las funciones `Calculate-*` actualizadas a nuevos puntajes
  - `Get-HealthStatus`: Umbrales 90/70 en lugar de 135/105
  - Header actualizado a "v3.0 - 100 puntos"

### **Backend (.NET)**

- ✅ `SQLGuardObservatory.API/Services/HealthScoreService.cs`
  - `GetLatestHealthScoresAsync()`: Comentarios actualizados
  - `GetSummaryAsync()`: Umbrales SQL `>= 90`, `>= 70 AND < 90`, `< 70`
  - `GetOverviewDataAsync()`: Umbrales de instancias críticas `< 70`

### **Frontend (React)**

- ✅ `src/pages/HealthScore.tsx`
  - Descripción general: "0 a 100 puntos"
  - Umbrales visuales: 90-100 (Verde), 70-89 (Amarillo), <70 (Rojo)
  - Explicación de Tiers: Todos los puntajes individuales actualizados
  - Distribución visual: 35/30/25/10 pts
  - Progress bars: Cálculo sobre 100 en lugar de 150
  - Condiciones de color: `>= 90`, `>= 70`, `< 70`

---

## 📈 Ejemplos de Interpretación

### Ejemplo 1: Instancia "Saludable"

```
Health Score: 92/100 ✅ HEALTHY

Breakdown:
- Tier 1 (Disponibilidad):  33/35 pts  ← Excelente
- Tier 2 (Continuidad):     30/30 pts  ← Perfecto
- Tier 3 (Recursos):        22/25 pts  ← Bueno
- Tier 4 (Mantenimiento):    7/10 pts  ← Aceptable

Interpretación: Instancia en óptimas condiciones. 
Solo requiere atención menor en índices o error log.
```

### Ejemplo 2: Instancia "Warning"

```
Health Score: 75/100 ⚠️ WARNING

Breakdown:
- Tier 1 (Disponibilidad):  28/35 pts  ← Algún blocking o PLE bajo
- Tier 2 (Continuidad):     24/30 pts  ← LOG backup retrasado
- Tier 3 (Recursos):        18/25 pts  ← Latencia de disco elevada
- Tier 4 (Mantenimiento):    5/10 pts  ← CHECKDB no ejecutado

Interpretación: Requiere atención en ventana de mantenimiento.
No es crítico pero debe monitorearse.
```

### Ejemplo 3: Instancia "Critical"

```
Health Score: 45/100 🚨 CRITICAL

Breakdown:
- Tier 1 (Disponibilidad):  15/35 pts  ← Sin conexión o alta latencia
- Tier 2 (Continuidad):      0/30 pts  ← Sin backups recientes
- Tier 3 (Recursos):        22/25 pts  ← Recursos OK (ironía)
- Tier 4 (Mantenimiento):    8/10 pts  ← Mantenimiento OK

Interpretación: ¡URGENTE! Problemas graves de conectividad 
y/o backups. Requiere intervención inmediata.
```

---

## ✅ Validación del Sistema

### Verificación Matemática

```
Tier 1: 15 + 10 + 10        = 35 pts ✓
Tier 2: 12 + 12 + 6         = 30 pts ✓
Tier 3: 10 + 8 + 7          = 25 pts ✓
Tier 4: 4 + 3 + 3           = 10 pts ✓
                    TOTAL   = 100 pts ✓
```

### Escenarios de Prueba

| Escenario | Score Esperado | Status Esperado |
|-----------|----------------|-----------------|
| Todo perfecto | 100/100 | HEALTHY ✅ |
| Sin backups | ≤70 | CRITICAL 🚨 |
| Sin conexión | ≤70 | CRITICAL 🚨 |
| Disco <10% libre | ~85 | WARNING ⚠️ |
| PLE bajo (100-200) | ~87 | WARNING ⚠️ |

---

## 🚀 Despliegue

### Pasos para Aplicar v3.0

1. **SQL:** No requiere cambios de schema (las columnas siguen siendo `INT`)
2. **PowerShell:**
   ```powershell
   # Detener tasks actuales
   Get-ScheduledTask -TaskName "HealthScore*" | Disable-ScheduledTask
   
   # Ejecutar script de consolidación actualizado
   .\scripts\RelevamientoHealthScore_Consolidate.ps1
   
   # Reactivar tasks
   Get-ScheduledTask -TaskName "HealthScore*" | Enable-ScheduledTask
   ```

3. **Backend:**
   ```powershell
   cd SQLGuardObservatory.API
   dotnet publish -c Release
   # Copiar a IIS y reiniciar App Pool
   ```

4. **Frontend:**
   ```powershell
   npm run build
   # Copiar carpeta dist/ a servidor web
   ```

---

## 📚 Documentos Relacionados

- `RESUMEN_HEALTHSCORE_V2_IMPLEMENTACION.md` - Implementación v2.0 (150 pts)
- `GUIA_HEALTHSCORE_V2_PARA_DBAS.md` - Guía para DBAs junior
- `IMPLEMENTACION_HEALTHSCORE.md` - Arquitectura general

---

## 🎓 Beneficios para el Equipo

### Para DBAs Junior
- ✅ Más fácil de entender: "92% = 92 puntos"
- ✅ Umbrales memorizables: 90 (OK), 70 (Revisar)
- ✅ Cálculos mentales simples

### Para DBAs Senior
- ✅ Distribución más balanceada (35/30/25/10 vs 50/40/40/20)
- ✅ AlwaysOn en Tier 2 (Continuidad) tiene más sentido conceptual
- ✅ Tier 1 enfocado en disponibilidad pura

### Para Gerencia
- ✅ KPIs más claros: "Meta: 90% de instancias ≥90 pts"
- ✅ Comparaciones más intuitivas con estándares de la industria
- ✅ Dashboards más simples de interpretar

---

## 🏁 Conclusión

Health Score v3.0 mantiene la **misma lógica de negocio** y **criterios de evaluación** que v2.0, pero con una **escala más intuitiva y profesional de 100 puntos**.

**No hay cambios funcionales**, solo una **re-escala matemática** para mejor usabilidad.

---

**Versión:** 3.0  
**Autor:** SQL Guard Observatory Team  
**Última Actualización:** Octubre 2025

