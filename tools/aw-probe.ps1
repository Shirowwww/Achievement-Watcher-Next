<#
.SYNOPSIS
  Drive and visually verify a running AW Next dev build from the command line.

.DESCRIPTION
  The app is a tray daemon. This script forwards overlay requests, enumerates windows,
  sends input and captures screenshots for runtime checks.

.EXAMPLE
  # Closing a missing overlay must not open one.
  .\tools\aw-probe.ps1 Send -Arguments '--wintype=overlay --appid=0 --description=close'
  .\tools\aw-probe.ps1 Windows          # must NOT list "Achievements Overlay"

.EXAMPLE
  # Close the overlay, then reopen it with the hotkey.
  .\tools\aw-probe.ps1 Key -Keys ESC -FocusMatch 'Achievements Overlay'
  .\tools\aw-probe.ps1 Key -Keys CTRL+SHIFT+K
  .\tools\aw-probe.ps1 Wait -Match 'Achievements Overlay' -TimeoutSeconds 10

.EXAMPLE
  .\tools\aw-probe.ps1 Shot -Match 'Achievements Overlay' -Out .\overlay.png
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true, Position = 0)]
  [ValidateSet('Start', 'Stop', 'Windows', 'Shot', 'Send', 'Key', 'Wait', 'Logs', 'Click', 'Scroll', 'Hover', 'Tray', 'Toast', 'Offer')]
  [string]$Command,

  [string]$Arguments,
  [string]$Match,
  [string]$FocusMatch,
  [string]$Keys,
  [string]$Out,
  [int]$TimeoutSeconds = 20,
  [switch]$Absent,
  [switch]$Screen,
  [int]$Tail = 40,
  # With -Match, X/Y are relative to the matched window.
  [int]$X = 0,
  [int]$Y = 0,
  [switch]$RightClick,
  # Positive scrolls up; negative scrolls down.
  [int]$Notches = -3,
  # Chromium debug port opened by Start, for tools/aw-page.js; 0 starts without one.
  [int]$DebugPort = 9333,
  # Captures without -Out go to ..\preuves\<Subject>\ when that workspace folder exists.
  [string]$Subject = 'gui-probe',
  # Tray: hover for the tooltip instead of clicking.
  [switch]$HoverOnly,
  # Offer: the version the fake update offers.
  [string]$Version = '99.0.0'
)

$ErrorActionPreference = 'Stop'
$RepoRoot = Split-Path -Parent $PSScriptRoot
$AppDir = Join-Path $RepoRoot 'app'
$Electron = Join-Path $AppDir 'node_modules\electron\dist\electron.exe'
$UserData = Join-Path $env:APPDATA 'Achievement Watcher Next'

# Keep the native helper compatible with PowerShell 5.1 and 7.
Add-Type @"
using System;
using System.Text;
using System.Collections.Generic;
using System.Runtime.InteropServices;

public class AwProbe {
  [DllImport("user32.dll")] static extern bool EnumWindows(EnumWindowsProc cb, IntPtr p);
  delegate bool EnumWindowsProc(IntPtr h, IntPtr p);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] static extern int GetWindowText(IntPtr h, StringBuilder s, int c);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int cmd);
  [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr h, IntPtr hdc, uint flags);
  [DllImport("user32.dll")] public static extern void keybd_event(byte vk, byte scan, uint flags, UIntPtr extra);
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint flags, int dx, int dy, uint data, UIntPtr extra);
  [DllImport("user32.dll")] static extern IntPtr SetProcessDpiAwarenessContext(IntPtr ctx);
  [DllImport("user32.dll")] static extern bool SetProcessDPIAware();

  // Without this, Windows virtualizes window rects, screen metrics and SetCursorPos to 96 DPI
  // while PrintWindow and CopyFromScreen still return physical pixels: on a scaled display every
  // capture comes back cropped to the top-left and coordinates read off a shot miss their target.
  public static void MakeDpiAware() {
    try { if (SetProcessDpiAwarenessContext(new IntPtr(-4)) != IntPtr.Zero) return; } catch {}
    try { SetProcessDPIAware(); } catch {}
  }

  // Chromium renders the UI in one window, so click through the real cursor.
  public static void ClickAt(int x, int y) {
    SetCursorPos(x, y);
    System.Threading.Thread.Sleep(120);
    mouse_event(0x0002, 0, 0, 0, UIntPtr.Zero);   // LEFTDOWN
    System.Threading.Thread.Sleep(60);
    mouse_event(0x0004, 0, 0, 0, UIntPtr.Zero);   // LEFTUP
  }

  // Chromium routes wheel input by hit-test.
  public static void ScrollAt(int x, int y, int notches) {
    SetCursorPos(x, y);
    System.Threading.Thread.Sleep(120);
    for (int i = 0; i < System.Math.Abs(notches); i++) {
      mouse_event(0x0800, 0, 0, unchecked((uint)(notches > 0 ? 120 : -120)), UIntPtr.Zero);
      System.Threading.Thread.Sleep(70);
    }
  }

  public static void RightClickAt(int x, int y) {
    SetCursorPos(x, y);
    System.Threading.Thread.Sleep(120);
    mouse_event(0x0008, 0, 0, 0, UIntPtr.Zero);   // RIGHTDOWN
    System.Threading.Thread.Sleep(60);
    mouse_event(0x0010, 0, 0, 0, UIntPtr.Zero);   // RIGHTUP
  }
  [DllImport("user32.dll")] static extern int GetSystemMetrics(int index);
  [DllImport("user32.dll")] public static extern uint GetDpiForSystem();

  // Return the virtual desktop bounds for multi-monitor captures.
  public static int[] VirtualScreen() {
    return new int[] { GetSystemMetrics(76), GetSystemMetrics(77), GetSystemMetrics(78), GetSystemMetrics(79) };
  }

  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }

  public class Win {
    public IntPtr Handle; public uint Pid; public string Process; public string Title;
    public int X, Y, Width, Height;
  }

  // Dev builds use the process name "electron". The pids are resolved once: looking the process
  // up per window cost a Process object for every visible window on the desktop.
  public static List<Win> List(string processName) {
    var found = new List<Win>();
    var pids = new HashSet<uint>();
    foreach (var p in System.Diagnostics.Process.GetProcessesByName(processName)) { pids.Add((uint)p.Id); p.Dispose(); }
    if (pids.Count == 0) return found;
    EnumWindows((h, p) => {
      if (!IsWindowVisible(h)) return true;
      uint pid; GetWindowThreadProcessId(h, out pid);
      if (!pids.Contains(pid)) return true;
      string proc = processName;
      var sb = new StringBuilder(512); GetWindowText(h, sb, 512);
      RECT r; GetWindowRect(h, out r);
      found.Add(new Win {
        Handle = h, Pid = pid, Process = proc, Title = sb.ToString(),
        X = r.Left, Y = r.Top, Width = r.Right - r.Left, Height = r.Bottom - r.Top
      });
      return true;
    }, IntPtr.Zero);
    return found;
  }

}
"@

[AwProbe]::MakeDpiAware()

function Get-Windows {
  [AwProbe]::List('electron')
}

function Select-Windows([string]$pattern) {
  $all = Get-Windows
  if ([string]::IsNullOrWhiteSpace($pattern)) { return $all }
  return $all | Where-Object { $_.Title -like "*$pattern*" }
}

function Format-Windows($list) {
  if (-not $list -or $list.Count -eq 0) { return '  (no matching Electron window)' }
  $list | ForEach-Object { "  pid={0,-6} {1,4}x{2,-4} @{3},{4}  '{5}'" -f $_.Pid, $_.Width, $_.Height, $_.X, $_.Y, $_.Title }
}

function Get-DefaultOut([string]$name) {
  $preuves = Join-Path (Split-Path -Parent $RepoRoot) 'preuves'
  $dir = if (Test-Path $preuves) { Join-Path $preuves $Subject } else { (Get-Location).Path }
  New-Item -ItemType Directory -Force $dir | Out-Null
  Join-Path $dir ('{0}-{1:yyyyMMdd-HHmmss}.png' -f $name, (Get-Date))
}

function Get-ScreenRegion([int]$x, [int]$y, [int]$w, [int]$h) {
  Add-Type -AssemblyName System.Drawing
  $bmp = New-Object System.Drawing.Bitmap $w, $h
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.CopyFromScreen($x, $y, 0, 0, (New-Object System.Drawing.Size $w, $h))
  $g.Dispose()
  return $bmp
}

function Save-ScreenRegion([int]$x, [int]$y, [int]$w, [int]$h, [string]$path) {
  $bmp = Get-ScreenRegion $x $y $w $h
  $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
  Write-Host "saved $path"
}

# Share of sampled pixels that differ between two captures of the same area.
function Get-ChangedShare($a, $b) {
  $diff = 0; $total = 0
  for ($y = 0; $y -lt $a.Height; $y += 8) {
    for ($x = 0; $x -lt $a.Width; $x += 8) { $total++; if ($a.GetPixel($x, $y) -ne $b.GetPixel($x, $y)) { $diff++ } }
  }
  return $diff / [Math]::Max(1, $total)
}

# AW's notification-area button, from the taskbar or the hidden-icons flyout, which is opened when
# the icon is not pinned. Buttons are named after the icon's tooltip; UIA rects are physical pixels.
function Find-TrayIcon([string]$pattern) {
  Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes
  $root = [Windows.Automation.AutomationElement]::RootElement
  $byClass = { param($name) $root.FindFirst('Children', (New-Object Windows.Automation.PropertyCondition([Windows.Automation.AutomationElement]::ClassNameProperty, $name))) }
  $buttons = { param($parent) if ($parent) { @($parent.FindAll('Descendants', (New-Object Windows.Automation.PropertyCondition([Windows.Automation.AutomationElement]::ControlTypeProperty, [Windows.Automation.ControlType]::Button)))) } }
  $all = & $buttons (& $byClass 'Shell_TrayWnd')
  $hit = @($all | Where-Object { $_.Current.AutomationId -eq 'NotifyItemIcon' -and $_.Current.Name -like "*$pattern*" })
  if (-not $hit) {
    $flyout = & $byClass 'TopLevelWindowForOverflowXamlIsland'
    if (-not $flyout) {
      # The chevron is the left-most system button of the notification area.
      $chevron = $all | Where-Object { $_.Current.AutomationId -eq 'SystemTrayIcon' } | Sort-Object { $_.Current.BoundingRectangle.X } | Select-Object -First 1
      $r = $chevron.Current.BoundingRectangle
      [AwProbe]::ClickAt([int]($r.X + $r.Width / 2), [int]($r.Y + $r.Height / 2))
      Start-Sleep -Milliseconds 700
      $flyout = & $byClass 'TopLevelWindowForOverflowXamlIsland'
    }
    $hit = @(& $buttons $flyout | Where-Object { $_.Current.Name -like "*$pattern*" })
  }
  if ($hit.Count -gt 1) { Write-Host "note: $($hit.Count) icons match '$pattern' (an installed copy shares the name); using the first: '$($hit[0].Current.Name)'" }
  return $hit | Select-Object -First 1
}

# Virtual-key codes for the combos this project actually uses.
$VK = @{
  'CTRL' = 0x11; 'CONTROL' = 0x11; 'SHIFT' = 0x10; 'ALT' = 0x12
  'ESC' = 0x1B; 'ESCAPE' = 0x1B; 'ENTER' = 0x0D; 'RETURN' = 0x0D; 'TAB' = 0x09
  'SPACE' = 0x20; 'WIN' = 0x5B; 'PAGEUP' = 0x21; 'PAGEDOWN' = 0x22; 'DELETE' = 0x2E; 'DEL' = 0x2E
  'BACKSPACE' = 0x08; 'HOME' = 0x24; 'END' = 0x23; 'UP' = 0x26; 'DOWN' = 0x28; 'LEFT' = 0x25; 'RIGHT' = 0x27
}
foreach ($n in 1..12) { $VK["F$n"] = 0x6F + $n }
function Get-VK([string]$name) {
  $n = $name.Trim().ToUpperInvariant()
  if ($VK.ContainsKey($n)) { return $VK[$n] }
  if ($n.Length -eq 1) { return [int][char]$n }
  throw "Unknown key '$name'"
}

# Focus the window and verify it before sending input.
function Set-Foreground([IntPtr]$handle) {
  for ($attempt = 0; $attempt -lt 5; $attempt++) {
    [AwProbe]::keybd_event(0x12, 0, 0, [UIntPtr]::Zero)
    [AwProbe]::keybd_event(0x12, 0, 2, [UIntPtr]::Zero)
    [void][AwProbe]::ShowWindow($handle, 9)   # SW_RESTORE
    [void][AwProbe]::SetForegroundWindow($handle)
    Start-Sleep -Milliseconds 250
    if ([AwProbe]::GetForegroundWindow() -eq $handle) { return $true }
  }
  return $false
}

# The live Electron processes of this checkout only: another Electron app is not ours, and
# Windows keeps listing an exited process for as long as anything holds a handle to it.
function Get-OwnProcesses {
  Get-Process electron -ErrorAction SilentlyContinue | Where-Object { -not $_.HasExited -and $_.Path -like "$AppDir*" }
}

# All input commands require a focused target.
function Get-InputTarget([string]$pattern, [string]$what) {
  $target = Select-Windows $pattern | Select-Object -First 1
  if (-not $target) { Write-Host "FAIL: no window matching '$pattern'"; exit 1 }
  if (-not (Set-Foreground $target.Handle)) { Write-Host "FAIL: could not focus '$pattern'; $what NOT delivered"; exit 1 }
  return $target
}

switch ($Command) {

  'Start' {
    if (Get-OwnProcesses) {
      # A second launch only forwards its argv to the running instance and exits.
      Write-Host 'FAIL: this checkout is already running; Stop it first to get a clean state.'
      exit 1
    }
    # An installed copy holds the same single-instance lock: the dev launch would only hand its argv
    # to it and exit, and nothing of this checkout would ever show.
    if (Get-Process -Name 'Achievement Watcher' -ErrorAction SilentlyContinue) {
      Write-Host 'FAIL: the installed AW Next is running and owns the single-instance lock; quit it from its tray icon first.'
      exit 1
    }
    # Remove the flag that disables Electron's GUI.
    Remove-Item Env:\ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
    # Launch Electron directly so the shell is not kept alive. -WindowStyle Hidden must NOT be used
    # here: Windows applies that hint to the child's own first top-level window, so the app's main
    # window comes up with isVisible()=false and never recovers (BrowserWindow.show() later does not
    # override it). electron.exe has no console window to hide, so the flag only breaks the launch.
    $argv = @('.')
    if ($DebugPort -gt 0) { $argv += "--remote-debugging-port=$DebugPort" }
    Start-Process -FilePath $Electron -ArgumentList $argv -WorkingDirectory $AppDir

    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    while ((Get-Date) -lt $deadline) {
      if (Select-Windows 'AW Next') {
        Write-Host 'Windows now visible:'
        Format-Windows (Get-Windows)
        exit 0
      }
      Start-Sleep -Milliseconds 500
    }
    Write-Host "TIMEOUT after ${TimeoutSeconds}s: no 'AW Next' window (a hidden start stays in the tray)"
    exit 1
  }

  'Stop' {
    $killed = 0
    $own = @(Get-OwnProcesses)
    foreach ($p in $own) { try { Stop-Process -Id $p.Id -Force -ErrorAction Stop; $killed++ } catch {} }
    # Stop-Process returns before the process is gone, and a Start in that window found it still
    # holding the single-instance lock.
    $deadline = (Get-Date).AddSeconds(10)
    while ((Get-OwnProcesses) -and (Get-Date) -lt $deadline) { Start-Sleep -Milliseconds 200 }
    # Chromium releases its single-instance lock a moment after the last process is gone.
    if ($killed -gt 0) { Start-Sleep -Seconds 2 }
    Write-Host "stopped $killed process(es)"
  }

  'Windows' { Format-Windows (Select-Windows $Match) }

  'Send' {
    if (-not $Arguments) { throw 'Send requires -Arguments (e.g. ''--wintype=overlay --appid=0 --description=close'')' }
    # The running instance owns the single-instance lock, so this process forwards its argv and
    # exits - the same path the Watchdog uses via SpawnOverlayNotification.
    Remove-Item Env:\ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
    Push-Location $AppDir
    try {
      $argv = @('.') + ($Arguments -split '\s+' | Where-Object { $_ })
      & $Electron @argv | Out-Null
      Write-Host "forwarded: $Arguments"
    } finally { Pop-Location }
  }

  'Key' {
    if (-not $Keys) { throw 'Key requires -Keys (e.g. ESC, CTRL+SHIFT+K, ALT+F4)' }
    if ($FocusMatch) { [void](Get-InputTarget $FocusMatch 'keys') }
    $parts = $Keys -split '\+' | Where-Object { $_ }
    $codes = $parts | ForEach-Object { Get-VK $_ }
    foreach ($c in $codes) { [AwProbe]::keybd_event([byte]$c, 0, 0, [UIntPtr]::Zero) }      # down, in order
    Start-Sleep -Milliseconds 60
    [array]::Reverse($codes)
    foreach ($c in $codes) { [AwProbe]::keybd_event([byte]$c, 0, 2, [UIntPtr]::Zero) }      # up, reversed
    Write-Host "sent keys: $Keys$(if ($FocusMatch) { " (focused '$FocusMatch')" })"
  }

  'Click' {
    # X/Y are window-relative when -Match is given, absolute otherwise.
    $sx = $X; $sy = $Y
    if ($Match) { $w = Get-InputTarget $Match 'click'; $sx += $w.X; $sy += $w.Y }
    if ($RightClick) { [AwProbe]::RightClickAt($sx, $sy) } else { [AwProbe]::ClickAt($sx, $sy) }
    Write-Host "$(if ($RightClick) { 'right-' })clicked at $sx,$sy$(if ($Match) { " (window '$Match' + $X,$Y)" })"
  }

  'Scroll' {
    $sx = $X; $sy = $Y
    if ($Match) { $w = Get-InputTarget $Match 'scroll'; $sx += $w.X; $sy += $w.Y }
    [AwProbe]::ScrollAt($sx, $sy, $Notches)
    Write-Host "scrolled $Notches notch(es) at $sx,$sy"
  }

  'Hover' {
    # Moves the cursor with no button press, for tooltips and hover states. X/Y are window-relative
    # with -Match, absolute otherwise. Native submenus do not reliably open on a synthetic move:
    # walk a context menu with Key DOWN/RIGHT/RETURN instead.
    $sx = $X; $sy = $Y
    if ($Match) { $w = Select-Windows $Match | Select-Object -First 1; if (-not $w) { Write-Host "FAIL: no window matching '$Match'"; exit 1 }; $sx += $w.X; $sy += $w.Y }
    [void][AwProbe]::SetCursorPos($sx, $sy)
    Write-Host "hovering $sx,$sy$(if ($Match) { " (window '$Match' + $X,$Y)" })"
  }

  'Wait' {
    if (-not $Match) { throw 'Wait requires -Match' }
    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    while ((Get-Date) -lt $deadline) {
      $hit = Select-Windows $Match
      if ($Absent -and -not $hit) { Write-Host "OK: no window matching '$Match'"; exit 0 }
      if (-not $Absent -and $hit) { Write-Host "OK: window present"; Format-Windows $hit; exit 0 }
      Start-Sleep -Milliseconds 400
    }
    Write-Host "TIMEOUT after ${TimeoutSeconds}s: '$Match' was $(if ($Absent) { 'still present' } else { 'never found' })"
    Format-Windows (Get-Windows)
    exit 1
  }

  'Shot' {
    if (-not $Out) { $Out = Get-DefaultOut 'shot' }
    Add-Type -AssemblyName System.Drawing
    if ($Screen) {
      $vs = [AwProbe]::VirtualScreen()
      $bmp = New-Object System.Drawing.Bitmap $vs[2], $vs[3]
      $g = [System.Drawing.Graphics]::FromImage($bmp)
      $g.CopyFromScreen($vs[0], $vs[1], 0, 0, (New-Object System.Drawing.Size $vs[2], $vs[3]))
      $g.Dispose()
    } else {
      if (-not $Match) { throw 'Shot requires -Match (window title) or -Screen' }
      $w = Select-Windows $Match | Select-Object -First 1
      if (-not $w) { throw "no window matching '$Match'" }
      [void](Set-Foreground $w.Handle)
      Start-Sleep -Milliseconds 400
      # PW_RENDERFULLCONTENT (2) is what makes this work on Chromium/DWM-composited windows;
      # without it an Electron window captures as a blank rectangle.
      $bmp = New-Object System.Drawing.Bitmap $w.Width, $w.Height
      $g = [System.Drawing.Graphics]::FromImage($bmp)
      $hdc = $g.GetHdc()
      try { [void][AwProbe]::PrintWindow($w.Handle, $hdc, 2) } finally { $g.ReleaseHdc($hdc) }
      $g.Dispose()
    }
    $bmp.Save($Out, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
    Write-Host "saved $Out ($((Get-Item $Out).Length) bytes)"
  }

  'Tray' {
    # Clicks AW's tray icon (-RightClick for its menu, -HoverOnly for its tooltip); the menu or the
    # tooltip is captured together with the icon.
    $pattern = if ($Match) { $Match } else { 'Achievement Watcher' }
    $icon = Find-TrayIcon $pattern
    if (-not $icon) { Write-Host "FAIL: no tray icon matching '$pattern'"; exit 1 }
    $r = $icon.Current.BoundingRectangle
    $cx = [int]($r.X + $r.Width / 2); $cy = [int]($r.Y + $r.Height / 2)
    if (-not ($HoverOnly -or $RightClick)) { [AwProbe]::ClickAt($cx, $cy); Write-Host "clicked '$($icon.Current.Name)' at $cx,$cy"; exit 0 }

    # The menu or tooltip opens beside the icon, in a shell surface no window lookup sees, so the
    # area around the icon is what is captured, and comparing it is how the menu is known to be up.
    $s = [AwProbe]::GetDpiForSystem() / 96
    $vs = [AwProbe]::VirtualScreen()
    $left = [int][Math]::Max($vs[0], $cx - 420 * $s); $right = [int][Math]::Min($vs[0] + $vs[2], $cx + 420 * $s)
    $top = [int][Math]::Max($vs[1], $cy - 340 * $s); $bottom = [int][Math]::Min($vs[1] + $vs[3], $r.Y + $r.Height + 8)
    $before = Get-ScreenRegion $left $top ($right - $left) ($bottom - $top)
    if ($HoverOnly) {
      # The shell waits for the pointer to settle, then fades the tooltip in.
      [void][AwProbe]::SetCursorPos($cx - 2, $cy); Start-Sleep -Milliseconds 150
      [void][AwProbe]::SetCursorPos($cx, $cy); Start-Sleep -Milliseconds 2500
    } else {
      # Explorer hands the click to the app only once the process that sent it has exited, so a
      # throwaway process sends it. A second right-click would close the menu again.
      $click = "Add-Type -Name M -Namespace W -MemberDefinition '[DllImport(""user32.dll"")] public static extern bool SetCursorPos(int x,int y); [DllImport(""user32.dll"")] public static extern void mouse_event(int f,int x,int y,int d,int e); [DllImport(""user32.dll"")] public static extern IntPtr SetProcessDpiAwarenessContext(IntPtr c);'; [void][W.M]::SetProcessDpiAwarenessContext([IntPtr](-4)); [void][W.M]::SetCursorPos($cx,$cy); Start-Sleep -Milliseconds 120; [W.M]::mouse_event(8,0,0,0,0); [W.M]::mouse_event(16,0,0,0,0)"
      Start-Process powershell.exe -WindowStyle Hidden -Wait -ArgumentList '-NoProfile', '-EncodedCommand', ([Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($click)))
    }
    $deadline = (Get-Date).AddSeconds(5)
    do {
      Start-Sleep -Milliseconds 250
      $after = Get-ScreenRegion $left $top ($right - $left) ($bottom - $top)
      $changed = (Get-ChangedShare $before $after) -gt 0.02
      if (-not $changed) { $after.Dispose() }
    } while (-not $changed -and (Get-Date) -lt $deadline)
    if ($changed) { $after.Dispose(); Start-Sleep -Milliseconds 300; $after = Get-ScreenRegion $left $top ($right - $left) ($bottom - $top) }
    $before.Dispose()
    if (-not $Out) { $Out = Get-DefaultOut $(if ($HoverOnly) { 'tray-tooltip' } else { 'tray-menu' }) }
    $after.Save($Out, [System.Drawing.Imaging.ImageFormat]::Png); $after.Dispose()
    Write-Host "$(if ($HoverOnly) { 'hovered' } else { 'right-clicked' }) '$($icon.Current.Name)'; $(if ($changed) { 'it opened' } else { 'NOTHING opened' }); saved $Out"
    # A menu holds the keyboard while it is open, so Escape closes it. Sent only when something did
    # open: otherwise it would land in whatever window is in front, which may be the one driving this.
    if ($RightClick -and $changed) { [AwProbe]::keybd_event(0x1B, 0, 0, [UIntPtr]::Zero); [AwProbe]::keybd_event(0x1B, 0, 2, [UIntPtr]::Zero) }
    if (-not $changed) { exit 1 }
  }

  'Toast' {
    # Windows draws toasts outside anything UIA or EnumWindows can see, so this captures the corner
    # they appear in: the bottom-right of the primary work area. Run it right after the action that
    # should notify; another app's toast can sit in the same place.
    Add-Type -AssemblyName System.Windows.Forms
    $area = [System.Windows.Forms.Screen]::PrimaryScreen.WorkingArea
    $scale = [AwProbe]::GetDpiForSystem() / 96
    $w = [int](420 * $scale); $h = [int](460 * $scale)
    if (-not $Out) { $Out = Get-DefaultOut 'toast' }
    Save-ScreenRegion ($area.Right - $w) ($area.Bottom - $h) $w $h $Out
  }

  'Offer' {
    # Dev builds only: the running app offers a fake update through the real code path.
    Remove-Item Env:\ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
    Push-Location $AppDir
    # The forwarding process prints Chromium cache warnings while it hands its argv over and exits.
    try { & $Electron '.' "--fake-update=$Version" 2>&1 | Out-Null } finally { Pop-Location }
    Write-Host "offered a fake $Version (notification, tray dot, update window)"
  }

  'Logs' {
    Get-ChildItem (Join-Path $UserData 'logs') -Filter *.log | ForEach-Object {
      Write-Host "`n=== $($_.Name) (last $Tail) ==="
      Get-Content $_.FullName -Tail $Tail -ErrorAction SilentlyContinue
    }
  }
}
