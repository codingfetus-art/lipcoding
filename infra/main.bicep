targetScope = 'subscription'

@minLength(1)
@maxLength(64)
@description('Name of the azd environment - used to derive resource names.')
param environmentName string

@minLength(1)
@description('Primary location for all resources.')
param location string

@description('GitHub token used by the Copilot SDK at runtime. Leave empty to set later.')
@secure()
param copilotGithubToken string = ''

@description('Copilot model id used by the agent.')
param copilotModel string = 'gpt-5'

var resourceToken = toLower(uniqueString(subscription().id, environmentName, location))
var tags = { 'azd-env-name': environmentName }

resource rg 'Microsoft.Resources/resourceGroups@2022-09-01' = {
  name: 'rg-${environmentName}'
  location: location
  tags: tags
}

module resources 'resources.bicep' = {
  name: 'resources'
  scope: rg
  params: {
    location: location
    resourceToken: resourceToken
    tags: tags
    copilotGithubToken: copilotGithubToken
    copilotModel: copilotModel
  }
}

output AZURE_LOCATION string = location
output AZURE_TENANT_ID string = tenant().tenantId
output AZURE_CONTAINER_REGISTRY_ENDPOINT string = resources.outputs.containerRegistryEndpoint
output SERVICE_WEB_URI string = resources.outputs.appUri
output AZURE_COSMOS_ENDPOINT string = resources.outputs.cosmosEndpoint
output AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT string = resources.outputs.documentIntelligenceEndpoint
output AZURE_STORAGE_ACCOUNT string = resources.outputs.storageAccountName
