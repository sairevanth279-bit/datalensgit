# Deploy DataLens to Azure Container Apps and Azure Database for PostgreSQL Flexible Server.
# Prerequisite: sign in first with `az login`.
# Private values are prompted for and never saved into this file.

$ResourceGroup = "datalens-rg"
$Location = "centralindia"
$DatabaseName = "datalens"
$DbAdmin = "datalensadmin"

$NameSuffix = Read-Host "Enter a unique lowercase suffix (example: sai20260811)"
if ($NameSuffix -notmatch '^[a-z0-9]{5,24}$') {
  throw "Use 5-24 lowercase letters and numbers only."
}

$PostgresServer = "datalenspg$NameSuffix"
$ContainerApp = "datalensweb$NameSuffix"
$DbAdminPassword = Read-Host "Enter a database password (avoid @ : / ? # %)" -AsSecureString | ConvertFrom-SecureString -AsPlainText
$JwtSecret = Read-Host "Enter a JWT secret of 32 or more characters" -AsSecureString | ConvertFrom-SecureString -AsPlainText
if ($DbAdminPassword.Length -lt 12 -or $JwtSecret.Length -lt 32) {
  throw "Use a database password of at least 12 characters and a JWT secret of at least 32 characters."
}

az group create --name $ResourceGroup --location $Location
az extension add --name containerapp --upgrade
az provider register --namespace Microsoft.App
az provider register --namespace Microsoft.OperationalInsights

# This allows the Container App to reach PostgreSQL. For a production workload, replace it with private networking.
az postgres flexible-server create --resource-group $ResourceGroup --name $PostgresServer --location $Location `
  --admin-user $DbAdmin --admin-password $DbAdminPassword --sku-name Standard_B1ms --tier Burstable `
  --storage-size 32 --version 16 --public-access 0.0.0.0
az postgres flexible-server db create --resource-group $ResourceGroup --server-name $PostgresServer --database-name $DatabaseName

$DatabaseUrl = "postgresql://${DbAdmin}:${DbAdminPassword}@${PostgresServer}.postgres.database.azure.com:5432/${DatabaseName}?sslmode=require"

# Builds this folder, deploys the Docker image, and creates supporting Container Apps resources when needed.
az containerapp up --name $ContainerApp --resource-group $ResourceGroup --location $Location --source . --ingress external --target-port 3000

# Store credentials as Container Apps secrets, not source code or GitHub values.
az containerapp secret set --name $ContainerApp --resource-group $ResourceGroup --secrets "database-url=$DatabaseUrl" "jwt-secret=$JwtSecret"
az containerapp update --name $ContainerApp --resource-group $ResourceGroup `
  --set-env-vars "NODE_ENV=production" "DATABASE_URL=secretref:database-url" "JWT_SECRET=secretref:jwt-secret" `
  --min-replicas 0 --max-replicas 1

az containerapp show --name $ContainerApp --resource-group $ResourceGroup --query properties.configuration.ingress.fqdn --output tsv
