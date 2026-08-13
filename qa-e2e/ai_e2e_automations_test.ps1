$ErrorActionPreference = 'Stop'
$base = 'https://imo-backend-production-d2d1.up.railway.app/api/v1'
$outDir = 'C:\Users\HP\Desktop\ITC\qa-e2e'
$outFile = Join-Path $outDir 'ai_e2e_automations.json'
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

function Invoke-AiConfirm {
  param($headers, $actionId)
  $json = (@{ actionId = $actionId } | ConvertTo-Json -Depth 4)
  return Invoke-RestMethod -Method POST -Uri ($base + '/ai/actions/confirm') -Headers $headers -Body $json
}

$session = Get-Token
if (-not $session.token) {
  Add-Result 'H00_LOGIN' 'FAIL' 'No access token'
  $summary = [pscustomobject]@{ phase = 'H_AUTOMATIONS'; pass = 0; fail = 1; results = $results }
  $summary | ConvertTo-Json -Depth 8 | Set-Content -Path $outFile -Encoding UTF8
  exit 1
}
$h = @{ Authorization = ('Bearer ' + $session.token); 'Content-Type' = 'application/json' }
$user = $session.user
Write-Output ('userId=' + $user.id + ' role=' + $user.role + ' orgId=' + $user.organizationId)
Add-Result 'H00_LOGIN' 'PASS' ('role=' + $user.role)

# 1) Propose outstanding automation (Phase H keyword automatis — not classic Phase E)
$proposeMsg = 'Automatise les relances impayes'
$res1 = Invoke-AiChat -headers $h -message $proposeMsg
$reply1 = [string]$res1.data.reply
$tools1 = @()
if ($res1.data.toolsUsed) { $tools1 = @($res1.data.toolsUsed) }
$pending = $null
if ($res1.data.pendingAction) { $pending = $res1.data.pendingAction }
$snip1 = $reply1.Substring(0, [Math]::Min(320, $reply1.Length))

$toolOk = $false
foreach ($t in $tools1) {
  if (("$t" -eq 'proposeOutstandingReminderAutomation') -or ("$t" -like '*proposeOutstandingReminderAutomation*')) { $toolOk = $true }
}

$zeroItems =
  ($reply1 -match 'Aucun') -or
  ($reply1 -match '0 relance') -or
  ($reply1 -match 'aucune proposition') -or
  ($reply1 -match 'aucun element') -or
  ($reply1 -match 'Aucun element')

$pendingOk = $false
if ($pending -and ($pending.type -eq 'APPROVE_AUTOMATION_RUN')) { $pendingOk = $true }

if (-not $toolOk -and -not $pendingOk -and -not $zeroItems) {
  Add-Result 'H01_PROPOSE' 'FAIL' ('expected proposeOutstandingReminderAutomation or pending/0 items; tools=[' + ($tools1 -join ',') + ']') $tools1 $snip1
} elseif ($pendingOk) {
  Add-Result 'H01_PROPOSE' 'PASS' ('pending APPROVE_AUTOMATION_RUN id=' + $pending.id) $tools1 $snip1
} elseif ($zeroItems) {
  Add-Result 'H01_PROPOSE' 'PASS' '0 items / empty detection (no pending expected)' $tools1 $snip1
} else {
  Add-Result 'H01_PROPOSE' 'PASS' ('tool OK without pending — check reply') $tools1 $snip1
}

# 2) Confirm if pending
if ($pendingOk -and $pending.id) {
  $res2 = Invoke-AiConfirm -headers $h -actionId $pending.id
  $reply2 = [string]$res2.data.reply
  $snip2 = $reply2.Substring(0, [Math]::Min(360, $reply2.Length))

  $statusOk =
    ($reply2 -match 'SUCCEEDED') -or
    ($reply2 -match 'PARTIAL') -or
    ($reply2 -match 'FAILED') -or
    ($reply2 -match 'statut SUCCEEDED') -or
    ($reply2 -match 'statut PARTIAL') -or
    ($reply2 -match 'statut FAILED') -or
    ($reply2 -match 'ok,') -or
    ($reply2 -match 'echec') -or
    ($reply2 -match 'echecs') -or
    ($reply2 -match 'Preuves') -or
    ($reply2 -match 'Permission')

  $fakeSend =
    (($reply2 -match 'envoye') -or ($reply2 -match 'envoyee') -or ($reply2 -match 'Envoye')) -and
    ($reply2 -notmatch 'msg-|wa-|wamid|Preuves|id')

  if ($fakeSend) {
    Add-Result 'H02_CONFIRM' 'FAIL' 'Reply claims send without evidence ids' @() $snip2
  } elseif (-not $statusOk) {
    Add-Result 'H02_CONFIRM' 'FAIL' 'Confirm reply lacks status/evidence language' @() $snip2
  } else {
    Add-Result 'H02_CONFIRM' 'PASS' 'Confirm returned status/evidence language' @() $snip2
  }
} else {
  Add-Result 'H02_CONFIRM' 'PASS' 'Skipped confirm (no pending / 0 items)'
}

# 3) Second identical propose same day -> duplicate / skip
$res3 = Invoke-AiChat -headers $h -message $proposeMsg
$reply3 = [string]$res3.data.reply
$tools3 = @()
if ($res3.data.toolsUsed) { $tools3 = @($res3.data.toolsUsed) }
$snip3 = $reply3.Substring(0, [Math]::Min(320, $reply3.Length))

$dupOk =
  ($reply3 -match 'doublon') -or
  ($reply3 -match 'deja trait') -or
  ($reply3 -match 'deja') -or
  ($reply3 -match 'existante') -or
  ($reply3 -match 'reutilisee') -or
  ($reply3 -match 'reutilise') -or
  ($reply3 -match 'SKIPPED') -or
  ($reply3 -match 'anti-doublon') -or
  ($reply3 -match 'Aucun') -or
  ($reply3 -match 'aucune proposition')

if ($dupOk) {
  Add-Result 'H03_DUPLICATE' 'PASS' 'Duplicate/skip messaging present' $tools3 $snip3
} else {
  Add-Result 'H03_DUPLICATE' 'FAIL' 'Expected duplicate/skip wording on second propose' $tools3 $snip3
}

$pass = @($results | Where-Object { $_.status -eq 'PASS' }).Count
$fail = @($results | Where-Object { $_.status -eq 'FAIL' }).Count
$summary = [pscustomobject]@{
  phase = 'H_AUTOMATIONS'
  pass = $pass
  fail = $fail
  note = 'Default safety: autoExecute=false; propose+confirm required.'
  results = $results
}
$summary | ConvertTo-Json -Depth 8 | Set-Content -Path $outFile -Encoding UTF8
Write-Output ('SUMMARY pass=' + $pass + ' fail=' + $fail + ' file=' + $outFile)
if ($fail -gt 0) { exit 1 }
