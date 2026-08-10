# DataLens

## Run

1. Copy `.env.example` to `.env` and set `DATABASE_URL` and `JWT_SECRET`.
2. Install packages with `npm.cmd install`.
3. Start with `npm.cmd start`.

## PostgreSQL data

The app creates three tables on startup:

- `users` — account name, email, secure password hash, registration and last-login time.
- `login_events` — an audit entry for every successful login.
- `user_uploads` — exactly one uploaded file per user. The raw file is in `file_data` (`BYTEA`); its name, MIME type, size, and upload time are stored alongside it.

View the stored metadata without reading the file contents:

```sql
SELECT u.email, f.file_name, f.mime_type, f.file_size_bytes, f.uploaded_at
FROM user_uploads f
JOIN users u ON u.id = f.user_id;
```

The database also prevents duplicates with `UNIQUE (user_id)`, so an account cannot upload a second file even if someone bypasses the page controls.

## Azure deployment

This project is ready for Azure Container Apps and Azure Database for PostgreSQL Flexible Server. The deployment script creates both services, builds the Docker image in Azure, stores the database URL and JWT secret as Container Apps secrets, and prints the public app URL.

1. Install the [Azure CLI](https://learn.microsoft.com/en-us/cli/azure/install-azure-cli-windows) and sign in with `az login`.
2. In [deploy-azure.ps1](C:/Users/Sai%20Revanth/OneDrive/%E3%83%89%E3%82%AD%E3%83%A5%E3%83%A1%E3%83%B3%E3%83%88/ChatGPT/Datalens/deploy-azure.ps1), replace every `CHANGE-ME` value—server/app names must be globally unique.
3. Run `./deploy-azure.ps1` from PowerShell. It creates billable Azure resources.

For an existing local database, migrate it after Azure is created (requires PostgreSQL client tools):

```powershell
pg_dump --no-owner --no-acl $env:LOCAL_DATABASE_URL | psql $env:AZURE_DATABASE_URL
```

Azure Database for PostgreSQL requires TLS. The deployment creates a connection string with `sslmode=require`; the app also enables SSL when `NODE_ENV=production`. Azure's recommended secure connection settings are documented in [Azure's TLS guidance](https://learn.microsoft.com/en-us/azure/postgresql/security/security-tls-how-to-connect).

### Keeping a demo low-cost

Use Azure Container Apps instead of App Service Free for this Node application. The deployment sets the container app to zero minimum replicas, so it scales down while idle. Azure Container Apps includes a monthly free grant, but Azure Database for PostgreSQL is free for 12 months only for eligible new Azure accounts (B1MS, 32 GB storage). Check your subscription's pricing/credits before creating resources.
