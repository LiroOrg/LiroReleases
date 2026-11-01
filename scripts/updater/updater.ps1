param(
  [string]$Request = '',
  [string]$Version = ''
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
[System.Windows.Forms.Application]::EnableVisualStyles()

if (-not $Request) { $Request = $env:LIRO_UPDATE_REQUEST }
if (-not $Request) { $Request = Join-Path $env:APPDATA 'Liro\update-request.json' }

function Read-Request($path) {
  if (-not (Test-Path -LiteralPath $path)) { return $null }
  return (Get-Content -LiteralPath $path -Raw) | ConvertFrom-Json
}

function New-Window($version) {
  $form = New-Object System.Windows.Forms.Form
  $form.Text = 'Обновление Liro'
  $form.ClientSize = New-Object System.Drawing.Size(420, 150)
  $form.StartPosition = 'CenterScreen'
  $form.FormBorderStyle = 'FixedDialog'
  $form.MaximizeBox = $false
  $form.MinimizeBox = $false
  $form.ControlBox = $false
  $form.ShowInTaskbar = $true
  $form.TopMost = $true
  $form.BackColor = [System.Drawing.Color]::FromArgb(11, 11, 13)

  $title = New-Object System.Windows.Forms.Label
  $title.Text = "Устанавливается Liro $version"
  $title.ForeColor = [System.Drawing.Color]::White
  $title.Font = New-Object System.Drawing.Font('Segoe UI', 11, [System.Drawing.FontStyle]::Bold)
  $title.Location = New-Object System.Drawing.Point(22, 24)
  $title.AutoSize = $true

  $hint = New-Object System.Windows.Forms.Label
  $hint.Text = 'Не закрывайте это окно'
  $hint.ForeColor = [System.Drawing.Color]::FromArgb(150, 150, 158)
  $hint.Font = New-Object System.Drawing.Font('Segoe UI', 8.5)
  $hint.Location = New-Object System.Drawing.Point(22, 50)
  $hint.AutoSize = $true

  $track = New-Object System.Windows.Forms.Panel
  $track.BackColor = [System.Drawing.Color]::FromArgb(32, 32, 38)
  $track.Location = New-Object System.Drawing.Point(22, 84)
  $track.Size = New-Object System.Drawing.Size(376, 8)

  $fill = New-Object System.Windows.Forms.Panel
  $fill.BackColor = [System.Drawing.Color]::White
  $fill.Location = New-Object System.Drawing.Point(0, 0)
  $fill.Size = New-Object System.Drawing.Size(0, 8)
  $track.Controls.Add($fill)

  $percent = New-Object System.Windows.Forms.Label
  $percent.Text = '0%'
  $percent.ForeColor = [System.Drawing.Color]::White
  $percent.Font = New-Object System.Drawing.Font('Segoe UI', 9)
  $percent.Location = New-Object System.Drawing.Point(22, 100)
  $percent.AutoSize = $true

  $cancel = New-Object System.Windows.Forms.Button
  $cancel.Text = 'Отмена'
  $cancel.ForeColor = [System.Drawing.Color]::Black
  $cancel.BackColor = [System.Drawing.Color]::White
  $cancel.FlatStyle = 'Flat'
  $cancel.Size = New-Object System.Drawing.Size(110, 30)
  $cancel.Location = New-Object System.Drawing.Point(288, 96)

  $form.Controls.Add($title)
  $form.Controls.Add($hint)
  $form.Controls.Add($track)
  $form.Controls.Add($percent)
  $form.Controls.Add($cancel)
  return @{ Form = $form; Fill = $fill; Track = $track; Percent = $percent; Hint = $hint; Cancel = $cancel }
}

function Set-Progress($ui, $value, $text) {
  $wide = [int](($ui.Track.Width - 2) * [math]::Max(0, [math]::Min(100, $value)) / 100)
  $ui.Fill.Width = $wide
  $ui.Percent.Text = "$([int][math]::Round($value))%"
  if ($text) { $ui.Hint.Text = $text }
  [void]$ui.Form.Refresh()
  [System.Windows.Forms.Application]::DoEvents()
}

function Copy-Staged($ui, $from, $to) {
  $source = New-Object System.IO.FileStream($from, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read)
  try {
    $dest = New-Object System.IO.FileStream($to, [System.IO.FileMode]::Create, [System.IO.FileAccess]::Write)
    try {
      $buffer = New-Object byte[] 8388608
      $total = $source.Length
      $done = 0
      while ($true) {
        $read = $source.Read($buffer, 0, $buffer.Length)
        if ($read -le 0) { break }
        $dest.Write($buffer, 0, $read)
        $done += $read
        Set-Progress $ui ($done / [math]::Max(1, $total) * 85) 'Копирование файлов'
        if ($script:cancelled) { return 0 }
      }
      $dest.Flush()
    } finally { $dest.Dispose() }
  } finally { $source.Dispose() }
  return (Get-Item -LiteralPath $to).Length
}

function Write-Report($ui, $path, $text) {
  if ($path) { Set-Content -LiteralPath $path -Value $text -Encoding ascii }
}

function Start-Liro($exe) {
  Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
  Start-Process -FilePath $exe -ErrorAction SilentlyContinue
}

function Close-Liro($processId) {
  if (-not $processId) { return }
  $process = Get-Process -Id $processId -ErrorAction SilentlyContinue
  if (-not $process) { return }
  if ($process.MainWindowHandle -ne 0) { [void]$process.CloseMainWindow() }
  $waited = 0
  while ($waited -lt 20 -and (Get-Process -Id $processId -ErrorAction SilentlyContinue)) {
    Start-Sleep -Milliseconds 500
    $waited += 1
  }
  Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
}

function Download-File($ui, $url, $to) {
  [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor 3072
  $response = $null
  $done = 0
  $total = 0
  try {
    while ($true) {
      $request = [System.Net.HttpWebRequest]::Create($url)
      $request.UserAgent = 'Liro'
      $request.AllowAutoRedirect = $false
      $request.Timeout = 30000
      $response = $request.GetResponse()
      $code = [int]$response.StatusCode
      if ($code -ge 300 -and $code -lt 400) {
        $url = $response.Headers['Location']
        $response.Close()
        $response = $null
        continue
      }
      break
    }
    $total = $response.ContentLength
    $source = $response.GetResponseStream()
    $dest = New-Object System.IO.FileStream($to, [System.IO.FileMode]::Create, [System.IO.FileAccess]::Write)
    try {
      $buffer = New-Object byte[] 8388608
      while ($true) {
        $read = $source.Read($buffer, 0, $buffer.Length)
        if ($read -le 0) { break }
        $dest.Write($buffer, 0, $read)
        $done += $read
        if ($total) { Set-Progress $ui ($done / $total * 80) 'Загрузка' }
        else { Set-Progress $ui 40 'Загрузка' }
        if ($script:cancelled) { return 0 }
      }
      $dest.Flush()
    } finally {
      $dest.Dispose()
      $source.Dispose()
    }
  } finally {
    if ($response) { $response.Close() }
  }
  return (Get-Item -LiteralPath $to).Length
}

function Find-LiroExe {
  $default = Join-Path $env:LOCALAPPDATA 'Programs\Liro\Liro.exe'
  if (Test-Path -LiteralPath $default) { return $default }
  $running = Get-Process -Name Liro -ErrorAction SilentlyContinue | Where-Object { $_.Path }
  if ($running) { return $running[0].Path }
  return ''
}

function New-StandaloneRequest($ui, $version) {
  $exe = Find-LiroExe
  if (-not $exe) { throw 'Liro не найден — сначала установите приложение' }
  $resources = Split-Path -Parent (Split-Path -Parent $exe)
  $target = Join-Path $resources 'app.asar'
  if (-not (Test-Path -LiteralPath $target)) { throw 'Файл приложения не найден' }
  $work = Join-Path $env:APPDATA 'Liro\updater'
  New-Item -ItemType Directory -Force -Path $work | Out-Null
  $staged = Join-Path $work 'app.next'
  $started = Join-Path $work 'started.json'
  $url = "https://github.com/LiroOrg/LiroReleases/releases/download/v$version/app.asar"
  Set-Progress $ui 2 'Загрузка'
  $size = Download-File $ui $url $staged
  if ($script:cancelled) { return $null }
  if ($size -lt 1000000) { throw 'Загруженный файл слишком мал' }
  $process = Get-Process -Name Liro -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $exe } | Select-Object -First 1
  if (Test-Path -LiteralPath $started) { Remove-Item -LiteralPath $started -Force -ErrorAction SilentlyContinue }
  $job = [pscustomobject]@{
    version = $version
    staged  = $staged
    target  = $target
    backup  = "$target.bak"
    exe     = $exe
    pid     = 0
    report  = Join-Path $env:APPDATA 'Liro\update-result.txt'
    lock    = Join-Path $env:APPDATA 'Liro\updating.json'
    started = $started
  }
  if ($process) { $job.pid = $process.Id }
  return $job
}

$standalone = (-not $Request) -and (-not $env:LIRO_UPDATE_REQUEST) -and [bool]$Version
if (-not $Request) { $Request = $env:LIRO_UPDATE_REQUEST }
if (-not $Request) { $Request = Join-Path $env:APPDATA 'Liro\update-request.json' }
$job = $null
if (-not $standalone) { $job = Read-Request $Request }
if (-not $job -and -not $standalone) { exit 1 }
if ($Version) { $Version = $Version.TrimStart('v') }

$mutex = New-Object System.Threading.Mutex($false, 'Global\Liro-Update')
if (-not $mutex.WaitOne(0)) {
  [void][System.Windows.Forms.MessageBox]::Show('Обновление уже выполняется.', 'Liro', 'OK', 'Information')
  exit 0
}

$ui = New-Window $Version
$script:cancelled = $false
$ui.Cancel.Add_Click({
  $script:cancelled = $true
  $ui.Hint.Text = 'Отменяем'
  $ui.Cancel.Enabled = $false
})
$ui.Form.Add_Shown({ $ui.Form.Activate() })
[void]$ui.Form.Show()
Set-Progress $ui 0 'Копирование файлов'

if ($standalone) {
  try {
    $job = New-StandaloneRequest $ui $Version
  } catch {
    Set-Progress $ui 100 $_.Exception.Message
    Start-Sleep -Milliseconds 4000
    $ui.Form.Close()
    exit 1
  }
  if (-not $job) {
    $ui.Form.Close()
    exit 0
  }
  Set-Progress $ui 82 'Файл загружен'
}

$next = "$($job.target).new"
$swapDone = $false
$result = 'cancel'

try {
  $size = 0
  if ($standalone) { $size = (Get-Item -LiteralPath $job.staged).Length }
  else { $size = Copy-Staged $ui $job.staged $next }
  if (-not $script:cancelled) {
    Set-Progress $ui 88 'Закрываем Liro'
    Close-Liro $job.pid
    $gone = 0
    while (-not $script:cancelled -and $gone -lt 120) {
      if (-not $job.pid -or -not (Get-Process -Id $job.pid -ErrorAction SilentlyContinue)) { break }
      Start-Sleep -Milliseconds 300
      $gone += 1
      [System.Windows.Forms.Application]::DoEvents()
    }
    while (-not $script:cancelled) {
      try {
        if (-not (Test-Path -LiteralPath $job.target) -and (Test-Path -LiteralPath $job.backup)) {
          Move-Item -LiteralPath $job.backup -Destination $job.target -Force -ErrorAction Stop
        }
        if (-not (Test-Path -LiteralPath $next)) { throw 'нет файла обновления' }
        if (Test-Path -LiteralPath $job.backup) { Remove-Item -LiteralPath $job.backup -Force -ErrorAction Stop }
        if (Test-Path -LiteralPath $job.target) {
          Move-Item -LiteralPath $job.target -Destination $job.backup -ErrorAction Stop
        }
        Move-Item -LiteralPath $next -Destination $job.target -ErrorAction Stop
        if ((Get-Item -LiteralPath $job.target).Length -ne $size) { throw 'размер не совпал' }
        $swapDone = $true
        break
      } catch {
        Set-Progress $ui 92 'Liro занят — закройте его другие окна, обновление продолжится само'
        Start-Sleep -Milliseconds 700
      }
    }
  }

  if ($swapDone) {
    Set-Progress $ui 100 'Готово'
    $result = 'ok'
  } else {
    if (Test-Path -LiteralPath $next) { Remove-Item -LiteralPath $next -Force -ErrorAction SilentlyContinue }
    if (-not (Test-Path -LiteralPath $job.target) -and (Test-Path -LiteralPath $job.backup)) {
      Move-Item -LiteralPath $job.backup -Destination $job.target -Force -ErrorAction SilentlyContinue
    }
  }
} catch {
  if (Test-Path -LiteralPath $next) { Remove-Item -LiteralPath $next -Force -ErrorAction SilentlyContinue }
  $result = 'fail'
}

Write-Report $ui $job.report "$result $($job.version)"
if ($job.lock -and (Test-Path -LiteralPath $job.lock)) { Remove-Item -LiteralPath $job.lock -Force -ErrorAction SilentlyContinue }
if (Test-Path -LiteralPath $job.staged) { Remove-Item -LiteralPath $job.staged -Force -ErrorAction SilentlyContinue }
if (Test-Path -LiteralPath $Request) { Remove-Item -LiteralPath $Request -Force -ErrorAction SilentlyContinue }

if ($swapDone) {
  Set-Progress $ui 100 'Запускаем Liro'
  if (Test-Path -LiteralPath $job.started) { Remove-Item -LiteralPath $job.started -Force -ErrorAction SilentlyContinue }
  Start-Liro $job.exe
  $loaded = 0
  while (-not $script:cancelled -and $loaded -lt 400) {
    if (Test-Path -LiteralPath $job.started) { break }
    Start-Sleep -Milliseconds 300
    $loaded += 1
    [System.Windows.Forms.Application]::DoEvents()
  }
} else {
  Start-Liro $job.exe
}

$ui.Form.Close()
