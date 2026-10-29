# Funções comuns (carregar com: . "$PSScriptRoot\comum.ps1")
$ErrorActionPreference = 'Stop'
$App = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
function Carregar-Env {
  Get-Content "$App\.env.local" | ForEach-Object {
    if ($_ -match '^\s*([A-Z_]+)=(.*)$') { $val = $Matches[2].Trim()
      if ($val.Length -ge 2 -and $val.StartsWith('"') -and $val.EndsWith('"')) { $val = $val.Substring(1, $val.Length - 2) }
      Set-Item -Path "env:$($Matches[1])" -Value $val } }
}
function Achar-Pg { $d = Get-ChildItem "$env:ProgramFiles\PostgreSQL" -Directory -ErrorAction SilentlyContinue | Sort-Object Name -Descending | Select-Object -First 1
  if (-not $d) { throw 'PostgreSQL não encontrado.' }; return "$($d.FullName)\bin" }
function Proteger-Arquivo($entrada, $saida, $senha) {
  $salt = New-Object byte[] 16; $iv = New-Object byte[] 16
  $rng = [Security.Cryptography.RandomNumberGenerator]::Create(); $rng.GetBytes($salt); $rng.GetBytes($iv)
  $kdf = New-Object Security.Cryptography.Rfc2898DeriveBytes($senha, $salt, 200000, [Security.Cryptography.HashAlgorithmName]::SHA256)
  $aes = [Security.Cryptography.Aes]::Create(); $aes.Key = $kdf.GetBytes(32); $aes.IV = $iv
  $out = [IO.File]::Create($saida); $out.Write($salt, 0, 16); $out.Write($iv, 0, 16)
  $cs = New-Object Security.Cryptography.CryptoStream($out, $aes.CreateEncryptor(), 'Write')
  $in = [IO.File]::OpenRead($entrada); $in.CopyTo($cs); $in.Close(); $cs.Close(); $out.Close()
}
function Revelar-Arquivo($entrada, $saida, $senha) {
  $in = [IO.File]::OpenRead($entrada); $salt = New-Object byte[] 16; $iv = New-Object byte[] 16
  [void]$in.Read($salt, 0, 16); [void]$in.Read($iv, 0, 16)
  $kdf = New-Object Security.Cryptography.Rfc2898DeriveBytes($senha, $salt, 200000, [Security.Cryptography.HashAlgorithmName]::SHA256)
  $aes = [Security.Cryptography.Aes]::Create(); $aes.Key = $kdf.GetBytes(32); $aes.IV = $iv
  $cs = New-Object Security.Cryptography.CryptoStream($in, $aes.CreateDecryptor(), 'Read')
  $out = [IO.File]::Create($saida); $cs.CopyTo($out); $out.Close(); $cs.Close(); $in.Close()
}
