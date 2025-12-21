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

### Migración de Datos

3. **VaultEnterprise_Phase1_EncryptionKeys.sql**
   - Crea tabla `VaultEncryptionKeys`
   - Agrega columnas VARBINARY a Credentials
   - Ejecuta backfill de KeyId/KeyVersion

4. **VaultEnterprise_Phase1_ForeignKeys.sql**
   - Crea FK compuestas con NOCHECK
   - Valida integridad
   - Habilita CHECK constraints

5. **VaultEnterprise_Phase3_Permissions.sql**
   - Crea tablas de permisos
   - Migra Permission string a PermissionBitMask
   - ⚠️ Migración conservadora: View → Viewer (incluye Reveal)

6. **VaultEnterprise_Phase4_AuditAccessLog.sql**
   - Expande CredentialAuditLog
   - Crea CredentialAccessLog
   - Alinea timestamps a Argentina (UTC-3)

7. **VaultEnterprise_Phase7_Indexes.sql**
   - Crea índices de performance
   - NO incluye columnas legacy

### Post-Migración Gates

8. **VaultEnterprise_Recertification_RevealPermissions.sql**
   - Ejecutar 0-24h post-migración
   - Generar reporte para Security
   - Gate obligatorio antes de cerrar migración

### Cleanup (Solo después de todos los gates)

9. **VaultEnterprise_Phase8_Cleanup.sql**
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

- `Services/CryptoServiceV2.cs` - Nuevo servicio de criptografía
- `Services/ICryptoServiceV2.cs` - Interfaz
- `Services/KeyManager.cs` - Gestor de llaves
- `Services/IKeyManager.cs` - Interfaz
- `Models/VaultEncryptionKey.cs` - Modelo EF
- `Models/CredentialAccessLog.cs` - Modelo EF
- `Exceptions/CryptoValidationException.cs` - Excepción de validación

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

