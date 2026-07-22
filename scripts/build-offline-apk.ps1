$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$keyStore = Join-Path $env:USERPROFILE ".android\zhaoxi-release.jks"
$credentialFile = Join-Path $env:USERPROFILE ".android\zhaoxi-release-credential.xml"

if (-not (Test-Path -LiteralPath $keyStore)) {
  throw "缺少朝夕签名文件：$keyStore"
}
if (-not (Test-Path -LiteralPath $credentialFile)) {
  throw "缺少朝夕签名凭据：$credentialFile"
}

$credential = Import-Clixml -LiteralPath $credentialFile
$password = $credential.GetNetworkCredential().Password
$previousTarget = $env:NEXT_PUBLIC_APP_TARGET
$previousKeyStore = $env:ZHAOXI_KEYSTORE_FILE
$previousStorePassword = $env:ZHAOXI_KEYSTORE_PASSWORD
$previousKeyAlias = $env:ZHAOXI_KEY_ALIAS
$previousKeyPassword = $env:ZHAOXI_KEY_PASSWORD
$previousJavaHome = $env:JAVA_HOME
$previousPath = $env:PATH
$publicApk = Join-Path $projectRoot "public\daily-coach.apk"
$parkedApk = Join-Path $env:TEMP "zhaoxi-public-apk-build-backup.apk"
$locationPushed = $false
$builtSuccessfully = $false

try {
  $jdkCandidates = @(
    (Join-Path $env:LOCALAPPDATA "Programs\Microsoft\jdk-21.0.11-zip\jdk-21.0.11+10"),
    (Get-ChildItem -Directory -Path (Join-Path $env:LOCALAPPDATA "Programs\Microsoft") -Filter "jdk-21*" -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty FullName)
  )
  $jdkCandidates = @($jdkCandidates | Where-Object { $_ -and (Test-Path -LiteralPath (Join-Path $_ "bin\java.exe")) })
  if (-not $jdkCandidates) {
    throw "需要 JDK 21 才能构建 Android APK"
  }
  $env:JAVA_HOME = $jdkCandidates[0]
  $env:PATH = (Join-Path $env:JAVA_HOME "bin") + ";" + $previousPath
  $env:NEXT_PUBLIC_APP_TARGET = "android"
  $env:ZHAOXI_KEYSTORE_FILE = $keyStore
  $env:ZHAOXI_KEYSTORE_PASSWORD = $password
  $env:ZHAOXI_KEY_ALIAS = $credential.UserName
  $env:ZHAOXI_KEY_PASSWORD = $password

  if (Test-Path -LiteralPath $parkedApk) {
    Remove-Item -LiteralPath $parkedApk -Force
  }
  if (Test-Path -LiteralPath $publicApk) {
    Move-Item -LiteralPath $publicApk -Destination $parkedApk
  }

  Push-Location $projectRoot
  $locationPushed = $true
  & npm.cmd run build
  if ($LASTEXITCODE -ne 0) { throw "网页构建失败" }

  & npx.cmd cap sync android
  if ($LASTEXITCODE -ne 0) { throw "Android 同步失败" }

  Push-Location (Join-Path $projectRoot "android")
  try {
    & .\gradlew.bat clean assembleRelease
    if ($LASTEXITCODE -ne 0) { throw "APK 构建失败" }
  } finally {
    Pop-Location
  }

  $builtApk = Join-Path $projectRoot "android\app\build\outputs\apk\release\app-release.apk"
  $siteApk = Join-Path $projectRoot "download-site\daily-coach.apk"
  Copy-Item -LiteralPath $builtApk -Destination $publicApk -Force
  Copy-Item -LiteralPath $builtApk -Destination $siteApk -Force

  $hash = (Get-FileHash -Algorithm SHA256 -LiteralPath $builtApk).Hash
  $releaseInfo = [ordered]@{
    app = "朝夕·离线"
    version = "2.0.0"
    package = "com.shihao29.zhaoxi"
    sha256 = $hash
    builtAt = (Get-Date).ToUniversalTime().ToString("o")
  }
  $releaseInfo | ConvertTo-Json | Set-Content -Encoding UTF8 -LiteralPath (Join-Path $projectRoot "download-site\release.json")

  $releaseDir = Join-Path $projectRoot "release"
  New-Item -ItemType Directory -Force -Path $releaseDir | Out-Null
  $archive = Join-Path $releaseDir "daily-coach-download-site.zip"
  Compress-Archive -Path (Join-Path $projectRoot "download-site\*") -DestinationPath $archive -Force

  Write-Output "APK=$publicApk"
  Write-Output "DOWNLOAD_SITE=$archive"
  Write-Output "SHA256=$hash"
  $builtSuccessfully = $true
} finally {
  if ($locationPushed) {
    Pop-Location
  }
  if (-not $builtSuccessfully -and (Test-Path -LiteralPath $parkedApk)) {
    Move-Item -LiteralPath $parkedApk -Destination $publicApk -Force
  } elseif (Test-Path -LiteralPath $parkedApk) {
    Remove-Item -LiteralPath $parkedApk -Force
  }
  $env:NEXT_PUBLIC_APP_TARGET = $previousTarget
  $env:ZHAOXI_KEYSTORE_FILE = $previousKeyStore
  $env:ZHAOXI_KEYSTORE_PASSWORD = $previousStorePassword
  $env:ZHAOXI_KEY_ALIAS = $previousKeyAlias
  $env:ZHAOXI_KEY_PASSWORD = $previousKeyPassword
  $env:JAVA_HOME = $previousJavaHome
  $env:PATH = $previousPath
  $password = $null
}
