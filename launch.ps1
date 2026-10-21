if (Test-Path -LiteralPath 'D:\CodexStorage\Browsers') { $env:PLAYWRIGHT_BROWSERS_PATH = 'D:\CodexStorage\Browsers' }
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$bundled = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies'
$nodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue
if ($nodeCommand) { $runtimeNode = $nodeCommand.Source } else { $runtimeNode = Join-Path $bundled 'node\bin\node.exe' }
if (-not (Test-Path -LiteralPath $runtimeNode)) { throw 'Node.js LTS를 설치해 주세요: https://nodejs.org/' }
$env:PATH = (Split-Path $runtimeNode) + ';' + $env:PATH
if (-not (Test-Path -LiteralPath 'node_modules\playwright')) {
  $npmCommand = Get-Command npm.cmd -ErrorAction SilentlyContinue
  if ($npmCommand) {
    & $npmCommand.Source install --no-audit --no-fund
  } else {
    $bundledPnpm = Join-Path $bundled 'bin\fallback\pnpm.cmd'
    if (-not (Test-Path -LiteralPath $bundledPnpm)) { throw 'npm이 포함된 Node.js LTS를 설치해 주세요.' }
    & $bundledPnpm install --ignore-scripts
  }
  if ($LASTEXITCODE -ne 0) { throw '패키지 설치에 실패했습니다.' }
}
& $runtimeNode 'node_modules\playwright\cli.js' install chromium
if ($LASTEXITCODE -ne 0) { throw '전용 브라우저 설치에 실패했습니다.' }
try { Start-Process 'https://chatgpt.com/' } catch { Write-Warning 'ChatGPT 화면을 열지 못했습니다. 브라우저에서 chatgpt.com을 열어 주세요.' }
& $runtimeNode server.mjs
