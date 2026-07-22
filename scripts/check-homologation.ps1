param(
  [ValidateSet('local', 'remote')]
  [string]$Mode = 'remote'
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$envPath = Join-Path $root '.env'
$results = [System.Collections.Generic.List[object]]::new()

function Add-Check([string]$Name, [bool]$Ok, [string]$Detail) {
  $results.Add([pscustomobject]@{ Check = $Name; Status = $(if ($Ok) { 'OK' } else { 'BLOQUEIO' }); Detail = $Detail })
}

function Read-EnvFile([string]$Path) {
  $values = @{}
  if (-not (Test-Path -LiteralPath $Path)) { return $values }
  foreach ($line in Get-Content -LiteralPath $Path) {
    if ($line -match '^\s*#' -or $line -notmatch '=') { continue }
    $name, $value = $line -split '=', 2
    $values[$name.Trim()] = $value.Trim().Trim('"').Trim("'")
  }
  return $values
}

$envValues = Read-EnvFile $envPath
Add-Check '.env ignorado pelo Git' ((git -C $root check-ignore .env 2>$null) -ne $null) 'O arquivo não pode ser versionado.'
Add-Check '.env não rastreado' ([string]::IsNullOrWhiteSpace((git -C $root ls-files .env))) 'Nenhum segredo deve estar no índice.'

$template = Join-Path $root 'templates\term.docx'
$expectedTemplateHash = '9fb8229babe608b1dfd0769eb7db4c5e69545604fc0a726bd48ff86e5a778343'
$templateOk = (Test-Path -LiteralPath $template) -and ((Get-FileHash -LiteralPath $template -Algorithm SHA256).Hash.ToLowerInvariant() -eq $expectedTemplateHash)
Add-Check 'Template de homologação' $templateOk 'Hash deve corresponder à versão parametrizada e marcada.'

try {
  $serverVersion = docker info --format '{{.ServerVersion}}' 2>$null
  Add-Check 'Docker Engine' (-not [string]::IsNullOrWhiteSpace($serverVersion)) 'Docker precisa estar em execução.'
} catch {
  Add-Check 'Docker Engine' $false 'Docker não respondeu.'
}

$required = @('JWT_SECRET', 'BITRIX_TOKEN_ENCRYPTION_KEY')
if ($Mode -eq 'remote') {
  $required += @(
    'DATABASE_URL', 'DIRECT_URL', 'SUPABASE_URL', 'SUPABASE_SECRET_KEY',
    'BITRIX_CLIENT_ID', 'BITRIX_CLIENT_SECRET', 'BITRIX_PORTAL_ORIGIN',
    'PUBLIC_BACKEND_URL', 'FRONTEND_URL', 'CORS_ORIGINS', 'VITE_API_URL',
    'ZAPSIGN_API_TOKEN', 'ZAPSIGN_WEBHOOK_SECRET'
  )
}

foreach ($name in $required) {
  $value = [string]$envValues[$name]
  $placeholder = [string]::IsNullOrWhiteSpace($value) -or $value -match 'change-me|PROJECT_REF|PENDING_CONFIGURATION'
  if ($Mode -eq 'remote' -and $value -match 'localhost') { $placeholder = $true }
  if ($Mode -eq 'remote' -and $name -eq 'BITRIX_PORTAL_ORIGIN' -and $value -match '\*') { $placeholder = $true }
  Add-Check "Variável $name" (-not $placeholder) 'Valor presente e sem placeholder; conteúdo não exibido.'
}

$results | Format-Table -AutoSize
if ($results.Status -contains 'BLOQUEIO') { exit 1 }
