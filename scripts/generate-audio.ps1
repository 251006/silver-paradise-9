param(
  [string]$ManifestPath = "$PSScriptRoot/audio-manifest.json",
  [string]$OutputDir = "$PSScriptRoot/generated-audio",
  [string]$VoiceName = "",
  [int]$Rate = 0,
  [int]$Volume = 100,
  [switch]$ListVoices
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.Speech

function Get-PreferredVoiceName {
  param(
    [System.Speech.Synthesis.SpeechSynthesizer]$Synthesizer
  )

  $voices = $Synthesizer.GetInstalledVoices() | ForEach-Object { $_.VoiceInfo }
  $preferred = $voices | Where-Object {
    $_.Culture.Name -like "zh-*" -or $_.Name -match "Chinese|中文|Huihui|Yaoyao|Kangkang"
  } | Select-Object -First 1

  if ($preferred) {
    return $preferred.Name
  }

  return ($voices | Select-Object -First 1).Name
}

$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer

if ($ListVoices) {
  $synth.GetInstalledVoices() |
    ForEach-Object { $_.VoiceInfo } |
    Select-Object Name, Culture, Gender, Age |
    Format-Table -AutoSize |
    Out-String |
    Write-Output
  exit 0
}

if (-not (Test-Path -LiteralPath $ManifestPath)) {
  throw "未找到语音清单: $ManifestPath"
}

$selectedVoice = if ([string]::IsNullOrWhiteSpace($VoiceName)) {
  Get-PreferredVoiceName -Synthesizer $synth
} else {
  $VoiceName
}

$synth.SelectVoice($selectedVoice)
$synth.Rate = $Rate
$synth.Volume = $Volume

if (-not (Test-Path -LiteralPath $OutputDir)) {
  New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null
}

$entries = Get-Content -LiteralPath $ManifestPath -Raw | ConvertFrom-Json
$generated = @()

foreach ($entry in $entries) {
  if ([string]::IsNullOrWhiteSpace($entry.text) -or [string]::IsNullOrWhiteSpace($entry.fileName)) {
    throw "语音清单项缺少 text 或 fileName 字段"
  }

  $targetPath = Join-Path $OutputDir $entry.fileName
  $synth.SetOutputToWaveFile($targetPath)
  $synth.Speak($entry.text)
  $synth.SetOutputToNull()

  $generated += [PSCustomObject]@{
    key = $entry.key
    text = $entry.text
    fileName = $entry.fileName
    voice = $selectedVoice
    rate = $Rate
    volume = $Volume
    outputPath = $targetPath
  }
}

$manifestOutputPath = Join-Path $OutputDir "manifest.json"
$generated | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $manifestOutputPath -Encoding UTF8

$generated |
  Select-Object key, text, fileName, voice |
  Format-Table -AutoSize |
  Out-String |
  Write-Output

Write-Output "生成完成，输出目录: $OutputDir"
Write-Output "资源清单: $manifestOutputPath"

$synth.Dispose()