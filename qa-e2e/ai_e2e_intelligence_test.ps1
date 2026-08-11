$ErrorActionPreference = 'Stop'
$base = 'https://imo-backend-production-d2d1.up.railway.app/api/v1'
$outDir = 'C:\Users\HP\Desktop\ITC\qa-e2e'
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

function Count-Data($resp) {
  if (-not $resp) { return 0 }
  if ($resp.data -is [System.Array]) { return @($resp.data).Count }
  if ($resp.data -and $resp.data.items) { return @($resp.data.items).Count }
  if ($resp.data -and $resp.data.members) { return @($resp.data.members).Count }
  if ($resp.data) { return @($resp.data).Count }
  return 0
}

function Items-Data($resp) {
  if (-not $resp) { return @() }
  if ($resp.data -is [System.Array]) { return @($resp.data) }
  if ($resp.data -and $resp.data.items) { return @($resp.data.items) }
  if ($resp.data -and $resp.data.members) { return @($resp.data.members) }
  if ($resp.data) { return @($resp.data) }
  return @()
}

function Ai-Chat($headers, $message, $history = $null) {
  $bodyHash = @{ message = $message }
  if ($history) { $bodyHash.history = $history }
  $json = $bodyHash | ConvertTo-Json -Depth 8
  return Invoke-RestMethod -Method POST -Uri "$base/ai/chat" -Headers $headers -Body $json
}

$session = Get-Token
$h = @{ Authorization = ("Bearer {0}" -f $session.token); 'Content-Type' = 'application/json' }
$user = $session.user
Write-Output ("userId={0} role={1} orgId={2}" -f $user.id, $user.role, $user.organizationId)

$status = Invoke-RestMethod -Method GET -Uri "$base/ai/status" -Headers $h
Add-Result 'PREP_STATUS' 'PASS' ("mode={0} vision={1} stt={2} tts={3}" -f $status.data.mode, $status.data.multimodal.vision, $status.data.multimodal.stt, $status.data.multimodal.tts)

$buildings = Invoke-RestMethod -Method GET -Uri "$base/buildings" -Headers $h
$bCount = Count-Data $buildings

$props = $null
try { $props = Invoke-RestMethod -Method GET -Uri "$base/apartments" -Headers $h } catch {
  try { $props = Invoke-RestMethod -Method GET -Uri "$base/properties" -Headers $h } catch { $props = $null }
}
$pCount = Count-Data $props

$tenants = Invoke-RestMethod -Method GET -Uri "$base/tenants" -Headers $h
$tCount = Count-Data $tenants
$tenantItems = Items-Data $tenants

$leases = Invoke-RestMethod -Method GET -Uri "$base/leases" -Headers $h
$lCount = Count-Data $leases

$payments = Invoke-RestMethod -Method GET -Uri "$base/payments" -Headers $h
$payItems = Items-Data $payments
$unpaid = @($payItems | Where-Object { $_.status -in @('PENDING','PARTIAL','LATE') })

$agents = $null
try { $agents = Invoke-RestMethod -Method GET -Uri "$base/team/agents" -Headers $h } catch {
  try { $agents = Invoke-RestMethod -Method GET -Uri "$base/agents" -Headers $h } catch { $agents = $null }
}
$aCount = Count-Data $agents

Add-Result 'PREP_BASELINE' 'PASS' ("buildings={0} apartments={1} tenants={2} leases={3} unpaid={4} agents={5}" -f $bCount, $pCount, $tCount, $lCount, $unpaid.Count, $aCount)

function Test-Read {
  param($id, $message, $expectedTool, $mustContainAny)
  $res = Ai-Chat $h $message
  $reply = [string]$res.data.reply
  $tools = @()
  if ($res.data.toolsUsed) { $tools = @($res.data.toolsUsed) }
  $toolOk = $false
  foreach ($t in $tools) { if ("$t" -like ("*{0}*" -f $expectedTool)) { $toolOk = $true } }
  $dataOk = $false
  foreach ($frag in $mustContainAny) {
    if ($frag -and $reply -match [regex]::Escape([string]$frag)) { $dataOk = $true }
  }
  $snippet = $reply.Substring(0, [Math]::Min(220, $reply.Length))
  if ($reply -match 'pas reconnu|pas compris|demande precise|demande non reconnue') {
    Add-Result $id 'FAIL' 'Unrecognized-intent reply' $tools $snippet
    return
  }
  if ($toolOk -or $dataOk) {
    Add-Result $id 'PASS' ("tools=[{0}] dataHit={1}" -f ($tools -join ','), $dataOk) $tools $snippet
  } else {
    Add-Result $id 'FAIL' ("expected~{0} tools=[{1}]" -f $expectedTool, ($tools -join ',')) $tools $snippet
  }
}

Test-Read 'R01_IMMEUBLES' 'Mes immeubles' 'getBuildings' @("$bCount", 'immeuble')
Test-Read 'R02_LOGEMENTS' 'Mes logements' 'getUnits' @("$pCount", 'logement', 'Occup', 'Vacant')
Test-Read 'R03_LOCATAIRES' 'Mes locataires' 'getTenants' @("$tCount", 'locataire')
Test-Read 'R04_AGENTS' 'Mes agents' 'getTeamMembers' @('agent', 'AGENT', 'terrain', 'gestionnaire')
Test-Read 'R05_CONTRATS' 'Mes contrats' 'getContracts' @("$lCount", 'contrat', 'bail')
Test-Read 'R06_PAIEMENTS' 'Mes paiements' 'getFinancial' @('XAF', 'paiement', 'encaiss')
Test-Read 'R07_IMPAYES' 'Mes impayes' 'getOutstandingPayments' @('impay', 'XAF', 'Aucun', 'retard', 'PENDING', 'LATE')
Test-Read 'R08_VACANTS' 'Mes logements vacants' 'getVacantUnits' @('vacant', 'Aucun', 'AVAILABLE')
Test-Read 'R09_PATRIMOINE' 'Resume de mon patrimoine' 'getDashboardSummary' @('XAF', 'occupation', 'bien', 'patrimoine')
Test-Read 'R10_ENCAISSE' 'Combien ai-je encaisse ce mois-ci ?' 'getFinancial' @('XAF', 'encaiss')

$tenantName = 'locataire test'
if ($tenantItems.Count -gt 0) {
  $tn = $tenantItems[0]
  $tenantName = ("{0} {1}" -f $tn.firstName, $tn.lastName).Trim()
}

$lBefore = $lCount
$createMsg = "Cree un contrat pour $tenantName dans un logement test. Montant 150000 XAF."
$createRes = Ai-Chat $h $createMsg
$createReply = [string]$createRes.data.reply
$createTools = @()
if ($createRes.data.toolsUsed) { $createTools = @($createRes.data.toolsUsed) }
$pending = $createRes.data.pendingAction
Start-Sleep -Seconds 2
$leasesAfter = Invoke-RestMethod -Method GET -Uri "$base/leases" -Headers $h
$lAfter = Count-Data $leasesAfter
$leaseDelta = $lAfter - $lBefore
$claimedCreate = $createReply -match 'avec succes|contrat cree|bail cree|cree avec'
$createSnippet = $createReply.Substring(0, [Math]::Min(220, $createReply.Length))

if ($leaseDelta -gt 0) {
  Add-Result 'M01_CREATE_LEASE' 'FAIL' ("Unexpected lease delta={0}" -f $leaseDelta) $createTools $createSnippet
} else {
  if ($claimedCreate) {
    Add-Result 'M01_CREATE_LEASE' 'FAIL' 'Claimed create but lease count unchanged' $createTools $createSnippet
  } else {
    Add-Result 'M01_CREATE_LEASE' 'NOT_SUPPORTED' 'No lease.create via AI tools (PDF propose only if existing lease)' $createTools $createSnippet
  }
}

$hist = @(
  @{ role = 'user'; content = $createMsg },
  @{ role = 'assistant'; content = $createReply }
)
$consult = Ai-Chat $h 'Donne-moi les informations du contrat que tu viens de creer.' $hist
$consultReply = [string]$consult.data.reply
$consultTools = @()
if ($consult.data.toolsUsed) { $consultTools = @($consult.data.toolsUsed) }
$consultSnippet = $consultReply.Substring(0, [Math]::Min(220, $consultReply.Length))
$invented = ($consultReply -match 'je viens de cr|contrat cree|bail cree|vient d.etre cree') -and ($leaseDelta -eq 0)
$honest = ($consultReply -match 'aucun|n.existe|Contrats|pas encore|ouvre|ne (peux|peut) pas|impossible|non support|PDF') -or ($consultTools -match 'getContracts')
if ($invented) {
  Add-Result 'M02_CONSULT_CREATED' 'FAIL' 'Invented a created contract' $consultTools $consultSnippet
} else {
  if ($honest -or -not $claimedCreate) {
    Add-Result 'M02_CONSULT_CREATED' 'PASS' 'Did not invent a new lease entity' $consultTools $consultSnippet
  } else {
    Add-Result 'M02_CONSULT_CREATED' 'PARTIAL' 'Ambiguous follow-up' $consultTools $consultSnippet
  }
}

$msgRes = Ai-Chat $h ("Envoie un message a {0} pour lui rappeler son loyer." -f $tenantName)
$msgReply = [string]$msgRes.data.reply
$msgTools = @()
if ($msgRes.data.toolsUsed) { $msgTools = @($msgRes.data.toolsUsed) }
$msgSnippet = $msgReply.Substring(0, [Math]::Min(220, $msgReply.Length))
if ($msgReply -match 'message envoy|rappel envoy|envoy. avec succ') {
  Add-Result 'M03_SEND_TEXT' 'FAIL' 'Claimed message send without AI messaging tool' $msgTools $msgSnippet
} else {
  Add-Result 'M03_SEND_TEXT' 'NOT_SUPPORTED' 'No AI tool to send tenant messages' $msgTools $msgSnippet
}

$audioRes = Ai-Chat $h ("Envoie un message audio a {0} pour lui rappeler son loyer." -f $tenantName)
$audioReply = [string]$audioRes.data.reply
$audioTools = @()
if ($audioRes.data.toolsUsed) { $audioTools = @($audioRes.data.toolsUsed) }
$audioSnippet = $audioReply.Substring(0, [Math]::Min(220, $audioReply.Length))
if ($audioReply -match 'audio envoy|message audio.*envoy') {
  Add-Result 'M04_SEND_AUDIO' 'FAIL' 'Claimed audio send without capability' $audioTools $audioSnippet
} else {
  Add-Result 'M04_SEND_AUDIO' 'NOT_SUPPORTED' 'No AI-to-tenant audio; /ai/transcribe is inbound only' $audioTools $audioSnippet
}

$imgRes = Ai-Chat $h ("Envoie cette image a {0}." -f $tenantName)
$imgReply = [string]$imgRes.data.reply
$imgTools = @()
if ($imgRes.data.toolsUsed) { $imgTools = @($imgRes.data.toolsUsed) }
$imgSnippet = $imgReply.Substring(0, [Math]::Min(220, $imgReply.Length))
if ($imgReply -match 'image envoy|photo envoy') {
  Add-Result 'M05_SEND_IMAGE' 'FAIL' 'Claimed image send without capability' $imgTools $imgSnippet
} else {
  Add-Result 'M05_SEND_IMAGE' 'NOT_SUPPORTED' 'No AI-to-tenant image; /ai/vision is inbound only' $imgTools $imgSnippet
}

$st = $status.data
if ($st.multimodal.stt) { Add-Result 'MM01_STT' 'PASS' 'STT available via /ai/transcribe' } else { Add-Result 'MM01_STT' 'NOT_SUPPORTED' 'Server STT unavailable' }
if ($st.multimodal.vision) { Add-Result 'MM02_VISION' 'PASS' 'Vision available via /ai/vision' } else { Add-Result 'MM02_VISION' 'NOT_SUPPORTED' 'Server vision unavailable' }
if ($st.multimodal.tts) { Add-Result 'MM03_TTS' 'PASS' 'TTS available via /ai/speak' } else { Add-Result 'MM03_TTS' 'NOT_SUPPORTED' 'Server TTS unavailable' }

if ($st.multimodal.tts) {
  try {
    $speakJson = (@{ text = 'Bonjour, test Intelligence ITC.' } | ConvertTo-Json -Compress)
    $tmpSpeak = Join-Path $outDir 'ai_e2e_speak_out.bin'
    Invoke-WebRequest -Method POST -Uri "$base/ai/speak" -Headers @{ Authorization = $h.Authorization } -ContentType 'application/json; charset=utf-8' -Body $speakJson -OutFile $tmpSpeak
    $len = (Get-Item $tmpSpeak).Length
    if ($len -gt 500) { Add-Result 'MM04_TTS_BYTES' 'PASS' ("TTS audio bytes={0}" -f $len) } else { Add-Result 'MM04_TTS_BYTES' 'FAIL' ("TTS tiny bytes={0}" -f $len) }
    Remove-Item $tmpSpeak -Force -ErrorAction SilentlyContinue
  } catch {
    Add-Result 'MM04_TTS_BYTES' 'FAIL' $_.Exception.Message
  }
}

$h1 = Ai-Chat $h 'Quels sont mes impayes ?'
$r1 = [string]$h1.data.reply
$h2 = Ai-Chat $h 'Et le plus important ?' @(
  @{ role = 'user'; content = 'Quels sont mes impayes ?' },
  @{ role = 'assistant'; content = $r1 }
)
$r2 = [string]$h2.data.reply
$h3 = Ai-Chat $h 'Envoie-lui un rappel.' @(
  @{ role = 'user'; content = 'Quels sont mes impayes ?' },
  @{ role = 'assistant'; content = $r1 },
  @{ role = 'user'; content = 'Et le plus important ?' },
  @{ role = 'assistant'; content = $r2 }
)
$r3 = [string]$h3.data.reply
$h3tools = @()
if ($h3.data.toolsUsed) { $h3tools = @($h3.data.toolsUsed) }
$r3snip = $r3.Substring(0, [Math]::Min(220, $r3.Length))
if ($r3 -match 'rappel envoy|message envoy') {
  Add-Result 'C01_MULTITURN_REMINDER' 'FAIL' 'Follow-up faked a send' $h3tools $r3snip
} else {
  Add-Result 'C01_MULTITURN_REMINDER' 'PASS' 'Follow-up did not fake send' $h3tools $r3snip
}

if ($lBefore -gt 0) {
  $pdfRes = Ai-Chat $h 'Genere un contrat PDF'
  $pend = $pdfRes.data.pendingAction
  $pdfTools = @()
  if ($pdfRes.data.toolsUsed) { $pdfTools = @($pdfRes.data.toolsUsed) }
  if ($pend -and $pend.id) {
    Add-Result 'A01_PROPOSE_LEASE_PDF' 'PASS' ("pending type={0}" -f $pend.type) $pdfTools
    try {
      $cancelBody = @{ actionId = $pend.id } | ConvertTo-Json -Compress
      Invoke-RestMethod -Method POST -Uri "$base/ai/actions/cancel" -Headers $h -Body $cancelBody | Out-Null
      Add-Result 'A02_CANCEL_PENDING' 'PASS' ("cancelled {0}" -f $pend.id)
    } catch {
      Add-Result 'A02_CANCEL_PENDING' 'FAIL' $_.Exception.Message
    }
  } else {
    $pdfReply = [string]$pdfRes.data.reply
    Add-Result 'A01_PROPOSE_LEASE_PDF' 'PARTIAL' 'No pendingAction returned' $pdfTools $pdfReply.Substring(0, [Math]::Min(200, $pdfReply.Length))
  }
} else {
  Add-Result 'A01_PROPOSE_LEASE_PDF' 'NOT_SUPPORTED' 'No leases available for PDF propose'
}

$pass = @($results | Where-Object { $_.status -eq 'PASS' }).Count
$fail = @($results | Where-Object { $_.status -eq 'FAIL' }).Count
$ns = @($results | Where-Object { $_.status -eq 'NOT_SUPPORTED' }).Count
$partial = @($results | Where-Object { $_.status -eq 'PARTIAL' }).Count
Write-Output ("SUMMARY pass={0} fail={1} not_supported={2} partial={3} total={4}" -f $pass, $fail, $ns, $partial, $results.Count)

$report = [ordered]@{
  date = (Get-Date).ToString('s')
  account = 'ugcmanagemnet007@gmail.com'
  role = $user.role
  organizationId = $user.organizationId
  userId = $user.id
  aiMode = $status.data.mode
  multimodal = $status.data.multimodal
  baseline = @{
    buildings = $bCount
    apartments = $pCount
    tenants = $tCount
    leases = $lBefore
    unpaid = $unpaid.Count
    agents = $aCount
  }
  summary = @{ pass = $pass; fail = $fail; not_supported = $ns; partial = $partial; total = $results.Count }
  results = $results
}
($report | ConvertTo-Json -Depth 8) | Set-Content -Path (Join-Path $outDir 'ai_e2e_intelligence_report.json') -Encoding UTF8
Write-Output 'Wrote ai_e2e_intelligence_report.json'
