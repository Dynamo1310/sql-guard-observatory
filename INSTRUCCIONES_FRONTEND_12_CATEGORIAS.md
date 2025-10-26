# 📋 Instrucciones: Actualizar HealthScore.tsx para 12 Categorías

## 🎯 Objetivo
Actualizar el componente `HealthScore.tsx` para reflejar las **12 categorías** del Health Score v3.0 FINAL, eliminando Conectividad y agregando LogChain, DatabaseStates y Autogrowth.

---

## ✏️ Cambios Requeridos

### 1. **Sección "10 Weighted Categories" (Líneas ~180-350)**

Actualizar las categorías mostradas en la explicación:

**❌ ELIMINAR:**
```tsx
<div className="flex items-center gap-2">
  <Activity className="h-5 w-5 text-blue-600" />
  <span className="font-medium">Conectividad (10%)</span>
</div>
```

**✅ AGREGAR (en orden):**

**TAB 1: Availability & DR (40%)**
```tsx
{/* 1. Backups (18%) - Ya existe, mantener */}

{/* 2. AlwaysOn (14%) - Ya existe, mantener */}

{/* 3. Log Chain (5%) - NUEVO */}
<div className="border-l-4 border-l-amber-500 pl-4 py-2">
  <div className="flex items-center gap-2 mb-2">
    <AlertCircle className="h-5 w-5 text-amber-600" />
    <span className="font-medium">Log Chain Integrity (5%)</span>
  </div>
  <p className="text-sm text-muted-foreground">
    Verifica la integridad de la cadena de respaldo de logs de transacciones. Crítico para point-in-time recovery (PITR).
  </p>
  <ul className="text-sm text-muted-foreground mt-1 ml-4 list-disc">
    <li>DBs con log chain roto</li>
    <li>Tiempo desde último log backup</li>
    <li>Databases en FULL sin log backups</li>
  </ul>
</div>

{/* 4. Database States (3%) - NUEVO */}
<div className="border-l-4 border-l-red-500 pl-4 py-2">
  <div className="flex items-center gap-2 mb-2">
    <AlertTriangle className="h-5 w-5 text-red-600" />
    <span className="font-medium">Database States (3%)</span>
  </div>
  <p className="text-sm text-muted-foreground">
    Detecta databases en estados problemáticos (OFFLINE, SUSPECT, EMERGENCY, etc.) y páginas corruptas (suspect pages).
  </p>
  <ul className="text-sm text-muted-foreground mt-1 ml-4 list-disc">
    <li>DBs Offline/Suspect/Emergency</li>
    <li>Recovery Pending</li>
    <li>Suspect Pages</li>
  </ul>
</div>
```

**TAB 2: Performance (35%)** - Actualizar pesos:
```tsx
{/* 5. CPU (10%) - Ya existe */}
{/* 6. Memoria (8%) - ACTUALIZAR peso de 7% a 8% */}
{/* 7. I/O (10%) - Ya existe */}
{/* 8. Discos (7%) - ACTUALIZAR peso de 8% a 7% */}
```

**TAB 3: Maintenance & Config (25%)**
```tsx
{/* 9. Errores Críticos (7%) - Ya existe */}
{/* 10. Mantenimientos (5%) - ACTUALIZAR peso de 6% a 5% */}
{/* 11. Config & TempDB (8%) - ACTUALIZAR peso de 10% a 8% */}

{/* 12. Autogrowth & Capacity (5%) - NUEVO */}
<div className="border-l-4 border-l-yellow-500 pl-4 py-2">
  <div className="flex items-center gap-2 mb-2">
    <TrendingUp className="h-5 w-5 text-yellow-600" />
    <span className="font-medium">Autogrowth & Capacity (5%)</span>
  </div>
  <p className="text-sm text-muted-foreground">
    Monitorea eventos de autogrowth excesivos y archivos cerca del límite de maxsize. Previene problemas de capacidad.
  </p>
  <ul className="text-sm text-muted-foreground mt-1 ml-4 list-disc">
    <li>Autogrowth events (últimas 24h)</li>
    <li>Archivos cerca del maxsize (&gt;80%)</li>
    <li>Configuración de growth inadecuada</li>
  </ul>
</div>
```

---

### 2. **Category Contributions Grid (Líneas ~500-650)**

Actualizar el grid de contribuciones en el row expandido:

**❌ ELIMINAR:**
```tsx
<div className="bg-gradient-to-br from-blue-500/10 to-blue-500/5 border border-blue-500/30 rounded p-2 text-center">
  <Activity className="h-3 w-3 text-blue-600 mx-auto mb-1" />
  <p className="text-lg font-mono font-bold text-blue-600">{score.conectividadContribution || 0}<span className="text-xs">/10</span></p>
  <p className="text-[10px] text-muted-foreground">Connect</p>
</div>
```

**✅ AGREGAR:**

Cambiar el grid a `grid-cols-4` (3 filas × 4 columnas = 12 categorías):

```tsx
<div className="grid grid-cols-4 gap-2">
  {/* Fila 1: Availability & DR */}
  <div className="bg-gradient-to-br from-green-500/10 to-green-500/5 border border-green-500/30 rounded p-2 text-center">
    <Database className="h-3 w-3 text-green-600 mx-auto mb-1" />
    <p className="text-lg font-mono font-bold text-green-600">{score.backupsContribution || 0}<span className="text-xs">/18</span></p>
    <p className="text-[10px] text-muted-foreground">Backups</p>
  </div>
  <div className="bg-gradient-to-br from-purple-500/10 to-purple-500/5 border border-purple-500/30 rounded p-2 text-center">
    <Shield className="h-3 w-3 text-purple-600 mx-auto mb-1" />
    <p className="text-lg font-mono font-bold text-purple-600">{score.alwaysOnContribution || 0}<span className="text-xs">/14</span></p>
    <p className="text-[10px] text-muted-foreground">AlwaysOn</p>
  </div>
  <div className="bg-gradient-to-br from-amber-500/10 to-amber-500/5 border border-amber-500/30 rounded p-2 text-center">
    <AlertCircle className="h-3 w-3 text-amber-600 mx-auto mb-1" />
    <p className="text-lg font-mono font-bold text-amber-600">{score.logChainContribution || 0}<span className="text-xs">/5</span></p>
    <p className="text-[10px] text-muted-foreground">LogChain</p>
  </div>
  <div className="bg-gradient-to-br from-red-500/10 to-red-500/5 border border-red-500/30 rounded p-2 text-center">
    <AlertTriangle className="h-3 w-3 text-red-600 mx-auto mb-1" />
    <p className="text-lg font-mono font-bold text-red-600">{score.databaseStatesContribution || 0}<span className="text-xs">/3</span></p>
    <p className="text-[10px] text-muted-foreground">DB States</p>
  </div>

  {/* Fila 2: Performance */}
  <div className="bg-gradient-to-br from-orange-500/10 to-orange-500/5 border border-orange-500/30 rounded p-2 text-center">
    <Cpu className="h-3 w-3 text-orange-600 mx-auto mb-1" />
    <p className="text-lg font-mono font-bold text-orange-600">{score.cpuContribution || 0}<span className="text-xs">/10</span></p>
    <p className="text-[10px] text-muted-foreground">CPU</p>
  </div>
  <div className="bg-gradient-to-br from-pink-500/10 to-pink-500/5 border border-pink-500/30 rounded p-2 text-center">
    <MemoryStick className="h-3 w-3 text-pink-600 mx-auto mb-1" />
    <p className="text-lg font-mono font-bold text-pink-600">{score.memoriaContribution || 0}<span className="text-xs">/8</span></p>
    <p className="text-[10px] text-muted-foreground">Memory</p>
  </div>
  <div className="bg-gradient-to-br from-cyan-500/10 to-cyan-500/5 border border-cyan-500/30 rounded p-2 text-center">
    <Zap className="h-3 w-3 text-cyan-600 mx-auto mb-1" />
    <p className="text-lg font-mono font-bold text-cyan-600">{score.ioContribution || 0}<span className="text-xs">/10</span></p>
    <p className="text-[10px] text-muted-foreground">I/O</p>
  </div>
  <div className="bg-gradient-to-br from-yellow-500/10 to-yellow-500/5 border border-yellow-500/30 rounded p-2 text-center">
    <HardDrive className="h-3 w-3 text-yellow-600 mx-auto mb-1" />
    <p className="text-lg font-mono font-bold text-yellow-600">{score.discosContribution || 0}<span className="text-xs">/7</span></p>
    <p className="text-[10px] text-muted-foreground">Disk</p>
  </div>

  {/* Fila 3: Maintenance & Config */}
  <div className="bg-gradient-to-br from-red-500/10 to-red-500/5 border border-red-500/30 rounded p-2 text-center">
    <XCircle className="h-3 w-3 text-red-600 mx-auto mb-1" />
    <p className="text-lg font-mono font-bold text-red-600">{score.erroresCriticosContribution || 0}<span className="text-xs">/7</span></p>
    <p className="text-[10px] text-muted-foreground">Errors</p>
  </div>
  <div className="bg-gradient-to-br from-teal-500/10 to-teal-500/5 border border-teal-500/30 rounded p-2 text-center">
    <Wrench className="h-3 w-3 text-teal-600 mx-auto mb-1" />
    <p className="text-lg font-mono font-bold text-teal-600">{score.mantenimientosContribution || 0}<span className="text-xs">/5</span></p>
    <p className="text-[10px] text-muted-foreground">Maint</p>
  </div>
  <div className="bg-gradient-to-br from-indigo-500/10 to-indigo-500/5 border border-indigo-500/30 rounded p-2 text-center">
    <Settings className="h-3 w-3 text-indigo-600 mx-auto mb-1" />
    <p className="text-lg font-mono font-bold text-indigo-600">{score.configuracionTempdbContribution || 0}<span className="text-xs">/8</span></p>
    <p className="text-[10px] text-muted-foreground">Config</p>
  </div>
  <div className="bg-gradient-to-br from-yellow-500/10 to-yellow-500/5 border border-yellow-500/30 rounded p-2 text-center">
    <TrendingUp className="h-3 w-3 text-yellow-600 mx-auto mb-1" />
    <p className="text-lg font-mono font-bold text-yellow-600">{score.autogrowthContribution || 0}<span className="text-xs">/5</span></p>
    <p className="text-[10px] text-muted-foreground">Autogrowth</p>
  </div>
</div>
```

---

### 3. **Tabs de Detalles (Líneas ~700-1200)**

**❌ ELIMINAR:**
- Todo el código relacionado con `conectividadDetails`

**✅ ACTUALIZAR:**

**Tab 1: Availability & DR** - Agregar LogChain y DatabaseStates:

```tsx
<TabsContent value="availability" className="mt-4 space-y-3">
  {/* Conectividad - ELIMINAR COMPLETAMENTE */}
  
  {/* Backups - Mantener */}
  
  {/* AlwaysOn - Mantener */}
  
  {/* Log Chain - NUEVO */}
  <Card className="pb-2">
    <CardHeader className="py-2">
      <CardTitle className="text-sm font-medium flex items-center gap-2">
        <AlertCircle className="h-4 w-4 text-amber-600" />
        Log Chain
      </CardTitle>
    </CardHeader>
    <CardContent className="space-y-2 py-2">
      {details.logChainDetails ? (
        <>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Broken Chains:</span>
            <Badge variant={details.logChainDetails.brokenChainCount > 0 ? "destructive" : "default"}>
              {details.logChainDetails.brokenChainCount}
            </Badge>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Full DBs sin Log Backup:</span>
            <Badge variant={details.logChainDetails.fullDBsWithoutLogBackup > 0 ? "outline" : "default"}>
              {details.logChainDetails.fullDBsWithoutLogBackup}
            </Badge>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Max Horas sin Log:</span>
            <span className="font-medium">{details.logChainDetails.maxHoursSinceLogBackup}h</span>
          </div>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">Sin datos</p>
      )}
    </CardContent>
  </Card>

  {/* Database States - NUEVO */}
  <Card className="pb-2">
    <CardHeader className="py-2">
      <CardTitle className="text-sm font-medium flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 text-red-600" />
        Database States
      </CardTitle>
    </CardHeader>
    <CardContent className="space-y-2 py-2">
      {details.databaseStatesDetails ? (
        <>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Offline:</span>
            <Badge variant={details.databaseStatesDetails.offlineCount > 0 ? "destructive" : "default"}>
              {details.databaseStatesDetails.offlineCount}
            </Badge>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Suspect:</span>
            <Badge variant={details.databaseStatesDetails.suspectCount > 0 ? "destructive" : "default"}>
              {details.databaseStatesDetails.suspectCount}
            </Badge>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Emergency:</span>
            <Badge variant={details.databaseStatesDetails.emergencyCount > 0 ? "destructive" : "default"}>
              {details.databaseStatesDetails.emergencyCount}
            </Badge>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Suspect Pages:</span>
            <Badge variant={details.databaseStatesDetails.suspectPageCount > 0 ? "destructive" : "default"}>
              {details.databaseStatesDetails.suspectPageCount}
            </Badge>
          </div>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">Sin datos</p>
      )}
    </CardContent>
  </Card>

  {/* Maintenance - Mantener */}
</TabsContent>
```

**Tab 3: Errors & Config** - Agregar Autogrowth:

```tsx
<TabsContent value="errors" className="mt-4 space-y-3">
  {/* Errores Críticos - Mantener */}
  
  {/* Config & TempDB - Mantener */}
  
  {/* Autogrowth - NUEVO */}
  <Card className="pb-2">
    <CardHeader className="py-2">
      <CardTitle className="text-sm font-medium flex items-center gap-2">
        <TrendingUp className="h-4 w-4 text-yellow-600" />
        Autogrowth & Capacity
      </CardTitle>
    </CardHeader>
    <CardContent className="space-y-2 py-2">
      {details.autogrowthDetails ? (
        <>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Autogrowth (24h):</span>
            <Badge variant={details.autogrowthDetails.autogrowthEventsLast24h > 100 ? "destructive" : details.autogrowthDetails.autogrowthEventsLast24h > 50 ? "outline" : "default"}>
              {details.autogrowthDetails.autogrowthEventsLast24h}
            </Badge>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Files Near Limit:</span>
            <Badge variant={details.autogrowthDetails.filesNearLimit > 0 ? "destructive" : "default"}>
              {details.autogrowthDetails.filesNearLimit}
            </Badge>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Worst % of Max:</span>
            <span className="font-medium">{details.autogrowthDetails.worstPercentOfMax.toFixed(1)}%</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Bad Growth Config:</span>
            <Badge variant={details.autogrowthDetails.filesWithBadGrowth > 0 ? "destructive" : "default"}>
              {details.autogrowthDetails.filesWithBadGrowth}
            </Badge>
          </div>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">Sin datos</p>
      )}
    </CardContent>
  </Card>
</TabsContent>
```

---

## ✅ Resumen de Cambios

1. **Eliminar:** Conectividad de todas las secciones
2. **Agregar:** 3 nuevas categorías (LogChain, DatabaseStates, Autogrowth)
3. **Actualizar:** Pesos de algunas categorías (Memoria 8%, Discos 7%, Mantenimientos 5%, Config 8%)
4. **Reorganizar:** Grid de contribuciones a 4×3 (12 categorías)
5. **Mantener:** Toda la lógica de sorting, filtros, y expansión de rows

---

## 🎨 Iconos Usados (Importar desde lucide-react)

Ya están importados en la línea 3, solo asegurarse de que estén todos:
- `AlertCircle` (Log Chain)
- `AlertTriangle` (Database States)
- `TrendingUp` (Autogrowth)

---

## 📦 Resultado Final

- **12 categorías balanceadas**
- **3 tabs × 4 columnas** en el layout de contribuciones
- **Grid 4×3** perfecto sin espacios vacíos
- **UI profesional y consistente**

