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
# /tenants renvoie data: Tenant[] (pas data.items) — ne pas lire .items sur un tableau PS
$raw = $tenants.data
if ($null -eq $raw) { throw 'Aucun locataire (data null)' }
if ($raw -is [System.Array]) {
  $tItems = @($raw)
} elseif ($raw.PSObject.Properties.Name -contains 'items') {
  $tItems = @($raw.items)
} else {
  $tItems = @($raw)
}
Write-Output ("tenants_count={0}" -f $tItems.Count)

$tenant = $null
if ($env:ITC_WA_TEST_TENANT_ID) {
  $tenant = $tItems | Where-Object { $_.id -eq $env:ITC_WA_TEST_TENANT_ID } | Select-Object -First 1
}
if (-not $tenant -and $env:ITC_WA_TEST_PHONE) {
  $want = ($env:ITC_WA_TEST_PHONE -replace '\D', '')
  $tenant = $tItems | Where-Object {
    $p = ($_.phone -replace '\D', '')
    $p -and ($p -eq $want -or $p.EndsWith($want) -or $want.EndsWith($p))
  } | Select-Object -First 1
}
if (-not $tenant) {
  $tenant = $tItems | Where-Object { $_.phone -and $_.phone.ToString().Trim().Length -ge 8 } | Select-Object -First 1
}
if (-not $tenant -or -not $tenant.id) {
  throw "Locataire de test introuvable (définir ITC_WA_TEST_TENANT_ID ou ITC_WA_TEST_PHONE)."
}

$stamp = Get-Date -Format 'HHmmss'
$bodyText = "Bonjour Fortune, rappel de loyer test ITC WhatsApp numero $stamp."
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
      Add-R 'WA_SEND' 'PASS' "providerMessageId=$pmid" $cr.Substring(0,[Math]::Min(280,$cr.Length))
      # Vérifier persistance Message (channel/deliveryStatus/providerMessageId)
      try {
        Start-Sleep -Seconds 1
        $msgs = Invoke-RestMethod -Uri "$base/notification-center/messages" -Headers $h
        $mItems = @($msgs.data)
        if ($msgs.data -isnot [System.Array] -and $msgs.data.items) { $mItems = @($msgs.data.items) }
        $hit = $mItems | Where-Object {
          $_.channel -eq 'WHATSAPP' -and (
            ($pmid -and $_.providerMessageId -eq $pmid) -or
            ($_.body -and $_.body.ToString().Contains('WhatsApp ITC'))
          )
        } | Select-Object -First 1
        if ($hit) {
          Add-R 'WA_PERSIST' 'PASS' ("deliveryStatus={0} providerMessageId={1} messageId={2}" -f $hit.deliveryStatus,$hit.providerMessageId,$hit.id)
        } else {
          Add-R 'WA_PERSIST' 'PARTIAL' 'Réponse IA OK mais ligne Message WHATSAPP non trouvée via API messages'
        }
      } catch {
        Add-R 'WA_PERSIST' 'PARTIAL' ("Impossible de lister messages: {0}" -f $_.Exception.Message)
      }
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
