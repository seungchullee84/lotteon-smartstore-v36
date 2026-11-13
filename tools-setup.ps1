param(
    [Parameter(Mandatory)][string]$NodeExe,
    [Parameter(Mandatory)][string]$OpenMausCli,
    [Parameter(Mandatory)][string]$OpenMausInstallRoot,
    [string]$RapidOcrInstallRoot = (Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) 'CodexRegistrar\RapidOCR-3.10.0')
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$tar = Join-Path $env:SystemRoot 'System32\tar.exe'

function Invoke-Tool($Program, [string[]]$Arguments) {
    if (-not (Test-Path -LiteralPath $Program -PathType Leaf)) { throw "Missing executable: $(Split-Path -Leaf $Program)" }
    $ErrorActionPreference = 'SilentlyContinue'
    $output = & $Program @Arguments 2>$null
    if ($LASTEXITCODE -ne 0) { throw "Failed to run $(Split-Path -Leaf $Program)" }
    return $output
}

function Save-Archive($Url, $File, $Algorithm, $Digest) {
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    Invoke-WebRequest -UseBasicParsing -Uri $Url -OutFile $File -TimeoutSec 180
    if ((Get-FileHash -LiteralPath $File -Algorithm $Algorithm).Hash -ne $Digest) {
        throw 'Installer archive checksum mismatch'
    }
}

function New-Stage($Parent) {
    $directory = New-Item -ItemType Directory -Path $Parent -Force
    $stage = New-Item -ItemType Directory -Path (Join-Path $directory.FullName ('.setup-' + [Guid]::NewGuid().ToString('N')))
    return $stage.FullName
}

function Remove-Stage($Stage, $Parent) {
    $resolved = (Resolve-Path -LiteralPath $Stage).ProviderPath
    $root = (Resolve-Path -LiteralPath $Parent).ProviderPath
    if ([IO.Path]::GetDirectoryName($resolved) -eq $root -and [IO.Path]::GetFileName($resolved) -match '^\.setup-[a-f0-9]{32}$') {
        Remove-Item -LiteralPath $resolved -Recurse -Force
    }
}

function Publish-Directory($Source, $Destination, $Stage) {
    $sourcePath = (Resolve-Path -LiteralPath $Source).ProviderPath
    $stagePath = (Resolve-Path -LiteralPath $Stage).ProviderPath
    $targetPath = [IO.Path]::GetFullPath($Destination)
    if ([IO.Path]::GetDirectoryName($sourcePath) -ne $stagePath -or
        [IO.Path]::GetDirectoryName($targetPath) -ne [IO.Path]::GetDirectoryName($stagePath)) {
        throw 'Unexpected installer directory'
    }
    if (Test-Path -LiteralPath $targetPath) {
        Rename-Item -LiteralPath $targetPath -NewName ([IO.Path]::GetFileName($targetPath) + '.previous-' + [Guid]::NewGuid().ToString('N'))
    }
    [IO.Directory]::Move($sourcePath, $targetPath)
}

function Install-OpenMaus {
    $relativeCli = 'node_modules\openmausbot\cli.js'
    $managedCli = Join-Path $OpenMausInstallRoot $relativeCli
    if ((Test-Path -LiteralPath $OpenMausCli -PathType Leaf) -or (Test-Path -LiteralPath $managedCli -PathType Leaf)) { return }
    if ([int](Invoke-Tool $NodeExe @('-p', "process.versions.node.split('.')[0]")) -lt 24) {
        Write-Output 'OpenMausBot:node'
        return
    }

    $parent = Split-Path -Parent $OpenMausInstallRoot
    $stage = New-Stage $parent
    try {
        # The portable registrar ships node.exe without npm. Use the same pinned npm CLI on either install route.
        $archive = Join-Path $stage 'npm.tgz'
        Save-Archive 'https://registry.npmjs.org/npm/-/npm-11.12.0.tgz' $archive SHA512 'C4F84E6A9E196C95B277B0C03AE90FE7AE161703521AEFF615E4D114786288AB6171ABB1847FCDA64240426DB8C43F9C027F1ABF9B50D34A618BDF03AAD7CBB2'
        Invoke-Tool $tar @('-xf', $archive, '-C', $stage) | Out-Null
        $npm = Join-Path $stage 'package\bin\npm-cli.js'
        $install = (New-Item -ItemType Directory -Path (Join-Path $stage 'runtime')).FullName
        Invoke-Tool $NodeExe @($npm, 'install', '--prefix', $install, '--registry=https://registry.npmjs.org/',
            '--userconfig', (Join-Path $stage 'user.npmrc'), '--globalconfig', (Join-Path $stage 'global.npmrc'),
            '--ignore-scripts', '--no-save', '--no-package-lock', '--no-audit', '--no-fund',
            '--fetch-retries=1', '--fetch-timeout=30000', 'openmausbot@0.1.150') | Out-Null
        if ((Invoke-Tool $NodeExe @((Join-Path $install $relativeCli), '--version')) -ne '0.1.150') {
            throw 'OpenMausBot version check failed'
        }
        Publish-Directory $install $OpenMausInstallRoot $stage
        Write-Output 'OpenMausBot:installed'
    } finally {
        Remove-Stage $stage $parent
    }
}

function Find-RapidOcrPython {
    $check = 'import sys; assert sys.version_info >= (3, 11); print(sys.executable)'
    $bundled = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe'
    $python = Get-Command python.exe -CommandType Application -ErrorAction SilentlyContinue | Where-Object { $_.Source -notlike '*\Microsoft\WindowsApps\*' } | Select-Object -First 1
    foreach ($candidate in @($bundled, $python.Source)) {
        if ($candidate) {
            try { return Invoke-Tool $candidate @('-I', '-c', $check) } catch {}
        }
    }
    $launcher = Get-Command py.exe -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($launcher -and $launcher.Source -notlike '*\Microsoft\WindowsApps\*') {
        try { return Invoke-Tool $launcher.Source @('-3', '-I', '-c', $check) } catch {}
    }
}

function Install-RapidOcr {
    $pointer = Join-Path $RapidOcrInstallRoot 'python.txt'
    if (Test-Path -LiteralPath $pointer -PathType Leaf) {
        $current = [IO.File]::ReadAllText($pointer).Trim()
        if ($current -and (Test-Path -LiteralPath $current -PathType Leaf)) { return }
    }
    $python = Find-RapidOcrPython
    if (-not $python) { Write-Output 'RapidOCR:python'; return }
    $parent = Split-Path -Parent $RapidOcrInstallRoot
    $stage = New-Stage $parent
    try {
        $install = (New-Item -ItemType Directory -Path (Join-Path $stage 'runtime')).FullName
        $packages = Join-Path $install 'packages'
        Invoke-Tool $python @('-I', '-B', '-m', 'pip', '--isolated', 'install', '--index-url', 'https://pypi.org/simple',
            '--no-input', '--disable-pip-version-check', '--no-cache-dir', '--only-binary=:all:', '--target', $packages,
            'rapidocr==3.10.0', 'onnxruntime==1.31.1') | Out-Null
        $models = Join-Path $packages 'rapidocr\models'
        $source = 'https://www.modelscope.cn/models/RapidAI/RapidOCR/resolve/v3.10.0/onnx/PP-OCRv5'
        Save-Archive "$source/det/ch_PP-OCRv5_det_mobile.onnx" (Join-Path $models 'ch_PP-OCRv5_det_mobile.onnx') SHA256 '4D97C44A20D30A81AAD087D6A396B08F786C4635742AFC391F6621F5C6AE78AE'
        Save-Archive "$source/rec/korean_PP-OCRv5_rec_mobile.onnx" (Join-Path $models 'korean_PP-OCRv5_rec_mobile.onnx') SHA256 'CD6E2EA50F6943CA7271EB8C56A877A5A90720B7047FE9C41A2E541A25773C9B'
        Invoke-Tool $python @('-I', '-B', '-c', 'import sys; sys.path.insert(0, sys.argv[1]); import rapidocr, onnxruntime', $packages) | Out-Null
        [IO.File]::WriteAllText((Join-Path $install 'python.txt'), $python)
        Publish-Directory $install $RapidOcrInstallRoot $stage
        Write-Output 'RapidOCR:installed'
    } finally {
        Remove-Stage $stage $parent
    }
}

function Test-FFmpegBin($Bin) {
    (Test-Path -LiteralPath (Join-Path $Bin 'ffmpeg.exe') -PathType Leaf) -and
    (Test-Path -LiteralPath (Join-Path $Bin 'ffprobe.exe') -PathType Leaf)
}

function Add-UserPath($Bin) {
    $userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
    $entries = $userPath -split ';' | ForEach-Object { $_.Trim().Trim('"').TrimEnd('\') }
    if ($entries -notcontains $Bin.TrimEnd('\')) {
        $next = (@($userPath, $Bin) | Where-Object { $_ }) -join ';'
        [Environment]::SetEnvironmentVariable('Path', $next, 'User')
    }
    $env:Path = $env:Path + ';' + $Bin
    Write-Output ('Path:' + $Bin)
}

function Install-FFmpeg($Parent = (Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) 'Programs\FFmpeg')) {
    $ffmpeg = Get-Command ffmpeg.exe -CommandType Application -ErrorAction SilentlyContinue
    $ffprobe = Get-Command ffprobe.exe -CommandType Application -ErrorAction SilentlyContinue
    if ($ffmpeg -and $ffprobe) {
        $ffmpeg, $ffprobe | ForEach-Object { 'Path:' + (Split-Path -Parent $_.Source) } | Select-Object -Unique
        return
    }

    foreach ($directory in (Get-ChildItem -LiteralPath $parent -Directory -Filter 'ffmpeg-*' -ErrorAction SilentlyContinue)) {
        $bin = Join-Path $directory.FullName 'bin'
        if (Test-FFmpegBin $bin) { Add-UserPath $bin; return }
    }

    $stage = New-Stage $parent
    try {
        $release = 'ffmpeg-9.0.2-essentials_build'
        $archive = Join-Path $stage 'ffmpeg.7z'
        Save-Archive "https://github.com/GyanD/codexffmpeg/releases/download/9.0.2/$release.7z" $archive SHA256 '4705843CCAAF54257C16AD90F3E952ECE33C17DF964ECF7BFDBB0F49C7171077'
        Invoke-Tool $tar @('-xf', $archive, '-C', $stage) | Out-Null
        $extracted = Join-Path $stage $release
        $bin = Join-Path $extracted 'bin'
        Invoke-Tool (Join-Path $bin 'ffmpeg.exe') @('-version') | Out-Null
        Invoke-Tool (Join-Path $bin 'ffprobe.exe') @('-version') | Out-Null
        $target = Join-Path $parent $release
        Publish-Directory $extracted $target $stage
        Add-UserPath (Join-Path $target 'bin')
        Write-Output 'FFmpeg:installed'
    } finally {
        Remove-Stage $stage $parent
    }
}

function Install-HyperFrames {
    $command = Get-Command codex.exe,codex.cmd -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
    $codex = $command.Source
    if (-not $codex) {
        $package = Get-AppxPackage -Name 'OpenAI.Codex' | Sort-Object Version -Descending | Select-Object -First 1
        if ($package) { $codex = Join-Path $package.InstallLocation 'app\resources\codex.exe' }
    }
    if (-not $codex -or -not (Test-Path -LiteralPath $codex -PathType Leaf)) {
        Write-Output 'HyperFrames:codex'
        return
    }

    Write-Output ('Path:' + (Split-Path -Parent $codex))
    $inventory = Invoke-Tool $codex @('plugin', 'list', '--json') | Out-String | ConvertFrom-Json
    if (-not $inventory.PSObject.Properties['installed']) { throw 'Could not read installed Codex plugins' }
    if ($inventory.installed | Where-Object { $_.name -eq 'hyperframes' }) { return }
    try { Invoke-Tool $codex @('login', 'status') | Out-Null }
    catch { Write-Output 'HyperFrames:login'; return }
    $result = Invoke-Tool $codex @('plugin', 'add', 'hyperframes@openai-curated-remote', '--json') | Out-String | ConvertFrom-Json
    if (-not $result.installedPath) { throw 'HyperFrames installation was not confirmed' }
    Write-Output 'HyperFrames:installed'
}

# Re-read PATH for registrars launched from a desktop process opened before the previous install.
$userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
if ($userPath) { $env:Path += ';' + $userPath }
$sid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
$mutex = New-Object System.Threading.Mutex($false, "Local\GiordanoRegistrarTools-$sid")
try {
    try { $locked = $mutex.WaitOne(0) }
    catch [System.Threading.AbandonedMutexException] { $locked = $true }
    if (-not $locked) { return }
    foreach ($tool in @('RapidOCR', 'OpenMausBot', 'FFmpeg', 'HyperFrames')) {
        try {
            switch ($tool) {
                RapidOCR { Install-RapidOcr }
                OpenMausBot { Install-OpenMaus }
                FFmpeg { Install-FFmpeg }
                HyperFrames { Install-HyperFrames }
            }
        } catch {
            Write-Output ("${tool}:failed")
            [Console]::Error.WriteLine($_.Exception.Message)
        }
    }
} finally {
    if ($locked) { $mutex.ReleaseMutex() }
    $mutex.Dispose()
}
