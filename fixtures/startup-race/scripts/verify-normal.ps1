param(
    [ValidateRange(1, 20)]
    [int]$Runs = 1,

    [ValidateRange(5, 300)]
    [int]$TimeoutSeconds = 60
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

    $containerId = (& docker compose -f $composeFile ps -q $Service).Trim()
    if (-not $containerId) { return "" }
    return (& docker inspect --format $Template $containerId).Trim()
}

for ($run = 1; $run -le $Runs; $run++) {
    Write-Host "Normal fixture run $run/$Runs"
    try {
        $env:POSTGRES_START_DELAY_MS = "0"
        Invoke-Compose down -v --remove-orphans
        Invoke-Compose up -d --build

        $deadline = [DateTimeOffset]::UtcNow.AddSeconds($TimeoutSeconds)
        while ([DateTimeOffset]::UtcNow -lt $deadline) {
            $postgresHealth = Get-ContainerValue postgres '{{.State.Health.Status}}'
            $apiHealth = Get-ContainerValue api '{{.State.Health.Status}}'
            $workerState = Get-ContainerValue worker '{{.State.Status}}'
            $workerExit = Get-ContainerValue worker '{{.State.ExitCode}}'

            if (
                $postgresHealth -eq "healthy" -and
                $apiHealth -eq "healthy" -and
                $workerState -eq "exited" -and
                $workerExit -eq "0"
            ) {
                Write-Host "PASS: normal startup produced complete success evidence"
                break
            }
            Start-Sleep -Milliseconds 250
        }

        if ([DateTimeOffset]::UtcNow -ge $deadline) {
            Invoke-Compose logs --no-color
            throw "Normal startup did not produce pass evidence within $TimeoutSeconds seconds"
        }
    }
    finally {
        Invoke-Compose logs --no-color
        Invoke-Compose down -v --remove-orphans
        Remove-Item Env:POSTGRES_START_DELAY_MS -ErrorAction SilentlyContinue
    }
}
