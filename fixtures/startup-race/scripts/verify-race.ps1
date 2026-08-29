param(
    [ValidateRange(1, 20)]
    [int]$Runs = 1,

    [ValidateRange(500, 30000)]
    [int]$PostgresDelayMs = 3000,

    [ValidateRange(5, 300)]
    [int]$TimeoutSeconds = 30
)

$ErrorActionPreference = "Stop"
$composeFile = Join-Path $PSScriptRoot "..\compose.yaml"

function Invoke-Compose {
    param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Arguments)

    & docker compose -f $composeFile @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "docker compose failed: $($Arguments -join ' ')"
    }
}

function Get-ContainerValue {
    param([string]$Service, [string]$Template)

    $containerId = (& docker compose -f $composeFile ps -q --all $Service).Trim()
    if (-not $containerId) { return "" }
    return (& docker inspect --format $Template $containerId).Trim()
}

Invoke-Compose build postgres api

for ($run = 1; $run -le $Runs; $run++) {
    Write-Host "Intentional race run $run/$Runs"
    try {
        Invoke-Compose down -v --remove-orphans
        $env:POSTGRES_START_DELAY_MS = "$PostgresDelayMs"
        Invoke-Compose up -d --no-deps postgres
        Invoke-Compose up -d --no-deps api

        $deadline = [DateTimeOffset]::UtcNow.AddSeconds($TimeoutSeconds)
        $apiExit = ""
        while ([DateTimeOffset]::UtcNow -lt $deadline) {
            $apiState = Get-ContainerValue api '{{.State.Status}}'
            if ($apiState -eq "exited") {
                $apiExit = Get-ContainerValue api '{{.State.ExitCode}}'
                break
            }
            Start-Sleep -Milliseconds 100
        }

        $apiLogs = (& docker compose -f $composeFile logs --no-color api) -join "`n"
        if ($apiExit -eq "" -or $apiExit -eq "0") {
            throw "API did not exit non-zero during the intended startup race"
        }
        if ($apiLogs -notmatch '"event":"db_connection_failed"') {
            throw "API exited non-zero but did not emit db_connection_failed evidence"
        }

        Write-Host "PASS: intended race reproduced with API exit code $apiExit"
    }
    finally {
        Invoke-Compose logs --no-color
        Invoke-Compose down -v --remove-orphans
        Remove-Item Env:POSTGRES_START_DELAY_MS -ErrorAction SilentlyContinue
    }
}
