# Find MuMuNxDevice windows, print titles, bring to front
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
}
"@
$ids = (Get-Process MuMuNxDevice -ErrorAction SilentlyContinue).Id
$script:found = @()
$cb = [W+CB]{ param($h, $l)
    if ([W]::IsWindowVisible($h)) {
        $p = 0
        [W]::GetWindowThreadProcessId($h, [ref]$p) | Out-Null
        if ($ids -contains [int]$p) {
            $sb = New-Object System.Text.StringBuilder 256
            [W]::GetWindowText($h, $sb, 256) | Out-Null
            if ($sb.ToString().Length -gt 0) { $script:found += ,@($h, $sb.ToString()) }
        }
    }
    return $true
}
[W]::EnumWindows($cb, [IntPtr]::Zero) | Out-Null
Write-Output "=== device windows ==="
$script:found | ForEach-Object { Write-Output ("HANDLE=" + $_[0] + " TITLE=" + $_[1]) }
# restore + foreground every device window (last one stays on top)
foreach ($w in $script:found) {
    [W]::ShowWindow([IntPtr]$w[0], 9) | Out-Null
    [W]::SetForegroundWindow([IntPtr]$w[0]) | Out-Null
    Start-Sleep -Milliseconds 700
}
Write-Output "DONE"
