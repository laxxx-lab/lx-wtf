#Requires -Version 5.1
# Pinned local text runtime. No keys, remote execution, or settings changes.
[CmdletBinding()]
param(
    [ValidateSet('Download','Verify','Manifest')][string]$Action = 'Download',
    [string]$ProjectRoot = ''
)
$ErrorActionPreference = 'Stop'
if (-not $ProjectRoot) { $ProjectRoot = Split-Path -Parent $PSScriptRoot }
$root = [IO.Path]::GetFullPath($ProjectRoot)
$live = Join-Path $root 'runtime/live'
$archive = Join-Path $live 'downloads/llama-b11565-bin-win-vulkan-x64.zip'
$model = Join-Path $live 'models/Qwen3.5-4B-Q4_K_M.gguf'
$runtime = Join-Path $live 'llama-b11565'
$manifest = [ordered]@{
    runtime = [ordered]@{
        release = 'b11565'; commit = 'f9a95aeb2096d0c0218e0cd6e6d901cd37be798a'
        url = 'https://github.com/ggml-org/llama.cpp/releases/download/b11565/llama-b11565-bin-win-vulkan-x64.zip'
        sha256 = 'd21649a9cc9dc063d88848ffa9ae3986222c9e953f2f950e993e00e49cedfe21'
    }
    model = [ordered]@{
        repository = 'unsloth/Qwen3.5-4B-GGUF'; revision = 'e87f176479d0855a907a41277aca2f8ee7a09523'
        url = 'https://huggingface.co/unsloth/Qwen3.5-4B-GGUF/resolve/e87f176479d0855a907a41277aca2f8ee7a09523/Qwen3.5-4B-Q4_K_M.gguf'
        sha256 = '00fe7986ff5f6b463e62455821146049db6f9313603938a70800d1fb69ef11a4'
        path = $model
    }
    exe = (Join-Path $runtime 'llama-server.exe'); cwd = $runtime
    url = 'http://127.0.0.1:8874'; health = '/health'; alias = 'lilith-live'
    args = @('--model',$model,'--host','127.0.0.1','--port','8874','--alias','lilith-live',
        '--device','Vulkan0','--gpu-layers','999','--ctx-size','4096','--parallel','1',
        '--flash-attn','on','--reasoning-budget','0')
}
if ($Action -eq 'Manifest') { $manifest | ConvertTo-Json -Depth 6; return }

function Assert-Hash([string]$File, [string]$Expected) {
    if (-not (Test-Path -LiteralPath $File -PathType Leaf)) { throw "Missing pinned file: $File" }
    if ((Get-FileHash -LiteralPath $File -Algorithm SHA256).Hash.ToLowerInvariant() -ne $Expected) {
        throw "SHA256 mismatch; existing file preserved: $File"
    }
}
function Get-PinnedFile([string]$Url, [string]$File, [string]$Hash) {
    if (Test-Path -LiteralPath $File) { Assert-Hash $File $Hash; return }
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $File) | Out-Null
    $partial = "$File.partial"
    & curl.exe --fail --location --retry 3 --output $partial $Url
    if ($LASTEXITCODE -ne 0) { throw "Download failed; partial file retained: $partial" }
    Assert-Hash $partial $Hash
    Move-Item -LiteralPath $partial -Destination $File
}
if ($Action -eq 'Download') {
    Get-PinnedFile $manifest.runtime.url $archive $manifest.runtime.sha256
    Get-PinnedFile $manifest.model.url $model $manifest.model.sha256
} else {
    Assert-Hash $archive $manifest.runtime.sha256
    Assert-Hash $model $manifest.model.sha256
}
if ($Action -eq 'Download') {
    # Re-extract the verified publisher archive, including its GPU DLLs.
    Expand-Archive -LiteralPath $archive -DestinationPath $runtime -Force
}
foreach ($file in @($manifest.exe,(Join-Path $runtime 'ggml-vulkan.dll'))) {
    if (-not (Test-Path -LiteralPath $file -PathType Leaf)) { throw "Missing Vulkan runtime file: $file" }
}
$manifest | ConvertTo-Json -Depth 6
