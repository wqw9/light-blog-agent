# One-shot verification: build -> prisma db -> seed -> server/upload smoke -> web smoke
# Run under the sandbox escalation channel (Prisma engines / dev servers need child-process pipes).
# NOTE: keep this file ASCII-only so Windows PowerShell 5.1 (GBK) can parse it.
$ErrorActionPreference = 'Stop'
$root = 'D:\code.game\MyBlog'
Set-Location $root

function Invoke-NodeStep([string]$Name, [string[]]$NodeArgs, [string]$Cwd) {
  Write-Host "$Name ..."
  Push-Location $Cwd
  & node @NodeArgs
  $code = $LASTEXITCODE
  Pop-Location
  if ($code -ne 0) { throw "$Name failed (exit=$code)" }
  Write-Host "$Name OK"
}

Write-Host '[1/6] build packages'
Invoke-NodeStep '  shared' @('node_modules/typescript/bin/tsc', '-p', 'tsconfig.json') "$root\packages\shared"
Invoke-NodeStep '  markdown' @('node_modules/typescript/bin/tsc', '-p', 'tsconfig.json') "$root\packages\markdown"

Write-Host '[2/6] prisma generate + db push'
Invoke-NodeStep '  generate' @('node_modules/prisma/build/index.js', 'generate') "$root\apps\server"
Invoke-NodeStep '  db push' @('node_modules/prisma/build/index.js', 'db', 'push', '--skip-generate') "$root\apps\server"

Write-Host '[3/6] seed articles'
Invoke-NodeStep '  seed' @('node_modules/tsx/dist/cli.mjs', 'prisma/seed.ts') "$root\apps\server"

Write-Host '[4/6] start server + smoke tests'
# verify-server-entry.js injects the test password in-process (no env inheritance, no config writes)
$serverOut = "$root\.verify-server.log"
$serverErr = "$root\.verify-server-err.log"
$server = Start-Process -FilePath 'node' -ArgumentList "$root\scripts\verify-server-entry.js" `
  -WorkingDirectory "$root\apps\server" `
  -RedirectStandardOutput $serverOut -RedirectStandardError $serverErr -PassThru

$web = $null
try {
  $ready = $false
  for ($i = 0; $i -lt 40; $i++) {
    Start-Sleep -Milliseconds 500
    if ($server.HasExited) { break }
    try {
      $articles = Invoke-RestMethod -Uri 'http://localhost:3000/api/articles' -TimeoutSec 2
      if ($articles.total -ge 1) { $ready = $true; break }
    } catch {}
  }
  if (-not $ready) { throw "server not ready. log: $(Get-Content $serverErr -Raw -ErrorAction SilentlyContinue)" }
  Write-Host "  articles total=$($articles.total)"

  $first = $articles.items[0]
  $detail = Invoke-RestMethod -Uri "http://localhost:3000/api/articles/$($first.slug)"
  $ch = Invoke-RestMethod -Uri "http://localhost:3000/api/articles/$($detail.id)/chapters/1"
  Write-Host "  chapter OK: '$($ch.title)' htmlLen=$($ch.html.Length) toc=$($ch.toc.Count)"

  $tags = Invoke-RestMethod -Uri 'http://localhost:3000/api/tags'
  Write-Host "  tags OK: $($tags.Count)"

  $site = Invoke-RestMethod -Uri 'http://localhost:3000/api/site'
  Write-Host "  site OK: $($site.name)"

  $ov = Invoke-RestMethod -Uri 'http://localhost:3000/api/stats/overview'
  Write-Host "  stats overview OK: articles=$($ov.articleTotal) words=$($ov.wordTotal) views=$($ov.viewTotal)"
  $hm = Invoke-RestMethod -Uri 'http://localhost:3000/api/stats/heatmap'
  if ($hm.days.Count -ne 365) { throw "heatmap days=$($hm.days.Count)" }
  $mo = Invoke-RestMethod -Uri 'http://localhost:3000/api/stats/monthly'
  if ($mo.months.Count -ne 12) { throw "monthly months=$($mo.months.Count)" }
  $top = Invoke-RestMethod -Uri 'http://localhost:3000/api/stats/top'
  Write-Host "  stats endpoints OK (heatmap 365d, monthly 12m, top rows=$($top.Count))"
  $about = Invoke-RestMethod -Uri 'http://localhost:3000/api/site/about'
  Write-Host "  about OK: links=$($about.links.Count) skills=$($about.skills.Count)"
  $mascot = Invoke-RestMethod -Uri 'http://localhost:3000/api/site/mascot'
  Write-Host "  mascot config OK: enabled=$($mascot.enabled) model=$($mascot.modelUrl)"
  $llm = Invoke-RestMethod -Uri 'http://localhost:3000/api/llm/status'
  Write-Host "  llm status OK: enabled=$($llm.enabled) configured=$($llm.configured)"

  $testMd = "$root\.verify-test.md"
  $testContent = "---`ntitle: verify-upload`ntags: [test]`n---`n`nUpload smoke test content.`n"
  [System.IO.File]::WriteAllText($testMd, $testContent, [System.Text.UTF8Encoding]::new($false))
  $up = & curl.exe -s -H "x-admin-token: verify-pass" -F "files=@$testMd" http://localhost:3000/api/upload
  Write-Host "  upload OK: $up"

  Write-Host '  [admin] management tests (encoding / guard / undo / uploads / rate-limit)'
  Invoke-NodeStep '  admin tests' @('scripts/verify-admin.mjs', 'verify-pass') $root
  Invoke-NodeStep '  security helpers' @('node_modules/tsx/dist/cli.mjs', '..\..\scripts\verify-security.ts') "$root\apps\server"
  Write-Host '  admin tests OK'

  Write-Host '[5/6] build web (validates all SFC compilation)'
Invoke-NodeStep '  web build' @('node_modules/vite/bin/vite.js', 'build') "$root\apps\web"

Write-Host '[6/6] start web dev + smoke tests'
  $webOut = "$root\.verify-web.log"
  $webErr = "$root\.verify-web-err.log"
  $web = Start-Process -FilePath 'node' -ArgumentList 'node_modules/vite/bin/vite.js' `
    -WorkingDirectory "$root\apps\web" `
    -RedirectStandardOutput $webOut -RedirectStandardError $webErr -PassThru

  $webReady = $false
  for ($i = 0; $i -lt 40; $i++) {
    Start-Sleep -Milliseconds 500
    if ($web.HasExited) { break }
    try {
      $html = & curl.exe -s http://127.0.0.1:5173/
      if ($html -match 'id="app"') { $webReady = $true; break }
    } catch {}
  }
  if (-not $webReady) {
    $webLogTail = (Get-Content $webOut -Raw -ErrorAction SilentlyContinue) + (Get-Content $webErr -Raw -ErrorAction SilentlyContinue)
    throw "web not ready. log: $webLogTail"
  }
  Write-Host '  index page OK'

  $proxy = Invoke-RestMethod -Uri 'http://127.0.0.1:5173/api/site' -TimeoutSec 5
  Write-Host "  proxy OK: $($proxy.name)"

  Write-Host 'VERIFY-ALL-PASS'
} finally {
  # cleanup smoke-test articles, keep shelf clean
  if ($server -and -not $server.HasExited) {
    try {
      $adminHeaders = @{ 'x-admin-token' = 'verify-pass' }
      $all = Invoke-RestMethod -Uri 'http://localhost:3000/api/articles?pageSize=50' -TimeoutSec 3
      $test = @($all.items | Where-Object { $_.slug -like 'verify-upload*' })
      foreach ($t in $test) {
        Invoke-RestMethod -Method Delete -Uri "http://localhost:3000/api/articles/$($t.id)" -Headers $adminHeaders -TimeoutSec 3 | Out-Null
        Write-Host "  cleaned test article id=$($t.id)"
      }
    } catch {}
  }
  if ($web) { Stop-Process -Id $web.Id -Force -ErrorAction SilentlyContinue }
  if ($server) { Stop-Process -Id $server.Id -Force -ErrorAction SilentlyContinue }
  Remove-Item "$root\.verify-test.md" -Force -ErrorAction SilentlyContinue
}
