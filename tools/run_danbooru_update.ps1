[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
$previousUsername = [Environment]::GetEnvironmentVariable("DANBOORU_USERNAME", "Process")
$previousApiKey = [Environment]::GetEnvironmentVariable("DANBOORU_API_KEY", "Process")
$credential = $null
$apiKey = $null

try {
    $credential = Get-Credential -Message "Enter your Danbooru username and API key. The API key is not saved."
    if ($null -eq $credential) {
        Write-Host "Input was cancelled. The catalog was not changed."
        exit 2
    }

    $apiKey = $credential.GetNetworkCredential().Password
    if ([string]::IsNullOrWhiteSpace($credential.UserName) -or [string]::IsNullOrWhiteSpace($apiKey)) {
        throw "The Danbooru username or API key is empty."
    }

    $python = Get-Command python -ErrorAction Stop
    [Environment]::SetEnvironmentVariable("DANBOORU_USERNAME", $credential.UserName, "Process")
    [Environment]::SetEnvironmentVariable("DANBOORU_API_KEY", $apiKey, "Process")

    Push-Location $projectRoot
    try {
        Write-Host "Updating the catalog from the official Danbooru API."
        & $python.Source "tools\update_danbooru_tag_catalog.py" --refresh
        if ($LASTEXITCODE -ne 0) {
            throw "The official catalog update failed. Existing data was preserved."
        }

        Write-Host "Validating the generated catalog."
        & $python.Source "tools\validate_danbooru_tag_catalog.py"
        if ($LASTEXITCODE -ne 0) {
            throw "Generated catalog validation failed."
        }
        Write-Host "The official Danbooru catalog was updated and validated."
    }
    finally {
        Pop-Location
    }
}
catch {
    Write-Error $_.Exception.Message
    exit 1
}
finally {
    [Environment]::SetEnvironmentVariable("DANBOORU_USERNAME", $previousUsername, "Process")
    [Environment]::SetEnvironmentVariable("DANBOORU_API_KEY", $previousApiKey, "Process")
    $apiKey = $null
    $credential = $null
}
