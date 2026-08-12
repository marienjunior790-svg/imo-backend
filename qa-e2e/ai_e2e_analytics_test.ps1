$ErrorActionPreference = 'Stop'
$base = 'https://imo-backend-production-d2d1.up.railway.app/api/v1'
$outDir = 'C:\Users\HP\Desktop\ITC\qa-e2e'
$outFile = Join-Path $outDir 'ai_e2e_analytics.json'
$results = New-Object System.Collections.Generic.List[object]

function Add-Result {
  param($id, $status, $detail, $toolsUsed = @(), $evidence = $null)
  $toolsStr = if ($toolsUsed) { ($toolsUsed | ForEach-Object { "$_" }) -join ',' } else { '' }
  $obj = [pscustomobject]@{
    id = $id
    status = $status
    detail = $detail
    toolsUsed = $toolsStr
    evidence = $evidence
  }
  [void]$results.Add($obj)
  Write-Output ("[{0}] {1} - {2}" -f $status, $id, $detail)
}

function Get-Token {
  $login = Invoke-RestMethod -Method POST -Uri "$base/auth/login" -ContentType 'application/json' -Body '{"identifier":"ugcmanagemnet007@gmail.com","password":"Mboula100"}'
  $token = $null
  if ($login.data -and $login.data.accessToken) { $token = $login.data.accessToken }
  if (-not $token -and $login.accessToken) { $token = $login.accessToken }
  $user = $null
  if ($login.data -and $login.data.user) { $user = $login.data.user }
  return @{ token = $token; user = $user }
}

function Ai-Chat($headers, $message) {
  $json = (@{ message = $message } | ConvertTo-Json -Depth 6)
  return Invoke-RestMethod -Method POST -Uri "$base/ai/chat" -Headers $headers -Body $json
}

function Test-Analytics {
  param($id, $message, $expectedTool)
  $res = Ai-Chat $h $message
  $reply = [string]$res.data.reply
  $tools = @()
  if ($res.data.toolsUsed) { $tools = @($res.data.toolsUsed) }
  $toolOk = $false
  foreach ($t in $tools) { if ("$t" -eq $expectedTool -or "$t" -like ("*{0}*" -f $expectedTool)) { $toolOk = $true } }

  $hasNumber = $reply -match '\d'
  $hasZeroOrInsuff =
    $reply -match '\b0\b' -or
    $reply -match 'insuffisant' -or
    $reply -match 'Aucun' -or
    $reply -match 'aucune'

  $snippet = $reply.Substring(0, [Math]::Min(280, $reply.Length))

  # Hallucination guard: invented-looking KPI language without tools
  $looksInvented = ($reply -match '%|XAF|occupation|impay') -and (-not $toolOk) -and ($tools.Count -eq 0)

  if ($looksInvented) {
    Add-Result $id 'FAIL' 'Reply has KPI language but toolsUsed empty (possible hallucination)' $tools $snippet
    return
  }
  if (-not $toolOk) {
    Add-Result $id 'FAIL' ("expected tool {0}; got [{1}]" -f $expectedTool, ($tools -join ',')) $tools $snippet
    return
  }
  if (-not ($hasNumber -or $hasZeroOrInsuff)) {
    Add-Result $id 'FAIL' 'Tool OK but reply lacks numbers / 0 / insufficient' $tools $snippet
    return
  }
  Add-Result $id 'PASS' ("tools=[{0}]" -f ($tools -join ',')) $tools $snippet
}

$session = Get-Token
$h = @{ Authorization = ("Bearer {0}" -f $session.token); 'Content-Type' = 'application/json' }
$user = $session.user
Write-Output ("userId={0} role={1} orgId={2}" -f $user.id, $user.role, $user.organizationId)
Write-Output 'NOTE: Full math verification needs seed data. Sparse orgs → BLOCKED/PARTIAL for exact deltas; tool routing can still PASS.'
Write-Output 'Do NOT invent payment rows in production.'

Test-Analytics 'F01_PORTFOLIO' 'Quelle est la situation de mon parc ?' 'analyzePortfolio'
Test-Analytics 'F02_COMPARE' 'Compare les revenus de ce mois et du mois dernier' 'compareRevenue'
Test-Analytics 'F03_RANK' 'Quel immeuble a le plus d’impayés ?' 'rankBuildingsByOutstanding'
Test-Analytics 'F04_EXPLAIN' 'Pourquoi mes revenus ont baissé ?' 'explainRevenueChange'
Test-Analytics 'F05_URGENT' 'Quels sont les 5 problèmes les plus urgents ?' 'listUrgentIssues'

$pass = @($results | Where-Object { $_.status -eq 'PASS' }).Count
$fail = @($results | Where-Object { $_.status -eq 'FAIL' }).Count
$summary = [pscustomobject]@{
  phase = 'F_ANALYTICS'
  pass = $pass
  fail = $fail
  note = 'Exact occupancy/revenue math vs API is PARTIAL/BLOCKED without seed; assert toolsUsed + numeric/0/insufficient reply.'
  results = $results
}
$summary | ConvertTo-Json -Depth 8 | Set-Content -Path $outFile -Encoding UTF8
Write-Output ("SUMMARY pass={0} fail={1} → {2}" -f $pass, $fail, $outFile)
if ($fail -gt 0) { exit 1 }
