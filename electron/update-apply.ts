// electron/update-apply.ts — generates and launches the PowerShell helper that
// applies a staged update after the app quits.
//
// Windows cannot replace a running .exe or its loaded DLLs, so the standard
// approach is: download + verify + stage the update while running, then on
// quit spawn a detached PowerShell script that (1) waits for the app process
// to exit, (2) robocopies the staged files over the install dir, (3) removes
// deleted files, (4) relaunches the app, (5) cleans up.
//
// If the install dir is not writable (e.g. Program Files), the script
// self-elevates via UAC before robocopy. If robocopy fails unexpectedly,
// the script retries elevated once.
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { log } from './log.js';

export interface ApplyPayload {
  /** absolute path to the staged update dir (files already extracted, mirror install layout) */
  stagedDir: string;
  /** the install directory (dirname of the running exe) */
  installDir: string;
  /** exe name to relaunch (e.g. 'LX-DSH.exe') */
  exeName: string;
  /** rel paths to delete from installDir after applying */
  deleted: string[];
  /** temp dir to clean up (stagedDir parent or stagedDir itself) */
  cleanupDir: string;
  /** true when the install dir is not user-writable (Program Files) — script self-elevates via UAC */
  needsElevation: boolean;
}

// Escape backslashes for embedding inside a double-quoted PowerShell string.
function psEscape(s: string): string {
  return s.replace(/\\/g, '\\\\');
}

/**
 * Generate the apply.ps1 script and spawn it detached, then return immediately.
 * The script does the actual file replacement after this process exits.
 */
export function launchApplyHelper(p: ApplyPayload): void {
  const workDir = dirname(p.stagedDir);
  const scriptPath = join(workDir, 'apply.ps1');
  const deletedListPath = join(workDir, 'deleted.txt');
  const logPath = join(workDir, 'apply.log');

  // write the deleted-files list (one rel path per line)
  writeFileSync(deletedListPath, p.deleted.join('\n') + (p.deleted.length ? '\n' : ''));

  const procName = p.exeName.replace(/\.exe$/i, '');
  const exeFull = join(p.installDir, p.exeName);

  // Build the PowerShell script with placeholder substitution.
  // Self-elevation: if needsElevation is set and the script is not running as
  // admin, it relaunches itself with -Verb RunAs (UAC prompt) before doing any
  // file operations. If robocopy fails unexpectedly (exit >= 8) and the script
  // is not elevated, it retries once with elevation.
  const ps = `
$ErrorActionPreference = "Stop"
$exe = "{{EXE}}"
$installDir = "{{INSTALL}}"
$stagedDir = "{{STAGED}}"
$deletedList = "{{DELETED}}"
$logFile = "{{LOG}}"
$needsElevation = {{ELEVATION}}
function Log($msg) { Add-Content -Path $logFile -Value ((Get-Date -Format "o") + " " + $msg) }
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if ($needsElevation -and -not $isAdmin) {
  Log "self-elevating for admin privileges (UAC prompt)"
  Start-Process powershell.exe -Verb RunAs -ArgumentList @("-NoProfile","-ExecutionPolicy","Bypass","-WindowStyle","Hidden","-File",$PSCommandPath)
  exit
}
Log "apply helper started"
Log "waiting for app process to exit..."
$deadline = (Get-Date).AddSeconds(30)
while ((Get-Process -Name "{{PROC}}" -ErrorAction SilentlyContinue) -and (Get-Date) -lt $deadline) {
  Start-Sleep -Milliseconds 300
}
if (Get-Process -Name "{{PROC}}" -ErrorAction SilentlyContinue) {
  Log "app still running after 30s - force stopping"
  Stop-Process -Name "{{PROC}}" -Force -ErrorAction SilentlyContinue
  Start-Sleep -Seconds 2
}
Log "app exited, applying staged files"
$rc = (robocopy $stagedDir $installDir /E /NJH /NJS /NDL /NC /NS /NP /R:2 /W:2)
Log "robocopy exit code: $LASTEXITCODE"
if ($LASTEXITCODE -ge 8 -and -not $isAdmin) {
  Log "robocopy failed (exit $LASTEXITCODE) - retrying elevated"
  Start-Process powershell.exe -Verb RunAs -ArgumentList @("-NoProfile","-ExecutionPolicy","Bypass","-WindowStyle","Hidden","-File",$PSCommandPath)
  exit
}
if (Test-Path $deletedList) {
  Get-Content $deletedList | Where-Object { $_.Trim() } | ForEach-Object {
    $rel = $_.Trim()
    $target = Join-Path $installDir $rel
    if (Test-Path $target) {
      Remove-Item $target -Force -ErrorAction SilentlyContinue
      Log "deleted: $rel"
    }
  }
}
if (Test-Path $exe) {
  Log "relaunching $exe"
  Start-Process $exe
} else {
  Log "ERROR: exe not found at $exe"
}
Start-Sleep -Seconds 1
Remove-Item "{{CLEANUP}}" -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item $PSCommandPath -Force -ErrorAction SilentlyContinue
Log "apply complete"
`;

  const filled = ps
    .split('{{EXE}}').join(psEscape(exeFull))
    .split('{{INSTALL}}').join(psEscape(p.installDir))
    .split('{{STAGED}}').join(psEscape(p.stagedDir))
    .split('{{DELETED}}').join(psEscape(deletedListPath))
    .split('{{LOG}}').join(psEscape(logPath))
    .split('{{PROC}}').join(procName)
    .split('{{CLEANUP}}').join(psEscape(p.cleanupDir))
    .split('{{ELEVATION}}').join(p.needsElevation ? '$true' : '$false');

  writeFileSync(scriptPath, filled, { encoding: 'utf8' });
  log('update-apply: launching ' + scriptPath + (p.needsElevation ? ' (will self-elevate)' : ''));

  // Spawn detached: the script outlives this process.
  const child = spawn(
    'powershell.exe',
    ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-File', scriptPath],
    { detached: true, stdio: 'ignore', windowsHide: true },
  );
  child.unref();
}
