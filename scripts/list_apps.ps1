$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
$catalogRows = @(Get-StartApps | Select-Object Name, AppID)

# Desktop StartApps IDs may be GUID paths or arbitrary registered identifiers.
# Use the installed Start Menu shortcuts directly, without resolving EXE targets.
$startMenuRoots = @(
    [Environment]::GetFolderPath('Programs'),
    [Environment]::GetFolderPath('CommonPrograms')
) | Select-Object -Unique
foreach ($startMenuRoot in $startMenuRoots) {
    if ($startMenuRoot -and (Test-Path -LiteralPath $startMenuRoot -PathType Container)) {
        $catalogRows += @(Get-ChildItem -LiteralPath $startMenuRoot -Recurse -File -ErrorAction SilentlyContinue |
            Where-Object { $_.Extension -in @('.lnk', '.appref-ms') } |
            ForEach-Object { [PSCustomObject]@{ name = $_.BaseName; id = $_.FullName } })
    }
}
ConvertTo-Json -InputObject $catalogRows -Depth 3 -Compress
