# Actualización: Filtros Anidados en Página Discos

## 📋 Resumen de Cambios

Se han implementado **filtros anidados (cascading filters)** en la página de Discos y se ha agregado un **Combobox con búsqueda** para el filtro de Instancia.

## ✅ Mejoras Implementadas

### 1. **Componente Combobox Reutilizable**
- ✅ Nuevo componente: `src/components/ui/combobox.tsx`
- ✅ Permite escribir para buscar
- ✅ Basado en shadcn/ui (Command + Popover)
- ✅ Reutilizable en toda la aplicación

### 2. **Filtros Anidados (Cascading)**
Los filtros ahora están conectados entre sí:

```
Ambiente → Hosting → Instancia
                  ↓
              (Estado independiente)
```

#### **Comportamiento:**

1. **Seleccionar Ambiente:**
   - Filtra las opciones de **Hosting** disponibles para ese ambiente
   - Resetea automáticamente los filtros de Hosting e Instancia
   - Ejemplo: Si seleccionas "Producción", solo verás hostings que tengan servidores en producción

2. **Seleccionar Hosting:**
   - Filtra las opciones de **Instancia** disponibles para ese ambiente + hosting
   - Resetea automáticamente el filtro de Instancia
   - Ejemplo: Si seleccionas "OnPrem", solo verás instancias on-premises

3. **Seleccionar Instancia:**
   - Usa el **Combobox con búsqueda**
   - Puedes escribir para filtrar instancias
   - Solo muestra instancias del Ambiente + Hosting seleccionado

4. **Estado:**
   - Filtro independiente (no afecta otros filtros)
   - Permite filtrar por: Crítico, Advertencia, Saludable

### 3. **Filtrado Local Eficiente**

En lugar de llamar a la API cada vez que cambia un filtro:
- ✅ Se cargan **todos los datos una sola vez** al inicio
- ✅ Los filtros se aplican **localmente** en el cliente
- ✅ Los **KPIs se recalculan** automáticamente según los filtros
- ✅ **Mejor performance** y experiencia de usuario

## 🎯 Diferencias con la Versión Anterior

| Aspecto | Antes | Ahora |
|---------|-------|-------|
| **Filtros** | Independientes | Anidados (cascading) |
| **Instancia** | Select simple | Combobox con búsqueda |
| **Rendimiento** | API call por cada filtro | Filtrado local (1 API call) |
| **Opciones** | Todas siempre visibles | Solo las relevantes |
| **Reset automático** | Manual | Automático al cambiar filtro padre |

## 💻 Uso del Combobox

### **En la Interfaz:**

1. Click en el campo "Instancia"
2. Aparece un popup con búsqueda
3. Escribe para filtrar (ej: "SQL-PROD")
4. Click en una opción para seleccionar
5. Se cierra automáticamente

### **Código del Combobox:**

```tsx
import { Combobox, ComboboxOption } from '@/components/ui/combobox';

const options: ComboboxOption[] = [
  { value: 'All', label: 'Todas las instancias' },
  { value: 'SQL-PROD-01', label: 'SQL-PROD-01' },
  { value: 'SQL-PROD-02', label: 'SQL-PROD-02' },
];

<Combobox
  options={options}
  value={selectedInstance}
  onValueChange={setSelectedInstance}
  placeholder="Todas las instancias"
  searchPlaceholder="Buscar instancia..."
  emptyText="No se encontraron instancias"
/>
```

## 🔄 Flujo de Filtrado

### **1. Carga Inicial:**
```typescript
// Se cargan TODOS los discos una vez
const disksData = await disksApi.getDisks();
setAllDisks(disksData); // Guardar en estado
```

### **2. Calcular Opciones Disponibles:**
```typescript
// Hosting depende de Ambiente
const availableHostings = useMemo(() => {
  if (selectedAmbiente === 'All') return filters?.hostings || [];
  
  // Filtrar hostings del ambiente seleccionado
  const hostingsInAmbiente = allDisks
    .filter(d => d.ambiente === selectedAmbiente)
    .map(d => d.hosting)
    .filter((h): h is string => !!h);
  
  return [...new Set(hostingsInAmbiente)].sort();
}, [selectedAmbiente, filters, allDisks]);
```

### **3. Aplicar Filtros:**
```typescript
useEffect(() => {
  let filteredDisks = allDisks;

  if (selectedAmbiente !== 'All') {
    filteredDisks = filteredDisks.filter(d => d.ambiente === selectedAmbiente);
  }

  if (selectedHosting !== 'All') {
    filteredDisks = filteredDisks.filter(d => d.hosting === selectedHosting);
  }

  if (selectedInstance !== 'All') {
    filteredDisks = filteredDisks.filter(d => d.instanceName === selectedInstance);
  }

  if (selectedEstado !== 'All') {
    filteredDisks = filteredDisks.filter(d => d.estado === selectedEstado);
  }

  setDisks(filteredDisks);
  // Recalcular KPIs...
}, [selectedAmbiente, selectedHosting, selectedInstance, selectedEstado, allDisks]);
```

### **4. Reset Automático:**
```typescript
// Cuando cambia Ambiente → resetear Hosting e Instancia
useEffect(() => {
  setSelectedHosting('All');
  setSelectedInstance('All');
}, [selectedAmbiente]);

// Cuando cambia Hosting → resetear Instancia
useEffect(() => {
  setSelectedInstance('All');
}, [selectedHosting]);
```

## 📊 Ejemplo de Uso

### **Escenario: Buscar discos críticos en producción**

1. **Paso 1:** Seleccionar **Ambiente = "Producción"**
   - Los filtros de Hosting e Instancia se resetean automáticamente
   - Solo se muestran hostings con servidores en producción

2. **Paso 2:** Seleccionar **Hosting = "OnPrem"**
   - El filtro de Instancia se resetea
   - Solo se muestran instancias on-premises de producción

3. **Paso 3:** Escribir en **Instancia**: "SQL-PROD-01"
   - El combobox filtra las opciones mientras escribes
   - Seleccionas la instancia deseada

4. **Paso 4:** Seleccionar **Estado = "Crítico"**
   - Se muestran solo discos críticos de SQL-PROD-01

5. **Resultado:**
   - La tabla muestra discos filtrados
   - Los KPIs se actualizan automáticamente
   - "Discos Críticos" muestra el número filtrado

## 🎨 Características del Combobox

### **Ventajas sobre Select:**

✅ **Búsqueda integrada**: Escribe para filtrar opciones  
✅ **Mejor UX**: Más fácil encontrar instancias en listas largas  
✅ **Teclado**: Navegación con flechas y Enter  
✅ **Responsive**: Funciona bien en móvil  
✅ **Accesible**: Soporta lectores de pantalla  

### **Personalización:**

```tsx
<Combobox
  options={options}              // Opciones disponibles
  value={selectedValue}          // Valor seleccionado
  onValueChange={setValue}       // Callback al cambiar
  placeholder="Placeholder"      // Texto cuando no hay selección
  searchPlaceholder="Buscar..."  // Placeholder del input de búsqueda
  emptyText="Sin resultados"     // Texto cuando no hay resultados
  className="w-full"             // Clases CSS adicionales
/>
```

## 🚀 Despliegue

### **Frontend solamente (no requiere cambios en backend):**

```powershell
# Compilar
npm run build

# Desplegar
# Copiar dist/ a tu servidor web
```

### **Verificar:**

1. Acceder a la página Discos
2. Probar el flujo:
   - Seleccionar un ambiente
   - Verificar que los hostings se filtran
   - Verificar que el combobox de instancias solo muestra opciones relevantes
   - Escribir en el combobox y ver el filtrado en tiempo real
3. Verificar que los KPIs se actualizan correctamente

## 🔧 Reutilización del Combobox

El componente `Combobox` es reutilizable. Puedes usarlo en otras páginas:

### **Ejemplo en Jobs.tsx:**

```tsx
import { Combobox, ComboboxOption } from '@/components/ui/combobox';

// En lugar de Select para instancias
const instanceOptions: ComboboxOption[] = instances.map(inst => ({
  value: inst,
  label: inst
}));

<Combobox
  options={instanceOptions}
  value={selectedInstance}
  onValueChange={setSelectedInstance}
  placeholder="Todas las instancias"
  searchPlaceholder="Buscar instancia..."
/>
```

## 📝 Notas Técnicas

### **Optimizaciones:**

1. **useMemo** para calcular opciones disponibles (evita recalcular en cada render)
2. **Filtrado local** en lugar de API calls (mejor performance)
3. **Set** para eliminar duplicados en opciones
4. **useEffect** con dependencias correctas para evitar loops infinitos

### **Manejo de Estados:**

- `allDisks`: Datos completos sin filtrar (fuente de verdad)
- `disks`: Datos filtrados que se muestran en la tabla
- `summary`: KPIs calculados basados en `disks` filtrados

### **Componentes shadcn/ui usados:**

- ✅ Command (búsqueda y navegación)
- ✅ Popover (dropdown)
- ✅ Button (trigger)
- ✅ Select (otros filtros)

## 🐛 Troubleshooting

### **El combobox no muestra opciones:**
**Solución:** Verificar que `instanceOptions` tenga el formato correcto:
```tsx
{ value: string, label: string }[]
```

### **Los filtros no se resetean:**
**Solución:** Verificar que los `useEffect` de reset tengan las dependencias correctas

### **Performance lento con muchos datos:**
**Solución:** Considerar virtualización o paginación si hay > 1000 registros

### **El combobox no cierra al seleccionar:**
**Solución:** Verificar que `setOpen(false)` se llama en `onSelect`

## ✨ Mejoras Futuras Sugeridas

1. **Guardar filtros en URL** (query parameters) para compartir links
2. **Recordar última selección** en localStorage
3. **Botón "Limpiar filtros"** para resetear todos
4. **Indicador visual** de cuántos filtros están activos
5. **Virtualizaci ón** del combobox para > 1000 instancias

---

**Actualizado por:** Asistente IA  
**Fecha:** 21 de Octubre, 2025  
**Estado:** ✅ Completo y Funcional

