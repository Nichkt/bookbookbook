# Signs one file of the Windows build, so Windows shows who published bookbookbook.
#
# Tauri runs this for the app, the installer's plugins, the uninstaller and the installer when the
# build includes src-tauri/tauri.signing.conf.json (see "Signing the Windows app" in README.md):
#
#   npx tauri build --ci --config src-tauri/tauri.signing.conf.json
#
# It signs with one of these, picked by environment variables:
#
# - Azure Artifact Signing, which SmartScreen trusts:
#     BBB_SIGNING_ENDPOINT  the account's endpoint, like https://wus2.codesigning.azure.net
#     BBB_SIGNING_ACCOUNT   the Artifact Signing account's name
#     BBB_SIGNING_PROFILE   the certificate profile's name
#   It needs Microsoft's client tools (winget install -e --id Microsoft.Azure.ArtifactSigningClientTools)
#   and a signed-in Azure CLI (az login). BBB_SIGNING_DLIB and BBB_SIGNTOOL can point at
#   Azure.CodeSigning.Dlib.dll and signtool.exe if they aren't found.
#
# - A code signing certificate in this PC's certificate store:
#     BBB_SIGNING_CERT      the certificate's thumbprint
#
# BBB_SIGNING_TIMESTAMP changes the timestamp server for either.

param(
  [Parameter(Mandatory = $true)][string]$Path
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version 3.0

function Fail([string]$message) {
  throw "sign-windows.ps1: $message"
}

function Get-NewestFile([string[]]$roots, [string]$name) {
  $found = @(foreach ($root in $roots) {
      if ($root -and (Test-Path -LiteralPath $root -PathType Container)) {
        Get-ChildItem -LiteralPath $root -Recurse -File -Filter $name -ErrorAction SilentlyContinue
      }
    })
  $version = {
    $info = $_.VersionInfo
    [version]::new($info.FileMajorPart, $info.FileMinorPart, $info.FileBuildPart, $info.FilePrivatePart)
  }
  $found | Sort-Object $version, LastWriteTime -Descending
}

function Get-SigningToolsFolders {
  foreach ($base in @($env:LOCALAPPDATA, $env:ProgramFiles, ${env:ProgramFiles(x86)})) {
    if (-not $base) { continue }
    $microsoft = Join-Path $base "Microsoft"
    if (Test-Path -LiteralPath $microsoft -PathType Container) {
      Get-ChildItem -LiteralPath $microsoft -Directory -Filter "*Signing*" -ErrorAction SilentlyContinue |
        ForEach-Object { $_.FullName }
    }
  }
}

function Sign-WithStoreCertificate([string]$thumbprint, [string]$timestamp) {
  $thumbprint = $thumbprint -replace "[^0-9A-Fa-f]", ""
  $cert = @(Get-ChildItem Cert:\CurrentUser\My, Cert:\LocalMachine\My -CodeSigningCert |
      Where-Object { $_.Thumbprint -eq $thumbprint }) | Select-Object -First 1
  if (-not $cert) {
    Fail "no code signing certificate with the thumbprint $thumbprint in CurrentUser\My or LocalMachine\My"
  }
  $signature = Set-AuthenticodeSignature -LiteralPath $Path -Certificate $cert -HashAlgorithm SHA256 `
    -TimestampServer $timestamp
  if (-not $signature.SignerCertificate -or $signature.SignerCertificate.Thumbprint -ne $cert.Thumbprint) {
    Fail "couldn't sign $Path ($($signature.Status): $($signature.StatusMessage))"
  }
  if (-not $signature.TimeStamperCertificate) {
    Fail "$timestamp didn't timestamp $Path, so its signature would stop working when the certificate expires"
  }
  Write-Output "Signed $Path with $($cert.Subject)"
}

function Sign-WithArtifactSigning([string]$timestamp) {
  $settings = [ordered]@{
    Endpoint               = $env:BBB_SIGNING_ENDPOINT
    CodeSigningAccountName = $env:BBB_SIGNING_ACCOUNT
    CertificateProfileName = $env:BBB_SIGNING_PROFILE
  }
  $missing = @()
  if (-not $settings.Endpoint) { $missing += "BBB_SIGNING_ENDPOINT" }
  if (-not $settings.CodeSigningAccountName) { $missing += "BBB_SIGNING_ACCOUNT" }
  if (-not $settings.CertificateProfileName) { $missing += "BBB_SIGNING_PROFILE" }
  if ($missing.Count -gt 0) {
    Fail ("set $($missing -join ', ') to sign with Azure Artifact Signing, " +
      "or BBB_SIGNING_CERT to sign with a certificate on this PC")
  }

  $toolsFolders = @(Get-SigningToolsFolders)
  if ($env:BBB_SIGNING_DLIB) {
    if (-not (Test-Path -LiteralPath $env:BBB_SIGNING_DLIB -PathType Leaf)) {
      Fail "BBB_SIGNING_DLIB points at $env:BBB_SIGNING_DLIB, which doesn't exist"
    }
    $dlib = $env:BBB_SIGNING_DLIB
  } else {
    $dlibs = @(Get-NewestFile $toolsFolders "Azure.CodeSigning.Dlib.dll")
    $dlib = @($dlibs | Where-Object { $_.FullName -match "\\x64\\" }) + $dlibs | Select-Object -First 1
    if (-not $dlib) {
      Fail ("couldn't find Azure.CodeSigning.Dlib.dll. Install Microsoft's client tools " +
        "(winget install -e --id Microsoft.Azure.ArtifactSigningClientTools) or set BBB_SIGNING_DLIB")
    }
    $dlib = $dlib.FullName
  }
  # signtool has to be built for the same processor as the dlib it loads.
  $arch = if ($dlib -match "\\x86\\") { "x86" } else { "x64" }

  if ($env:BBB_SIGNTOOL) {
    if (-not (Test-Path -LiteralPath $env:BBB_SIGNTOOL -PathType Leaf)) {
      Fail "BBB_SIGNTOOL points at $env:BBB_SIGNTOOL, which doesn't exist"
    }
    $signtool = $env:BBB_SIGNTOOL
  } else {
    $kits = if (${env:ProgramFiles(x86)}) { Join-Path ${env:ProgramFiles(x86)} "Windows Kits\10\bin" }
    $signtools = @(Get-NewestFile ($toolsFolders + @($kits)) "signtool.exe" |
        Where-Object { $_.FullName -match "\\$arch\\" }) + @(Get-Command signtool.exe -ErrorAction SilentlyContinue)
    $signtool = $signtools | Select-Object -First 1
    if (-not $signtool) {
      Fail "couldn't find signtool.exe. Install Microsoft's client tools or the Windows SDK, or set BBB_SIGNTOOL"
    }
    $signtool = if ($signtool -is [IO.FileInfo]) { $signtool.FullName } else { $signtool.Path }
  }

  $metadata = Join-Path ([IO.Path]::GetTempPath()) ("bbb-signing-" + [Guid]::NewGuid().ToString("N") + ".json")
  [IO.File]::WriteAllText($metadata, ($settings | ConvertTo-Json), (New-Object Text.UTF8Encoding $false))
  try {
    & $signtool sign /v /fd SHA256 /tr $timestamp /td SHA256 /d bookbookbook /dlib $dlib /dmdf $metadata $Path
    if ($LASTEXITCODE -ne 0) {
      Fail "$signtool couldn't sign $Path (exit code $LASTEXITCODE)"
    }
  } finally {
    Remove-Item -LiteralPath $metadata -ErrorAction SilentlyContinue
  }
}

if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
  Fail "there's no file at $Path"
}
$Path = (Resolve-Path -LiteralPath $Path).ProviderPath

if ($env:BBB_SIGNING_CERT) {
  $timestamp = if ($env:BBB_SIGNING_TIMESTAMP) { $env:BBB_SIGNING_TIMESTAMP } else { "http://timestamp.digicert.com" }
  Sign-WithStoreCertificate $env:BBB_SIGNING_CERT $timestamp
} else {
  $timestamp = if ($env:BBB_SIGNING_TIMESTAMP) { $env:BBB_SIGNING_TIMESTAMP } else { "http://timestamp.acs.microsoft.com" }
  Sign-WithArtifactSigning $timestamp
}
