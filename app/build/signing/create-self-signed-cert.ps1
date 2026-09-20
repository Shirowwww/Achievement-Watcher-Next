<#
.SYNOPSIS
    Creates a self-signed code-signing certificate for local builds of
    Achievement Watcher and exports it as a PFX for electron-builder.

.DESCRIPTION
    The certificate (CN=Shirow) is generated in the CurrentUser\My store and
    exported to Shirow.pfx / Shirow.cer in this folder. Trust installation is
    opt-in (-InstallTrust) because Windows shows a one-time security
    confirmation when a root certificate is added; it only ever happens on
    the machine running this script, never on machines that simply run the app.

    NOTE: a self-signed certificate does NOT remove the SmartScreen
    "Windows protected your PC" warning on machines that do not trust this
    certificate. Only a certificate issued by a public CA (or installing this
    certificate in the trusted stores of each machine) removes the warning.

.PARAMETER CertificateName
    Subject common name used for the certificate. Defaults to "Shirow".

.PARAMETER FileName
    Base name of the exported files. Defaults to the common name. The standby
    certificate keeps CN=Shirow (the update check matches it) under another
    file name: -FileName Shirow-standby. Its password goes to
    .password-<FileName> so the release certificate's .password is untouched.

.PARAMETER Years
    Validity period in years. Defaults to 5.

.PARAMETER Password
    PFX export password. A random one is generated and stored in .password
    (local only, never committed) when omitted.

.PARAMETER Force
    Replace an existing certificate. Previously signed builds will stop
    being trusted after the replacement.

.PARAMETER InstallTrust
    Install the certificate into CurrentUser\Root and
    CurrentUser\TrustedPublisher so Windows trusts signatures made with it on
    this machine. Windows will ask for confirmation once. This is only useful
    to suppress the SmartScreen warning on a machine you control; end users
    never see this prompt.
#>
[CmdletBinding()]
param(
    [string]$CertificateName = "Shirow",
    [string]$FileName,
    [int]$Years = 5,
    [string]$Password,
    [switch]$Force,
    [switch]$InstallTrust
)

$ErrorActionPreference = "Stop"

$signingDir = $PSScriptRoot
if ([string]::IsNullOrWhiteSpace($FileName)) { $FileName = $CertificateName }
$pfxPath = Join-Path $signingDir "$FileName.pfx"
$cerPath = Join-Path $signingDir "$FileName.cer"
# build/build.js reads .password for Shirow.pfx; any other file keeps its own password file.
$passwordName = if ($FileName -eq "Shirow") { ".password" } else { ".password-$FileName" }
$passwordFile = Join-Path $signingDir $passwordName

if ((Test-Path $pfxPath) -and -not $Force) {
    throw "A certificate already exists at $pfxPath. Use -Force to replace it (previously signed builds will stop being trusted)."
}

if ([string]::IsNullOrWhiteSpace($Password)) {
    $chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789"
    $bytes = New-Object byte[] 24
    $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try {
        $rng.GetBytes($bytes)
    }
    finally {
        $rng.Dispose()
    }
    $sb = New-Object System.Text.StringBuilder
    foreach ($b in $bytes) {
        [void]$sb.Append($chars[$b % $chars.Length])
    }
    $Password = $sb.ToString()
}

$notBefore = (Get-Date).AddDays(-1)
$notAfter = (Get-Date).AddYears($Years)

Write-Host "Generating self-signed code-signing certificate CN=$CertificateName ..."
$cert = New-SelfSignedCertificate `
    -Subject "CN=$CertificateName" `
    -FriendlyName "Achievement Watcher self-signed code signing ($CertificateName)" `
    -Type CodeSigningCert `
    -CertStoreLocation "Cert:\CurrentUser\My" `
    -KeyExportPolicy Exportable `
    -KeyAlgorithm RSA `
    -KeyLength 2048 `
    -HashAlgorithm SHA256 `
    -NotBefore $notBefore `
    -NotAfter $notAfter

$securePassword = ConvertTo-SecureString -String $Password -AsPlainText -Force

Write-Host "Exporting PFX and CER ..."
Export-PfxCertificate -Cert $cert -FilePath $pfxPath -Password $securePassword | Out-Null
Export-Certificate -Cert $cert -FilePath $cerPath | Out-Null
Set-Content -Path $passwordFile -Value $Password -Encoding ascii -NoNewline

if ($InstallTrust) {
    Write-Host "Installing certificate into CurrentUser\Root and CurrentUser\TrustedPublisher ..."
    Import-Certificate -FilePath $cerPath -CertStoreLocation "Cert:\CurrentUser\Root" | Out-Null
    Import-Certificate -FilePath $cerPath -CertStoreLocation "Cert:\CurrentUser\TrustedPublisher" | Out-Null
}

Write-Host ""
Write-Host "Done."
Write-Host "  PFX: $pfxPath"
Write-Host "  Certificate thumbprint: $($cert.Thumbprint)"
Write-Host "  Password stored locally (never committed): $passwordFile"
Write-Host ""
Write-Host "Add this thumbprint to PINNED_THUMBPRINTS in app/util/updateSignature.js before shipping a build signed with it."
if ($FileName -eq "Shirow") {
    Write-Host "The next 'npm run build' will sign the app automatically with this certificate."
} else {
    Write-Host "Standby certificate: keep it offline. To rotate, rename it to Shirow.pfx and its password file to .password."
}
if ($InstallTrust) {
    Write-Host "Because the certificate is trusted on this machine, the local SmartScreen warning should no longer appear for these builds."
}
else {
    Write-Host "Trust was not installed (no -InstallTrust). To suppress the SmartScreen warning on this machine only, rerun with -InstallTrust and accept the one-time Windows confirmation."
}
