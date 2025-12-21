# Vault Enterprise v2.1.1 - Scripts de Migración

## Descripción

Este conjunto de scripts implementa la migración enterprise-grade del Vault de Credenciales según el plan v2.1.1.

## Orden de Ejecución

Ejecutar los scripts en el siguiente orden:

### Pre-Implementación

1. **VaultEnterprise_PreImplementation_Checklist.sql**
   - Ejecutar ANTES de cualquier migración
   - Valida infraestructura, schema, datos crypto
   - Todos los checks deben pasar (PASS)

2. **VaultEnterprise_Phase0_Prerequisites.sql**
   - Crea función `fn_GetArgentinaTimeOffset()`
   - Crea procedimiento `sp_DropDefaultConstraintSafe`
   - Crea tablas de logging

### Migración de Schema

3. **VaultEnterprise_Phase1_EncryptionKeys.sql**
   - Crea tabla `VaultEncryptionKeys`

4. **VaultEnterprise_Phase1_InitialKey.sql**
   - Crea la primera llave de cifrado activa
   - **Requerido antes de backfill**

5. **VaultEnterprise_Phase1_ForeignKeys.sql**
   - Agrega columnas VARBINARY a Credentials
   - Crea FK compuestas con NOCHECK
   - Valida integridad

6. **VaultEnterprise_Phase3_Permissions.sql**
   - Crea tablas de permisos
   - Migra Permission string a PermissionBitMask
   - ⚠️ Migración conservadora: View → Viewer (incluye Reveal)

7. **VaultEnterprise_Phase4_AuditAccessLog.sql**
   - Expande CredentialAuditLog
   - Crea CredentialAccessLog
   - Alinea timestamps a Argentina (UTC-3)

8. **VaultEnterprise_Phase7_Indexes.sql**
   - Crea índices de performance
   - NO incluye columnas legacy

---

## ⏸️ PAUSA OBLIGATORIA - Backfill y Validación

**Antes de ejecutar Phase8, se debe completar el backfill de datos:**

### Opción A: Backfill via API (Recomendado)

```bash
# 1. Verificar estado actual
GET /api/VaultMigration/status

# 2. Ejecutar backfill
POST /api/VaultMigration/backfill?batchSize=100

# 3. Validar credenciales migradas
GET /api/VaultMigration/validate

# 4. Verificar si puede proceder con cleanup
GET /api/VaultMigration/can-cleanup
```

### Opción B: Backfill via SQL (Solo validación)

9. **VaultEnterprise_Phase2_Backfill.sql**
   - Crea vistas de monitoreo
   - `EXEC sp_BackfillReport` - Ver estado
   - `EXEC sp_ValidatePreCleanup` - Verificar antes de Phase8

### Checklist Pausa Obligatoria

- [ ] Deploy de aplicación con dual-read habilitado
- [ ] Llave inicial creada (Phase1_InitialKey.sql)
- [ ] Backfill ejecutado (`POST /api/VaultMigration/backfill`)
- [ ] Todas las credenciales migradas (`GET /api/VaultMigration/status` → PendingCredentials = 0)
- [ ] Validación exitosa (`GET /api/VaultMigration/validate` → AllValid = true)
- [ ] `EXEC sp_ValidatePreCleanup` → CanProceed = 1

---

### Post-Migración Gates

10. **VaultEnterprise_Recertification_RevealPermissions.sql**
    - Ejecutar 0-24h post-migración
    - Generar reporte para Security
    - Gate obligatorio antes de cerrar migración

### Cleanup (Solo después de todos los gates)

11. **VaultEnterprise_Phase8_Cleanup.sql**
    - Elimina columnas legacy
    - Renombra columnas VARBINARY
    - Rebuild de índices
    - ⚠️ EJECUTAR SOLO después de Deploy 2 (single-read)

## Documentación Operativa

- **VaultEnterprise_Runbook_KeyRotation.sql**
  - Runbook para rotación de llaves
  - Incluye procedimientos de rollback

## Checklist Consolidado

### Pre-Implementación (GO/NO-GO)
- [ ] sp_DropDefaultConstraintSafe creado
- [ ] fn_GetArgentinaTimeOffset creada
- [ ] Backup FULL completado y verificado
- [ ] Pre-Implementation Checklist ejecutado (todos PASS)
- [ ] Sign-off de DBA, Security, Dev Lead

### Post-Migración Gates
- [ ] **GATE 1:** Backfill counters = 0
- [ ] **GATE 2:** FK compuestas en WITH CHECK
- [ ] **GATE 3:** Recertificación de Reveal completada y firmada por Security
- [ ] **GATE 4:** Deploy 2 (single-read) exitoso
- [ ] **GATE 5:** Tests de regresión pasan

### Cierre de Migración
- [ ] Columnas legacy eliminadas
- [ ] Índices rebuild completado
- [ ] Documentación operativa actualizada

## Archivos C# Relacionados

### Criptografía Enterprise
- `Services/CryptoServiceV2.cs` - Nuevo servicio de criptografía
- `Services/ICryptoServiceV2.cs` - Interfaz
- `Services/KeyManager.cs` - Gestor de llaves
- `Services/IKeyManager.cs` - Interfaz
- `Exceptions/CryptoValidationException.cs` - Excepción de validación

### Dual-Read y Backfill
- `Services/DualReadCryptoService.cs` - Servicio dual-read (legacy + enterprise)
- `Services/IDualReadCryptoService.cs` - Interfaz
- `Services/BackfillService.cs` - Servicio de backfill
- `Services/IBackfillService.cs` - Interfaz
- `Controllers/VaultMigrationController.cs` - API de migración

### Modelos
- `Models/VaultEncryptionKey.cs` - Modelo EF para llaves
- `Models/CredentialAccessLog.cs` - Modelo EF para access log
- `Models/Credential.cs` - Actualizado con columnas enterprise

## Notas Importantes

### SQL Server 2017
- NO usar `DROP CONSTRAINT IF EXISTS` (no soportado)
- Usar `sp_DropDefaultConstraintSafe` en su lugar

### Timestamps
- Todos los timestamps en hora Argentina (UTC-3)
- Usar `dbo.fn_GetArgentinaTimeOffset()` para defaults

### Permisos
- View → Viewer (ViewMetadata + RevealSecret) por compatibilidad
- Ejecutar recertificación obligatoria post-migración

### Rotación de Llaves
- NUNCA crear nuevo KeyId para purpose existente
- Rotación = incrementar KeyVersion

