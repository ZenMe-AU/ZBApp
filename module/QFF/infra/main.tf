# Azure AI Foundry (AIServices) account + embedding deployment used by QFFViz to generate preference embeddings.
terraform {
  required_version = ">= 1.4.0"
  required_providers {
    azurerm = { source = "hashicorp/azurerm", version = "~> 4.0" }
    random  = { source = "hashicorp/random", version = "~> 3.6" }
    local   = { source = "hashicorp/local", version = "~> 2.5" }
  }
}

provider "azurerm" {
  features {}
  subscription_id = var.subscription_id
}

variable "subscription_id" {
  type    = string
  default = "51d0ca21-eaa5-4d34-aeb3-fa9f7d454b5d"
}

variable "location" {
  type    = string
  default = "australiaeast"
}

variable "embedding_model" {
  type    = string
  default = "text-embedding-3-small"
}

variable "embedding_capacity" {
  description = "Standard deployment capacity in thousands of tokens per minute."
  type        = number
  default     = 50
}

data "azurerm_client_config" "current" {}

resource "random_string" "suffix" {
  length  = 5
  special = false
  upper   = false
}

resource "azurerm_resource_group" "qff" {
  name     = "rg-qff-embed-dev"
  location = var.location
  tags     = { purpose = "qff-embeddings", env = "dev" }
}

resource "azurerm_cognitive_account" "foundry" {
  name                  = "qff-embed-dev-${random_string.suffix.result}"
  location              = azurerm_resource_group.qff.location
  resource_group_name   = azurerm_resource_group.qff.name
  kind                  = "AIServices"
  sku_name              = "S0"
  custom_subdomain_name = "qff-embed-dev-${random_string.suffix.result}"
  local_auth_enabled    = false
  tags                  = azurerm_resource_group.qff.tags
}

resource "azurerm_cognitive_deployment" "embedding" {
  name                 = var.embedding_model
  cognitive_account_id = azurerm_cognitive_account.foundry.id
  model {
    format  = "OpenAI"
    name    = var.embedding_model
    version = "1"
  }
  sku {
    name     = "Standard"
    capacity = var.embedding_capacity
  }
}

# Lets the signed-in developer call the deployment with an Entra token (keys are disabled).
resource "azurerm_role_assignment" "developer" {
  scope                = azurerm_cognitive_account.foundry.id
  role_definition_name = "Cognitive Services OpenAI User"
  principal_id         = data.azurerm_client_config.current.object_id
}

resource "local_file" "qffviz_config" {
  filename = "${path.module}/../QFFViz/embedding.config.json"
  content = jsonencode({
    endpoint   = "https://${azurerm_cognitive_account.foundry.custom_subdomain_name}.openai.azure.com/openai/v1"
    deployment = azurerm_cognitive_deployment.embedding.name
  })
}

output "endpoint" {
  value = "https://${azurerm_cognitive_account.foundry.custom_subdomain_name}.openai.azure.com/openai/v1"
}

output "deployment" {
  value = azurerm_cognitive_deployment.embedding.name
}
