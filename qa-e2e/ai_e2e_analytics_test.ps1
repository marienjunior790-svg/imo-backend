$ErrorActionPreference = 'Stop'
$base = 'https://imo-backend-production-d2d1.up.railway.app/api/v1'
$outDir = 'C:\Users\HP\Desktop\ITC\qa-e2e'
$outFile = Join-Path $outDir 'ai_e2e_analytics.json'
$results = New-Object System.Collections.Generic.List[object]

function Add-Result {
  param($id, $status, $detail, $toolsUsed = @(), $evidence = $null)
  $toolsStr = ''
  if ($toolsUsed) { $toolsStr = ($toolsUsed | ForEach-Object { "$_" }) -join ',' }
  $obj = [pscustomobject]@{
    id = $id
    status = $status
    detail = $detail
    toolsUsed = $toolsStr
    evidence = $evidence
  }
  [void]$results.Add($obj)
  Write-Output ('[' + $status + '] ' + $id + ' - ' + $detail)
}

function Get-Token {
  $login = Invoke-RestMethod -Method POST -Uri ($base + '/auth/login') -ContentType 'application/json' -Body '{"identifier":"ugcmanagemnet007@gmail.com","password":"Mboula100"}'
  $token = $null
  if ($login.data -and $login.data.accessToken) { $token = $login.data.accessToken }
  if (-not $token -and $login.accessToken) { $token = $login.accessToken }
  $user = $null
  if ($login.data -and $login.data.user) { $user = $login.data.user }
  return @{ token = $token; user = $user }
}

function Invoke-AiChat {
  param($headers, $message)
  $json = (@{ message = $message } | ConvertTo-Json -Depth 6)
  return Invoke-RestMethod -Method POST -Uri ($base + '/ai/chat') -Headers $headers -Body $json
}

function Test-Analytics {
  param($id, $message, $expectedTool)
  $res = Invoke-AiChat -headers $h -message $message
  $reply = [string]$res.data.reply
  $tools = @()
  if ($res.data.toolsUsed) { $tools = @($res.data.toolsUsed) }
  $toolOk = $false
  foreach ($t in $tools) {
    if (("$t" -eq $expectedTool) -or ("$t" -like ('*' + $expectedTool + '*'))) { $toolOk = $true }
  }

  $hasNumber = $reply -match '\d'
  $hasZeroOrInsuff =
    ($reply -match '\b0\b') -or
    ($reply -match 'insuffisant') -or
    ($reply -match 'Aucun') -or
    ($reply -match 'aucune')

  $len = [Math]::Min(280, $reply.Length)
  $snippet = $reply.Substring(0, $len)

  $looksInvented = (($reply -match '%|XAF|occupation|impay') -and (-not $toolOk) -and ($tools.Count -eq 0))

  if ($looksInvented) {
    Add-Result $id 'FAIL' 'KPI language without toolsUsed' $tools $snippet
    return
  }
  if (-not $toolOk) {
    Add-Result $id 'FAIL' ('expected tool ' + $expectedTool + '; got [' + ($tools -join ',') + ']') $tools $snippet
    return
  }
  if (-not ($hasNumber -or $hasZeroOrInsuff)) {
    Add-Result $id 'FAIL' 'Tool OK but reply lacks numbers / 0 / insufficient' $tools $snippet
    return
  }
  Add-Result $id 'PASS' ('tools=[' + ($tools -join ',') + ']') $tools $snippet
}

$session = Get-Token
$h = @{ Authorization = ('Bearer ' + $session.token); 'Content-Type' = 'application/json' }
$user = $session.user
Write-Output ('userId=' + $user.id + ' role=' + $user.role + ' orgId=' + $user.organizationId)
Write-Output 'NOTE: Exact math vs seed is PARTIAL without dedicated dataset; tool routing can still PASS.'

Test-Analytics 'F01_PORTFOLIO' 'Quelle est la situation de mon parc ?' 'analyzePortfolio'
Test-Analytics 'F02_COMPARE' 'Compare les revenus de ce mois et du mois dernier' 'compareRevenue'
Test-Analytics 'F03_RANK' 'Quel immeuble a le plus d impayes ?' 'rankBuildingsByOutstanding'
Test-Analytics 'F04_EXPLAIN' 'Pourquoi mes revenus ont baisse ?' 'explainRevenueChange'
Test-Analytics 'F05_URGENT' 'Quels sont les 5 problemes les plus urgents ?' 'listUrgentIssues'

$pass = @($results | Where-Object { $_.status -eq 'PASS' }).Count
$fail = @($results | Where-Object { $_.status -eq 'FAIL' }).Count
$summary = [pscustomobject]@{
  phase = 'F_ANALYTICS'
  pass = $pass
  fail = $fail
  note = 'Exact occupancy/revenue math vs API is PARTIAL without seed; assert toolsUsed + numeric reply.'
  results = $results
}
$summary | ConvertTo-Json -Depth 8 | Set-Content -Path $outFile -Encoding UTF8
Write-Output ('SUMMARY pass=' + $pass + ' fail=' + $fail + ' file=' + $outFile)
if ($fail -gt 0) { exit 1 }
