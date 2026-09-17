# Resize a user-supplied PNG into all app icon sizes (Windows tray/exe + Android mipmaps)
param(
    [string]$Source = "C:\Users\dyy10\AppData\Local\Temp\user-icon.png",
    [string]$Project = "D:\Vibe codeing APP\计时APP"
)
Add-Type -AssemblyName System.Drawing

$src = [System.Drawing.Bitmap]::FromFile($Source)

function Save-Icon([int]$size, [string]$outFile) {
    $bmp = New-Object System.Drawing.Bitmap $size, $size
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    # keep aspect ratio, center on transparent square
    $ratio = [Math]::Min($size / $src.Width, $size / $src.Height)
    $w = [int]($src.Width * $ratio)
    $h = [int]($src.Height * $ratio)
    $x = [int](($size - $w) / 2)
    $y = [int](($size - $h) / 2)
    $g.DrawImage($src, (New-Object System.Drawing.Rectangle($x, $y, $w, $h)), (New-Object System.Drawing.Rectangle(0, 0, $src.Width, $src.Height)), [System.Drawing.GraphicsUnit]::Pixel)
    $g.Dispose()
    New-Item -ItemType Directory -Force -Path (Split-Path $outFile) | Out-Null
    $bmp.Save($outFile, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
    Write-Output "OK: $outFile ($size x $size)"
}

# Windows (tray / window / installer)
Save-Icon 16  "$Project\assets\icons\bean-16.png"
Save-Icon 32  "$Project\assets\icons\bean-32.png"
Save-Icon 256 "$Project\assets\icons\bean-256.png"

# Android launcher icons
$sizes = @{ 'mipmap-mdpi' = 48; 'mipmap-hdpi' = 72; 'mipmap-xhdpi' = 96; 'mipmap-xxhdpi' = 144; 'mipmap-xxxhdpi' = 192 }
foreach ($dir in $sizes.Keys) {
    Save-Icon $sizes[$dir] "$Project\android\app\src\main\res\$dir\ic_launcher.png"
    Copy-Item "$Project\android\app\src\main\res\$dir\ic_launcher.png" "$Project\android\app\src\main\res\$dir\ic_launcher_round.png" -Force
}
$src.Dispose()
Write-Output "ALL DONE"
