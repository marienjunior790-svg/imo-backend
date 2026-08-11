# E2E WhatsApp Business — Intelligence ITC
# PASS uniquement si Meta Cloud API retourne un providerMessageId après confirm.
$ErrorActionPreference = 'Stop'
$base = if ($env:ITC_API_BASE) { $env:ITC_API_BASE } else { 'https://imo-backend-production-d2d1.up.railway.app/api/v1' }
$out = 'C:\Users\HP\Desktop\ITC\qa-e2e\ai_e2e_whatsapp.json'
$reportMd = 'C:\Users\HP\Desktop\ITC\qa-e2e\AI_WHATSAPP_E2E_REPORT.md'
$results = New-Object System.Collections.Generic.List[object]
function Add-R($id,$status,$detail,$extra=$null) {
  [void]$results.Add([pscustomobject]@{id=$id;status=$status;detail=$detail;extra=$extra})
  Write-Output ("[{0}] {1} - {2}" -f $status,$id,$detail)
}

$login = Invoke-RestMethod -Method POST -Uri "$base/auth/login" -ContentType 'application/json' -Body '{"identifier":"ugcmanagemnet007@gmail.com","password":"Mboula100"}'
$tok = $login.data.accessToken
$h = @{ Authorization = "Bearer $tok"; 'Content-Type' = 'application/json' }
function Chat($msg,$hist=$null) {
  $b = @{ message = $msg }
  if ($hist) { $b.history = $hist }
  return Invoke-RestMethod -Method POST -Uri "$base/ai/chat" -Headers $h -Body ($b | ConvertTo-Json -Depth 8)
}

$tenants = Invoke-RestMethod -Uri "$base/tenants" -Headers $h
$tItems = @($tenants.data)
if ($tenants.data.items) { $tItems = @($tenants.data.items) }
$tenant = $tItems | Where-Object { $_.phone -and $_.phone.ToString().Length -ge 8 } | Select-Object -First 1
if (-not $tenant) { $tenant = $tItems | Select-Object -First 1 }

$stamp = (Get-Date).ToString('yyyy-MM-dd HH:mm')
$bodyText = "Rappel loyer test WhatsApp ITC $stamp"
$msg = "Envoie un WhatsApp au locataire tenantId $($tenant.id) : $bodyText"
Write-Output "tenant=$($tenant.id) name=$($tenant.firstName) $($tenant.lastName) phone=$($tenant.phone)"

$prop = Chat $msg
$tools = @($prop.data.toolsUsed) -join ','
$pend = $prop.data.pendingAction
$reply = [string]$prop.data.reply
Write-Output "tools=$tools pendingType=$($pend.type)"
Write-Output $reply.Substring(0,[Math]::Min(400,$reply.Length))

# Détection « non configuré » / numéro invalide avant confirm
if ($reply -match 'WhatsApp n.?est pas configur|WHATSAPP_ENABLED|WHATSAPP_TOKEN|non configur') {
  Add-R 'WA_CONFIG' 'BLOCKED' 'WhatsApp Cloud API non configuré sur le serveur (variables manquantes).' $tools
  Add-R 'WA_E2E' 'BLOCKED' 'Impossible d’obtenir un providerMessageId sans Meta credentials.'
} elseif ($reply -match 'ne possède pas de numéro WhatsApp valide') {
  Add-R 'WA_PHONE' 'FAIL' 'Locataire sans numéro WhatsApp valide en base.' $reply.Substring(0,[Math]::Min(200,$reply.Length))
  Add-R 'WA_E2E' 'FAIL' 'Numéro manquant/invalide — aucun envoi.'
} elseif ($pend -and $pend.type -eq 'SEND_WHATSAPP_MESSAGE') {
  Add-R 'WA_PROPOSE' 'PASS' "pending=$($pend.id) tools=$tools"
  $conf = Invoke-RestMethod -Method POST -Uri "$base/ai/actions/confirm" -Headers $h -Body (@{ actionId = $pend.id } | ConvertTo-Json)
  $cr = [string]$conf.data.reply
  Write-Output $cr.Substring(0,[Math]::Min(400,$cr.Length))
  if ($cr -match 'Provider ID\s*:\s*(\S+)' -or $cr -match 'wamid\.') {
    $pmid = $Matches[1]
    if (-not $pmid -and $cr -match '(wamid\.\S+)') { $pmid = $Matches[1] }
    if ($cr -match 'Message WhatsApp envoyé' -and ($pmid -or $cr -match 'wamid')) {
      Add-R 'WA_SEND' 'PASS' "providerMessageId present" $cr.Substring(0,[Math]::Min(280,$cr.Length))
      Add-R 'WA_E2E' 'PASS' 'Envoi accepté par Meta Cloud API (preuve provider).'
    } else {
      Add-R 'WA_SEND' 'FAIL' 'Réponse sans preuve provider claire' $cr.Substring(0,[Math]::Min(280,$cr.Length))
      Add-R 'WA_E2E' 'FAIL' 'Pas de preuve providerMessageId.'
    }
  } elseif ($cr -match 'envoi WhatsApp a échoué|échoué|Cloud API HTTP|non configur') {
    Add-R 'WA_SEND' 'FAIL' 'Provider a refusé / erreur' $cr.Substring(0,[Math]::Min(280,$cr.Length))
    Add-R 'WA_E2E' 'FAIL' 'Échec provider — pas de faux succès.'
  } else {
    Add-R 'WA_SEND' 'FAIL' 'Réponse confirm inattendue' $cr.Substring(0,[Math]::Min(280,$cr.Length))
    Add-R 'WA_E2E' 'FAIL' 'Pas de providerMessageId.'
  }
} elseif ($tools -match 'proposeSendWhatsAppMedia') {
  Add-R 'WA_MEDIA' 'NOT_SUPPORTED' 'Audio/image non implémentés.'
  Add-R 'WA_E2E' 'NOT_SUPPORTED' 'Texte requis pour E2E canal WhatsApp.'
} else {
  # Backend non déployé avec tools WA, ou intent non branché
  if ($pend -and $pend.type -eq 'SEND_TENANT_MESSAGE') {
    Add-R 'WA_PROPOSE' 'FAIL' 'Backend a proposé message in-app au lieu de WhatsApp (déploiement manquant ?)' $tools
  } else {
    Add-R 'WA_PROPOSE' 'BLOCKED' "Pas de pending SEND_WHATSAPP_MESSAGE (tools=$tools)" $reply.Substring(0,[Math]::Min(280,$reply.Length))
  }
  Add-R 'WA_E2E' 'BLOCKED' 'Code WhatsApp non déployé ou non configuré sur Railway.'
}

# Stub média
$media = Chat 'Envoie une image WhatsApp au locataire'
$mr = [string]$media.data.reply
if ($mr -match 'non encore disponible|unsupported|pas encore') {
  Add-R 'WA_MEDIA_STUB' 'PASS' 'Audio/image correctement marqués non disponibles'
} else {
  Add-R 'WA_MEDIA_STUB' 'PARTIAL' $mr.Substring(0,[Math]::Min(180,$mr.Length))
}

$results | ConvertTo-Json -Depth 6 | Set-Content -Path $out -Encoding UTF8
$pass = @($results | Where-Object { $_.status -eq 'PASS' }).Count
$fail = @($results | Where-Object { $_.status -eq 'FAIL' }).Count
$blocked = @($results | Where-Object { $_.status -eq 'BLOCKED' }).Count
$ns = @($results | Where-Object { $_.status -eq 'NOT_SUPPORTED' }).Count
$md = @"
# WhatsApp E2E — Intelligence ITC

Date: $(Get-Date -Format o)
API: $base

| Check | Status | Detail |
|-------|--------|--------|
$(($results | ForEach-Object { "| $($_.id) | $($_.status) | $($_.detail) |" }) -join "`n")

**Totals:** PASS=$pass FAIL=$fail BLOCKED=$blocked NOT_SUPPORTED=$ns

## Critère PASS
Un PASS sur ``WA_E2E`` exige un **providerMessageId** Meta après confirmation.
HTTP 200 ITC seul = insuffisant.
"@
$md | Set-Content -Path $reportMd -Encoding UTF8
Write-Output "Wrote $out and $reportMd (PASS=$pass FAIL=$fail BLOCKED=$blocked)"
