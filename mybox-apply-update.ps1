param([string]$InstallRoot,[switch]$VerifyOnly)
$ErrorActionPreference='Stop'
if(-not $InstallRoot){
 Add-Type -AssemblyName System.Windows.Forms
 $picker=New-Object System.Windows.Forms.FolderBrowserDialog
 $picker.Description='기존 상품등록기.exe가 있는 통합 실행판 폴더를 선택하세요.'
 if($picker.ShowDialog() -ne 'OK'){exit 0}
 $InstallRoot=$picker.SelectedPath
}
$InstallRoot=[IO.Path]::GetFullPath($InstallRoot)
$app=[IO.Path]::Combine($InstallRoot,'app')
$manifest=Get-Content -Raw -Encoding UTF8 -LiteralPath (Join-Path $PSScriptRoot 'update-manifest.json') | ConvertFrom-Json
$installed=Get-Content -Raw -Encoding UTF8 -LiteralPath (Join-Path $app 'package.json') | ConvertFrom-Json
$build=Get-Content -Raw -Encoding UTF8 -LiteralPath (Join-Path $InstallRoot 'build-manifest.json') | ConvertFrom-Json
if($manifest.format -ne 1 -or $manifest.project -ne $installed.name){throw '업데이트 대상 프로그램이 다릅니다.'}
if($build.sourceCommit -ne $manifest.baseCommit -and $build.baseCommit -ne $manifest.baseCommit -and $build.sourceCommit -ne 'e66a04e1015ff1a9aa05381019bef0261a795f1f'){throw '11월 17일 통합 실행판 이후 버전이 필요합니다.'}
if(($installed.dependencies | ConvertTo-Json -Compress) -ne ($manifest.dependencies | ConvertTo-Json -Compress)){throw '실행 환경이 달라 통합 실행판 업데이트가 필요합니다.'}
$running=Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.ExecutablePath -and $_.ExecutablePath.StartsWith($InstallRoot+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase) }
if($running){throw '등록기와 가격변경기를 종료한 뒤 다시 적용하세요.'}
$publicData=@('category-catalog-common.json','category-catalog-standard.json','category-crosswalk.json','category-matches.json','category-itemscout-verified.json','washing-icon-library.json')
function CheckedPath([string]$relative,[string]$parent){
 if(-not $relative -or $relative.Contains('..') -or $relative.Contains('\') -or [IO.Path]::IsPathRooted($relative)){throw '잘못된 업데이트 파일 경로'}
 if($relative.StartsWith('data/') -and $relative.Substring(5) -notin $publicData){throw '개인 데이터는 업데이트할 수 없습니다.'}
 if($relative -notmatch '^(?:[^/]+\.(?:mjs|js|json|ps1)|\.app-release\.json|public/.+|research/(?:apparel-tags|official-benefits)/.+|data/[^/]+)$'){throw '업데이트 범위 밖의 파일'}
 $result=[IO.Path]::GetFullPath([IO.Path]::Combine($parent,$relative))
 if(-not $result.StartsWith($parent+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)){throw '업데이트 경로 이탈'}
 $cursor=[IO.Path]::GetDirectoryName($result)
 while($cursor -and $cursor.StartsWith($parent,[StringComparison]::OrdinalIgnoreCase)){
  if((Test-Path -LiteralPath $cursor) -and ((Get-Item -LiteralPath $cursor).Attributes -band [IO.FileAttributes]::ReparsePoint)){throw '연결 폴더에는 업데이트할 수 없습니다.'}
  if($cursor -eq $parent){break};$cursor=[IO.Path]::GetDirectoryName($cursor)
 }
 return $result
}
$seen=@{}
foreach($file in $manifest.files){
 $target=CheckedPath $file.path $app
 $source=CheckedPath $file.path (Join-Path $PSScriptRoot 'payload')
 if($seen.ContainsKey($target)){throw '중복 업데이트 파일'};$seen[$target]=$true
 if((Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash.ToLowerInvariant() -ne $file.sha256){throw ('업데이트 파일 손상: '+$file.path)}
}
foreach($relative in $manifest.deleted){$target=CheckedPath $relative $app;if($seen.ContainsKey($target)){throw '중복 삭제 경로'};$seen[$target]=$true}
if($VerifyOnly){Write-Output '검증 완료';exit 0}
$backup=Join-Path $app ('data/update-backups/'+[DateTime]::Now.ToString('yyyyMMdd-HHmmss-ffff'))
New-Item -ItemType Directory -Path $backup | Out-Null
$changed=New-Object System.Collections.Generic.List[object]
try{
 foreach($file in @($manifest.files)+@($manifest.deleted | ForEach-Object { [pscustomobject]@{path=$_;sha256=$null} } )){
  $target=CheckedPath $file.path $app
  $copy=Join-Path $backup $file.path
  $existed=Test-Path -LiteralPath $target
  if($existed){New-Item -ItemType Directory -Path (Split-Path $copy) -Force | Out-Null;Copy-Item -LiteralPath $target -Destination $copy}
  $changed.Add([pscustomobject]@{Target=$target;Backup=$copy;Existed=$existed})
  if($file.sha256){New-Item -ItemType Directory -Path (Split-Path $target) -Force | Out-Null;Copy-Item -LiteralPath (Join-Path (Join-Path $PSScriptRoot 'payload') $file.path) -Destination $target -Force}
  elseif($existed){Remove-Item -LiteralPath $target}
 }
 Copy-Item -LiteralPath (Join-Path $InstallRoot 'build-manifest.json') -Destination (Join-Path $backup 'build-manifest.json')
 $build | Add-Member -NotePropertyName baseCommit -NotePropertyValue $manifest.baseCommit -Force
 $build.sourceCommit=$manifest.sourceCommit;$build.version=$manifest.version
 $utf8=New-Object System.Text.UTF8Encoding($false)
 [IO.File]::WriteAllText((Join-Path $InstallRoot 'build-manifest.json'),($build | ConvertTo-Json -Depth 10),$utf8)
 Write-Output ('업데이트 완료: '+$manifest.version+' / '+$manifest.sourceCommit.Substring(0,8))
}catch{
 foreach($change in $changed){if($change.Existed){Copy-Item -LiteralPath $change.Backup -Destination $change.Target -Force}elseif(Test-Path -LiteralPath $change.Target){Remove-Item -LiteralPath $change.Target}}
 if(Test-Path -LiteralPath (Join-Path $backup 'build-manifest.json')){Copy-Item -LiteralPath (Join-Path $backup 'build-manifest.json') -Destination (Join-Path $InstallRoot 'build-manifest.json') -Force}
 throw
}
