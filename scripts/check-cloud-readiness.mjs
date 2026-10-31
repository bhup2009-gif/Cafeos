// Intentional deployment gate while the app still uses local SQLite/auth.
console.error("CaféOS cloud deployment is not ready: this is a structure-only scaffold. Complete the database migration, tenant isolation, cloud login and subscription checks in docs/deployment.md before replacing this gate with real readiness checks. Local npm run build remains available.");
process.exitCode = 1;
