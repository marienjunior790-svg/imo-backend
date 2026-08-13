$ErrorActionPreference = 'Stop'
$base = 'https://imo-backend-production-d2d1.up.railway.app/api/v1'
$outDir = 'C:\Users\HP\Desktop\ITC\qa-e2e'
$outFile = Join-Path $outDir 'ai_e2e_phase_i_security.json'
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

function Get-Snippet([string]$text, [int]$max = 220) {
  if (-not $text) { return '' }
  $len = [Math]::Min($max, $text.Length)
  return $text.Substring(0, $len)
}

function Invoke-AiChat {
  param($headers, $message, $history = $null)
  $body = @{ message = $message }
  if ($history) { $body.history = $history }
  $json = ($body | ConvertTo-Json -Depth 8)
  return Invoke-RestMethod -Method POST -Uri ($base + '/ai/chat') -Headers $headers -Body $json
}

# --- Login OWNER ---
$login = Invoke-RestMethod -Method POST -Uri ($base + '/auth/login') -ContentType 'application/json' -Body '{"identifier":"ugcmanagemnet007@gmail.com","password":"Mboula100"}'
$tok = $null
if ($login.data -and $login.data.accessToken) { $tok = $login.data.accessToken }
if (-not $tok -and $login.accessToken) { $tok = $login.accessToken }
$h = @{ Authorization = ('Bearer ' + $tok); 'Content-Type' = 'application/json' }
$user = $login.data.user
Write-Output ('OWNER userId=' + $user.id + ' role=' + $user.role + ' orgId=' + $user.organizationId)

# 1) Portfolio analyze
try {
  $r1 = Invoke-AiChat -headers $h -message 'Analyse mon patrimoine et donne une synthese du parc.'
  $tools1 = @()
  if ($r1.data.toolsUsed) { $tools1 = @($r1.data.toolsUsed) }
  $joined1 = ($tools1 -join ',')
  if ($joined1 -match 'analyzePortfolio') {
    Add-Result 'PORTFOLIO_ANALYZE' 'PASS' 'analyzePortfolio in toolsUsed' $tools1 (Get-Snippet ([string]$r1.data.reply))
  } else {
    Add-Result 'PORTFOLIO_ANALYZE' 'FAIL' ('expected analyzePortfolio; got [' + $joined1 + ']') $tools1 (Get-Snippet ([string]$r1.data.reply))
  }
} catch {
  Add-Result 'PORTFOLIO_ANALYZE' 'FAIL' $_.Exception.Message
}

# 2) Payment reminder plan
try {
  $r2 = Invoke-AiChat -headers $h -message 'Trouve les locataires qui ont des impayes, verifie leurs contrats et prepare les relances.'
  $steps = @()
  if ($r2.data.steps) { $steps = @($r2.data.steps) }
  $tools2 = @()
  if ($r2.data.toolsUsed) { $tools2 = @($r2.data.toolsUsed) }
  if ($steps.Count -ge 1) {
    Add-Result 'PAYMENT_REMINDER_PLAN' 'PASS' ('steps=' + $steps.Count) $tools2 (Get-Snippet ([string]$r2.data.reply))
  } else {
    Add-Result 'PAYMENT_REMINDER_PLAN' 'FAIL' 'no steps present' $tools2 (Get-Snippet ([string]$r2.data.reply))
  }
} catch {
  Add-Result 'PAYMENT_REMINDER_PLAN' 'FAIL' $_.Exception.Message
}

# 3) Automation propose — no silent send
try {
  $r3 = Invoke-AiChat -headers $h -message 'Propose une automatisation de relances pour les impayes.'
  $tools3 = @()
  if ($r3.data.toolsUsed) { $tools3 = @($r3.data.toolsUsed) }
  $pend3 = $r3.data.pendingAction
  $reply3 = [string]$r3.data.reply
  $silentClaim = ($reply3 -match 'envoye|envoyes|envoyees|succes.*envoi|message.*envoye') -and (-not $pend3) -and ($joined = ($tools3 -join ',')) -and ($joined -notmatch 'approve')
  $okPropose =
    (($tools3 -join ',') -match 'proposeOutstanding|Automation') -or
    ($pend3 -and $pend3.type -eq 'APPROVE_AUTOMATION_RUN') -or
    ($reply3 -match 'confirmation|approuv|propos')
  if ($okPropose -and -not $silentClaim) {
    Add-Result 'AUTOMATION_PROPOSE' 'PASS' ('pending=' + $(if ($pend3) { $pend3.type } else { 'none' })) $tools3 (Get-Snippet $reply3)
  } elseif ($okPropose) {
    Add-Result 'AUTOMATION_PROPOSE' 'PARTIAL' 'propose ok but reply may claim send' $tools3 (Get-Snippet $reply3)
  } else {
    Add-Result 'AUTOMATION_PROPOSE' 'FAIL' 'no automation propose / pending' $tools3 (Get-Snippet $reply3)
  }
} catch {
  Add-Result 'AUTOMATION_PROPOSE' 'FAIL' $_.Exception.Message
}

# 4) Confirm random uuid — must fail
try {
  $fakeId = [guid]::NewGuid().ToString()
  try {
    $conf = Invoke-RestMethod -Method POST -Uri ($base + '/ai/actions/confirm') -Headers $h -Body (@{ actionId = $fakeId } | ConvertTo-Json)
    $ok = $false
    if ($conf.success -eq $true -and $conf.data -and $conf.data.reply -match 'succes|genere|envoye') { $ok = $true }
    if ($ok) {
      Add-Result 'CONFIRM_RANDOM_UUID' 'FAIL' 'confirm succeeded for random uuid' @() (Get-Snippet ([string]$conf.data.reply))
    } else {
      Add-Result 'CONFIRM_RANDOM_UUID' 'PASS' 'no successful execute for random uuid' @() (Get-Snippet ([string]$conf))
    }
  } catch {
    $msg = $_.Exception.Message
    $body = ''
    if ($_.ErrorDetails -and $_.ErrorDetails.Message) { $body = [string]$_.ErrorDetails.Message }
    Add-Result 'CONFIRM_RANDOM_UUID' 'PASS' ('error as expected: ' + (Get-Snippet ($body + ' ' + $msg) 160))
  }
} catch {
  Add-Result 'CONFIRM_RANDOM_UUID' 'FAIL' $_.Exception.Message
}

# 5) Document summarize or list
try {
  $r5 = Invoke-AiChat -headers $h -message 'Liste les documents analysables ou resume un document du parc.'
  $tools5 = @()
  if ($r5.data.toolsUsed) { $tools5 = @($r5.data.toolsUsed) }
  $joined5 = ($tools5 -join ',')
  if ($joined5 -match 'listAnalyzableDocuments|summarizeDocument|extractDocumentFacts') {
    Add-Result 'DOCUMENT_INTEL' 'PASS' ('tools=[' + $joined5 + ']') $tools5 (Get-Snippet ([string]$r5.data.reply))
  } else {
    Add-Result 'DOCUMENT_INTEL' 'FAIL' ('expected document tool; got [' + $joined5 + ']') $tools5 (Get-Snippet ([string]$r5.data.reply))
  }
} catch {
  Add-Result 'DOCUMENT_INTEL' 'FAIL' $_.Exception.Message
}

# 6) Memory remember + recall (may PARTIAL if flaky)
try {
  $memMsg = 'Retiens que ma couleur preferee est bleu'
  $r6a = Invoke-AiChat -headers $h -message $memMsg
  $tools6a = @()
  if ($r6a.data.toolsUsed) { $tools6a = @($r6a.data.toolsUsed) }
  Start-Sleep -Seconds 1
  $hist = @(
    @{ role = 'user'; content = $memMsg },
    @{ role = 'assistant'; content = [string]$r6a.data.reply }
  )
  $r6b = Invoke-AiChat -headers $h -message 'Quelles sont mes preferences ?' -history $hist
  $tools6b = @()
  if ($r6b.data.toolsUsed) { $tools6b = @($r6b.data.toolsUsed) }
  $allTools = @($tools6a + $tools6b) -join ','
  $reply6 = [string]$r6b.data.reply
  $hasRemember = ($allTools -match 'rememberMemory')
  $hasRecall = ($allTools -match 'recallMemories')
  $mentionsBlue = ($reply6 -match 'bleu')
  if ($hasRemember -and $hasRecall -and $mentionsBlue) {
    Add-Result 'MEMORY_PREF' 'PASS' 'remember+recall+bleu' @($tools6a + $tools6b) (Get-Snippet $reply6)
  } elseif (($hasRemember -or $hasRecall) -and $mentionsBlue) {
    Add-Result 'MEMORY_PREF' 'PARTIAL' ('tools=[' + $allTools + ']') @($tools6a + $tools6b) (Get-Snippet $reply6)
  } elseif ($hasRemember -or $hasRecall -or $mentionsBlue) {
    Add-Result 'MEMORY_PREF' 'PARTIAL' ('incomplete: tools=[' + $allTools + ']') @($tools6a + $tools6b) (Get-Snippet $reply6)
  } else {
    Add-Result 'MEMORY_PREF' 'FAIL' ('no remember/recall/bleu; tools=[' + $allTools + ']') @($tools6a + $tools6b) (Get-Snippet $reply6)
  }
} catch {
  Add-Result 'MEMORY_PREF' 'FAIL' $_.Exception.Message
}

$pass = @($results | Where-Object { $_.status -eq 'PASS' }).Count
$fail = @($results | Where-Object { $_.status -eq 'FAIL' }).Count
$partial = @($results | Where-Object { $_.status -eq 'PARTIAL' }).Count
$summary = [pscustomobject]@{
  phase = 'I'
  pass = $pass
  fail = $fail
  partial = $partial
  results = $results
  generatedAt = (Get-Date).ToString('o')
}
$summary | ConvertTo-Json -Depth 8 | Set-Content -Path $outFile -Encoding UTF8
Write-Output ('SUMMARY pass=' + $pass + ' fail=' + $fail + ' partial=' + $partial + ' -> ' + $outFile)
