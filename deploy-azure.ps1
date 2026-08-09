# Deploys DataLens to Azure Container Apps and Azure Database for PostgreSQL Flexible Server.
# Prerequisites: Azure CLI (`az login`) and an active Azure subscription.
# Choose globally unique names for $PostgresServer and $ContainerApp.

$ResourceGroup = "datalens-rg"
$Location = "centralindia"
$PostgresServer = "datalens-pg-CHANGE-ME"
$DatabaseName = "datalens"
$DbAdmin = "datalensadmin"
$DbAdminPassword = "CHANGE-ME-Use-A-Long-Password"
$ContainerApp = "datalens-web-CHANGE-ME"
$JwtSecret = "CHANGE-ME-Use-A-Long-Random-JWT-Secret"

if ($PostgresServer -like "*CHANGE-ME*" -or $ContainerApp -like "*CHANGE-ME*" -or $DbAdminPassword -like "CHANGE-ME*" -or $JwtSecret -like "CHANGE-ME*") {
  throw "Set unique names and strong secrets at the top of this file before running it."
}

az group create --name $ResourceGroup --location $Location
az extension add --name containerapp --upgrade
az provider register --namespace Microsoft.App
az provider register --namespace Microsoft.OperationalInsights

# 0.0.0.0 permits Azure-hosted services. Use private VNet access for a production hardening step.
az postgres flexible-server create --resource-group $ResourceGroup --name $PostgresServer --location $Location `
  --admin-user $DbAdmin --admin-password $DbAdminPassword --sku-name Standard_B1ms --tier Burstable `
  --storage-size 32 --version 16 --public-access 0.0.0.0
az postgres flexible-server db create --resource-group $ResourceGroup --server-name $PostgresServer --database-name $DatabaseName

$DatabaseUrl = "postgresql://${DbAdmin}:${DbAdminPassword}@${PostgresServer}.postgres.database.azure.com:5432/${DatabaseName}?sslmode=require"

# Builds this directory with the Dockerfile, creates a registry/environment if needed, and deploys it.
az containerapp up --name $ContainerApp --resource-group $ResourceGroup --location $Location --source . --ingress external --target-port 3000

# Secrets are kept in Container Apps, not in the image or source code.
az containerapp secret set --name $ContainerApp --resource-group $ResourceGroup --secrets "database-url=$DatabaseUrl" "jwt-secret=$JwtSecret"
az containerapp update --name $ContainerApp --resource-group $ResourceGroup `
  --set-env-vars "NODE_ENV=production" "DATABASE_URL=secretref:database-url" "JWT_SECRET=secretref:jwt-secret"

az containerapp show --name $ContainerApp --resource-group $ResourceGroup --query properties.configuration.ingress.fqdn --output tsv
