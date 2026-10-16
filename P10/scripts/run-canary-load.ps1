param(
  [Parameter(Mandatory = $true)][string]$BaseUrl,
  [ValidateRange(1, 900)][int]$DurationSeconds = 360,
  [ValidateRange(0, 30)][int]$IntervalSeconds = 2,
  [Parameter(Mandatory = $true)][string]$OutputPath
)

$ErrorActionPreference = "Stop"
$env:AWS_PROFILE = "yaniaaws"
$secretJson = aws secretsmanager get-secret-value --secret-id p9/sa-platform --region us-east-1 --query SecretString --output text
if ($LASTEXITCODE -ne 0) { throw "No se pudo leer el secreto de citas" }
$secret = $secretJson | ConvertFrom-Json
$token = [string]$secret.'appointments-write-token'
if (-not $token) { throw "Falta el token de escritura de citas" }
Remove-Variable secretJson, secret

$destination = [IO.Path]::GetFullPath($OutputPath)
$parent = [IO.Path]::GetDirectoryName($destination)
[IO.Directory]::CreateDirectory($parent) | Out-Null
$started = [DateTimeOffset]::UtcNow
$deadline = $started.AddSeconds($DurationSeconds)
$sequence = 0

while ([DateTimeOffset]::UtcNow -lt $deadline) {
  $sequence++
  $traceId = [Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(16)).ToLowerInvariant()
  $spanId = [Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(8)).ToLowerInvariant()
  $headers = @{
    'x-appointments-write-token' = $token
    traceparent = "00-$traceId-$spanId-01"
  }
  $body = @{
    petId = "pet-001"
    veterinarian = "Dra. P10"
    reason = "Verificación controlada de canary P10 #$sequence"
    scheduledAt = $started.AddDays(7).AddMinutes($sequence).ToString("yyyy-MM-ddTHH:mm:ssZ")
  } | ConvertTo-Json
  $at = [DateTimeOffset]::UtcNow
  $timer = [Diagnostics.Stopwatch]::StartNew()
  $status = 0
  $appointmentId = $null
  $errorText = $null
  try {
    $response = Invoke-WebRequest -Method Post -Uri "$($BaseUrl.TrimEnd('/'))/api/appointments" -Headers $headers -Body $body -ContentType "application/json" -TimeoutSec 15 -SkipHttpErrorCheck
    $status = [int]$response.StatusCode
    if ($status -eq 201) { $appointmentId = ($response.Content | ConvertFrom-Json).id }
    else { $errorText = $response.Content }
  } catch {
    $errorText = $_.Exception.Message
  }
  $timer.Stop()
  $sample = [ordered]@{
    at_utc = $at.ToString("o")
    ended_utc = [DateTimeOffset]::UtcNow.ToString("o")
    sequence = $sequence
    trace_id = $traceId
    status = $status
    duration_ms = [math]::Round($timer.Elapsed.TotalMilliseconds, 1)
    appointment_id = $appointmentId
    error = $errorText
  }
  $line = $sample | ConvertTo-Json -Compress
  [IO.File]::AppendAllText($destination, "$line`n", [Text.Encoding]::UTF8)
  Write-Output $line
  if ($IntervalSeconds -gt 0) { Start-Sleep -Seconds $IntervalSeconds }
}

Remove-Variable token
