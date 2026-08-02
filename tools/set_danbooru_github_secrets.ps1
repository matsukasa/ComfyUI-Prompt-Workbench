[CmdletBinding()]
param(
    [string]$Repository = "matsukasa/ComfyUI-Prompt-Workbench"
)

$ErrorActionPreference = "Stop"
$credential = $null
$apiKey = $null

try {
    $credential = Get-Credential -Message "Enter your Danbooru username and API key. They will be stored as private GitHub Actions secrets."
    if ($null -eq $credential) {
        Write-Host "Input was cancelled. GitHub secrets were not changed."
        exit 2
    }

    $apiKey = $credential.GetNetworkCredential().Password
    if ([string]::IsNullOrWhiteSpace($credential.UserName) -or [string]::IsNullOrWhiteSpace($apiKey)) {
        throw "The Danbooru username or API key is empty."
    }

    $credential.UserName | gh secret set DANBOORU_USERNAME --repo $Repository --app actions
    if ($LASTEXITCODE -ne 0) {
        throw "Could not set the DANBOORU_USERNAME repository secret."
    }

    $apiKey | gh secret set DANBOORU_API_KEY --repo $Repository --app actions
    if ($LASTEXITCODE -ne 0) {
        throw "Could not set the DANBOORU_API_KEY repository secret."
    }

    Write-Host "The Danbooru GitHub Actions secrets were configured."
}
catch {
    Write-Error $_.Exception.Message
    exit 1
}
finally {
    $apiKey = $null
    $credential = $null
}
