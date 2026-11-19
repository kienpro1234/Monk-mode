param(
    [Parameter(Mandatory = $true)][string]$ServerUrl,
    [Parameter(Mandatory = $true)][string]$DataDir,
    [Parameter(Mandatory = $true)][int]$ParentPid
)

$ErrorActionPreference = 'SilentlyContinue'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

function New-MountainIcon {
    $bmp = New-Object System.Drawing.Bitmap 32, 32
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.Clear([System.Drawing.Color]::Transparent)

    $bgBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 22, 21, 19))
    $g.FillEllipse($bgBrush, 1, 1, 30, 30)

    $borderPen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(255, 226, 179, 84)), 2
    $g.DrawEllipse($borderPen, 2, 2, 28, 28)

    $sunBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 212, 102, 74))
    $g.FillEllipse($sunBrush, 18, 6, 7, 7)

    $peakPoints = [System.Drawing.Point[]]@(
        (New-Object System.Drawing.Point 5, 24),
        (New-Object System.Drawing.Point 14, 9),
        (New-Object System.Drawing.Point 19, 17),
        (New-Object System.Drawing.Point 22, 13),
        (New-Object System.Drawing.Point 27, 24)
    )
    $peakBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 232, 227, 213))
    $g.FillPolygon($peakBrush, $peakPoints)

    $g.Dispose()
    $bgBrush.Dispose()
    $borderPen.Dispose()
    $sunBrush.Dispose()
    $peakBrush.Dispose()

    $hIcon = $bmp.GetHicon()
    return [System.Drawing.Icon]::FromHandle($hIcon)
}

function Invoke-ApiPost {
    param([string]$Endpoint)
    try {
        $req = [System.Net.HttpWebRequest]::Create("$ServerUrl$Endpoint")
        $req.Method = 'POST'
        $req.Timeout = 2500
        $req.ContentLength = 0
        $resp = $req.GetResponse()
        $resp.Close()
    } catch {}
}

function Read-JsonSafe {
    param([string]$FilePath)
    if (-not (Test-Path -LiteralPath $FilePath)) { return $null }
    try {
        $raw = Get-Content -LiteralPath $FilePath -Raw -Encoding UTF8
        if ([string]::IsNullOrWhiteSpace($raw)) { return $null }
        return $raw | ConvertFrom-Json
    } catch {
        return $null
    }
}

$statusPath = Join-Path $DataDir 'tray-status.json'
$notifyPath = Join-Path $DataDir 'tray-notify.json'

$notifyIcon = New-Object System.Windows.Forms.NotifyIcon
$notifyIcon.Icon = New-MountainIcon
$notifyIcon.Text = 'LÊN NÚI — Đang chạy nền bảo vệ kỷ luật'
$notifyIcon.Visible = $true

$menu = New-Object System.Windows.Forms.ContextMenuStrip
$itemStatus = New-Object System.Windows.Forms.ToolStripMenuItem 'Trạng thái: Đang theo dõi...'
$itemStatus.Enabled = $false

$itemOpen = New-Object System.Windows.Forms.ToolStripMenuItem 'Mở Cửa Sổ App Lên Núi'
$itemOpen.Font = New-Object System.Drawing.Font($itemOpen.Font, [System.Drawing.FontStyle]::Bold)
$itemOpen.Add_Click({
    Invoke-ApiPost '/api/daemon/open-window'
})

$itemCheck = New-Object System.Windows.Forms.ToolStripMenuItem 'Kiểm Tra Nghĩa Vụ Hôm Nay'
$itemCheck.Add_Click({
    $st = Read-JsonSafe $statusPath
    if ($st -and $st.summaryBody) {
        $icon = [System.Windows.Forms.ToolTipIcon]::Info
        if ($st.pendingCount -gt 0) { $icon = [System.Windows.Forms.ToolTipIcon]::Warning }
        $notifyIcon.ShowBalloonTip(5000, [string]$st.summaryTitle, [string]$st.summaryBody, $icon)
    } else {
        $notifyIcon.ShowBalloonTip(4000, 'Lên Núi', 'Hệ thống đang theo dõi nền 24/7.', [System.Windows.Forms.ToolTipIcon]::Info)
    }
})

$sep = New-Object System.Windows.Forms.ToolStripSeparator
$itemQuit = New-Object System.Windows.Forms.ToolStripMenuItem 'Tắt Tiến Trình Chạy Nền'
$itemQuit.Add_Click({
    Invoke-ApiPost '/api/daemon/quit'
    $notifyIcon.Visible = $false
    [System.Windows.Forms.Application]::Exit()
})

$menu.Items.Add($itemStatus) | Out-Null
$menu.Items.Add((New-Object System.Windows.Forms.ToolStripSeparator)) | Out-Null
$menu.Items.Add($itemOpen) | Out-Null
$menu.Items.Add($itemCheck) | Out-Null
$menu.Items.Add($sep) | Out-Null
$menu.Items.Add($itemQuit) | Out-Null
$notifyIcon.ContextMenuStrip = $menu

$notifyIcon.Add_DoubleClick({
    Invoke-ApiPost '/api/daemon/open-window'
})
$notifyIcon.Add_BalloonTipClicked({
    Invoke-ApiPost '/api/daemon/open-window'
})

$script:lastNotifyTs = 0L

$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = 2000
$timer.Add_Tick({
    $parent = Get-Process -Id $ParentPid -ErrorAction SilentlyContinue
    if (-not $parent) {
        $timer.Stop()
        $notifyIcon.Visible = $false
        [System.Windows.Forms.Application]::Exit()
        return
    }

    $st = Read-JsonSafe $statusPath
    if ($st) {
        if ($st.tooltip) {
            $tip = [string]$st.tooltip
            if ($tip.Length -gt 63) { $tip = $tip.Substring(0, 60) + '...' }
            $notifyIcon.Text = $tip
        }
        if ($st.menuLabel) {
            $itemStatus.Text = [string]$st.menuLabel
        }
    }

    $nt = Read-JsonSafe $notifyPath
    if ($nt -and $nt.ts) {
        $ts = [int64]$nt.ts
        if ($ts -gt $script:lastNotifyTs) {
            $script:lastNotifyTs = $ts
            $level = [string]$nt.level
            $icon = [System.Windows.Forms.ToolTipIcon]::Info
            if ($level -eq 'error') { $icon = [System.Windows.Forms.ToolTipIcon]::Error }
            elseif ($level -eq 'warning') { $icon = [System.Windows.Forms.ToolTipIcon]::Warning }
            $title = if ($nt.title) { [string]$nt.title } else { 'Lên Núi' }
            $body = if ($nt.body) { [string]$nt.body } else { '' }
            $notifyIcon.ShowBalloonTip(7000, $title, $body, $icon)
        }
    }
})
$timer.Start()

$ctx = New-Object System.Windows.Forms.ApplicationContext
[System.Windows.Forms.Application]::Run($ctx)
