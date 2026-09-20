# Full screen capture + bring MuMu windows to front
Add-Type -AssemblyName System.Drawing
Add-Type @"
using System;
using System.Text;
using System.Runtime.InteropServices;
public class W {
    public delegate bool CB(IntPtr h, IntPtr l);
    [DllImport("user32.dll")] public static extern bool EnumWindows(CB cb, IntPtr l);
    [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
    [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
    [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int cmd);
    [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
}
"@
[W]::SetProcessDPIAware() | Out-Null

# 1) list windows of MuMu processes
$mumuProcs = @{}
Get-Process | Where-Object { $_.Name -like 'MuMu*' } | ForEach-Object { $mumuProcs[[uint32]$_.Id] = $_.Name }

$wins = New-Object System.Collections.ArrayList
$cb = [W+CB]{ param($h, $l)
    if ([W]::IsWindowVisible($h)) {
        $pid2 = 0
        [W]::GetWindowThreadProcessId($h, [ref]$pid2) | Out-Null
        if ($mumuProcs.ContainsKey($pid2)) {
            $sb = New-Object System.Text.StringBuilder 256
            [W]::GetWindowText($h, $sb, 256) | Out-Null
            $t = $sb.ToString()
            if ($t.Length -gt 0) { $wins.Add("$pid2|$t|$h") | Out-Null }
        }
    }
    return $true
}
[W]::EnumWindows($cb, [IntPtr]::Zero) | Out-Null
Write-Output "=== MuMu windows ==="
$wins | ForEach-Object { Write-Output $_ }

# 2) bring each MuMu device window to front (restore + foreground), biggest last so it lands on top
$targets = $wins | Where-Object { $_ -match 'MuMuNxDevice' }
foreach ($w in $targets) {
    $h = [IntPtr]::new([int64]($w.Split('|')[2]))
    [W]::ShowWindow($h, 9) | Out-Null  # SW_RESTORE
    [W]::SetForegroundWindow($h) | Out-Null
    Start-Sleep -Milliseconds 600
}

# 3) full screen shot
Start-Sleep -Milliseconds 800
$b = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
Add-Type -AssemblyName System.Windows.Forms
$b = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
$bmp = New-Object System.Drawing.Bitmap $b.Width, $b.Height
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.CopyFromScreen($b.Left, $b.Top, 0, 0, $bmp.Size)
$bmp.Save("C:\Users\dyy10\AppData\Local\Temp\full-screen.png", [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose(); $bmp.Dispose()
Write-Output "SAVED full-screen.png"
