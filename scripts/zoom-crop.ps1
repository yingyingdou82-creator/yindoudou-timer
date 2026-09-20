param(
    [string]$In = "C:\Users\dyy10\AppData\Local\Temp\full-screen.png",
    [string]$Out = "C:\Users\dyy10\AppData\Local\Temp\zoom-device.png"
)
Add-Type -AssemblyName System.Drawing
$src = [System.Drawing.Bitmap]::FromFile($In)
Write-Output ("screen: " + $src.Width + "x" + $src.Height)
$w = 560
$h = [int]($src.Height * 0.85)
$x = $src.Width - $w - 60
$y = 40
$dst = New-Object System.Drawing.Bitmap ($w * 2), ($h * 2)
$g = [System.Drawing.Graphics]::FromImage($dst)
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.DrawImage($src, (New-Object System.Drawing.Rectangle(0, 0, $w * 2, $h * 2)), (New-Object System.Drawing.Rectangle($x, $y, $w, $h)), [System.Drawing.GraphicsUnit]::Pixel)
$g.Dispose()
$dst.Save($Out, [System.Drawing.Imaging.ImageFormat]::Png)
$dst.Dispose()
$src.Dispose()
Write-Output "SAVED $Out"
