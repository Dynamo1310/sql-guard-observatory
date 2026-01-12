# SQL Nova

Panel de Observabilidad SQL Server para Banco Supervielle.

## Descripción

SQL Nova es una herramienta interna de monitoreo y observabilidad para bases de datos SQL Server, desarrollada por el equipo de DBA de Banco Supervielle.

## Características

- **Overview**: Dashboard principal con resumen de alertas y estado general
- **Health Score**: Puntuación de salud de los servidores SQL
- **Jobs**: Monitoreo de SQL Agent Jobs
- **Discos**: Estado y uso de discos
- **Bases de Datos**: Información de bases de datos
- **Backups**: Estado de backups
- **Índices**: Análisis de índices
- **Parcheos**: Dashboard de compliance de parcheos
- **Guardias DBA**: Sistema de gestión de guardias con intercambios
- **Vault DBA**: Gestión segura de credenciales

## Tecnologías

- **Frontend**: React + TypeScript + Vite
- **UI**: shadcn/ui + Tailwind CSS
- **Backend**: .NET Core Web API
- **Base de Datos**: SQL Server

## Desarrollo Local

```sh
# Instalar dependencias
npm install

# Iniciar servidor de desarrollo
npm run dev
```

## Build

```sh
# Build de producción
npm run build

# Build de desarrollo
npm run build:dev
```

## Autor

Equipo DBA - Banco Supervielle
