$ErrorActionPreference = 'Stop'
$base = 'https://imo-backend-production-d2d1.up.railway.app/api/v1'
$outDir = 'C:\Users\HP\Desktop\ITC\qa-e2e'
$outFile = Join-Path $outDir 'ai_e2e_documents.json'
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

function Test-DocSmoke {
  param($id, $message, $expectedTool)
  $res = Invoke-AiChat -headers $h -message $message
  $reply = [string]$res.data.reply
  $tools = @()
  if ($res.data.toolsUsed) { $tools = @($res.data.toolsUsed) }
  $toolOk = $false
  foreach ($t in $tools) {
    if (("$t" -eq $expectedTool) -or ("$t" -like ('*' + $expectedTool + '*'))) { $toolOk = $true }
  }

  $len = [Math]::Min(320, $reply.Length)
  $snippet = if ($reply.Length -gt 0) { $reply.Substring(0, $len) } else { '' }

  $fakeOcr =
    ($reply -match 'OCR r[eé]ussi') -or
    ($reply -match 'recherche s[eé]mantique') -or
    (($reply -match 'extrait du PDF') -and ($reply -notmatch 'NOT_SUPPORTED') -and ($tools.Count -eq 0))

  if ($fakeOcr) {
    Add-Result $id 'FAIL' 'Hallucinated OCR/RAG claim' $tools $snippet
    return
  }
  if (-not $toolOk) {
    Add-Result $id 'FAIL' ('expected tool ' + $expectedTool + '; got [' + ($tools -join ',') + ']') $tools $snippet
    return
  }

  $noDocs =
    ($reply -match 'Aucun document') -or
    ($reply -match 'aucun contrat') -or
    ($reply -match 'introuvable') -or
    ($reply -match 'Aucun bail')

  if ($noDocs) {
    Add-Result $id 'PARTIAL' ('tool OK but empty org / no docs — [' + ($tools -join ',') + ']') $tools $snippet
    return
  }

  Add-Result $id 'PASS' ('tools=[' + ($tools -join ',') + ']') $tools $snippet
}

$session = Get-Token
$h = @{ Authorization = ('Bearer ' + $session.token); 'Content-Type' = 'application/json' }
$user = $session.user
Write-Output ('userId=' + $user.id + ' role=' + $user.role + ' orgId=' + $user.organizationId)
Write-Output 'NOTE: Phase G = metadata only. OCR/RAG must remain NOT_SUPPORTED.'

Test-DocSmoke -id 'G1_list_docs' -message 'liste des documents' -expectedTool 'listDocumentsForAi'
Test-DocSmoke -id 'G2_resume_contrat' -message 'résume mon contrat' -expectedTool 'summarizeDocument'
Test-DocSmoke -id 'G3_compare_unsupported' -message 'compare ces deux contrats' -expectedTool 'compareDocuments'

$payload = [pscustomobject]@{
  generatedAt = (Get-Date).ToString('o')
  phase = 'G_DOCUMENTS'
  results = $results
}
$payload | ConvertTo-Json -Depth 8 | Set-Content -Path $outFile -Encoding UTF8
Write-Output ('Wrote ' + $outFile)
