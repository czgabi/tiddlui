# Builds the Python engine into a single-file executable and places it where
# Tauri's `externalBin` expects it (binaries/tiddl-engine-<target-triple>.exe).
#
# Requires Python >= 3.13 with sidecar/requirements.txt installed:
#   pip install -r requirements.txt
#
# Usage (from the sidecar/ directory):
#   ./build.ps1

$ErrorActionPreference = 'Stop'

# Resolve the Rust host target triple (Tauri sidecars are suffixed with it).
$triple = (& rustc -Vv | Select-String '^host:').ToString().Split(' ')[1]
if (-not $triple) { $triple = 'x86_64-pc-windows-msvc' }

Write-Host "Building tiddl-engine for $triple ..."

python -m PyInstaller --onefile --noconfirm --clean --name tiddl-engine `
  --collect-submodules tiddl.core `
  --copy-metadata tiddl `
  --collect-all keyring `
  --hidden-import=aiohttp --hidden-import=yarl --hidden-import=multidict `
  --hidden-import=keyring.backends.Windows `
  --distpath ./dist --workpath ./build_pyi --specpath . `
  engine.py

$dest = "../src-tauri/binaries"
New-Item -ItemType Directory -Force -Path $dest | Out-Null
Copy-Item ./dist/tiddl-engine.exe "$dest/tiddl-engine-$triple.exe" -Force

Write-Host "Done -> $dest/tiddl-engine-$triple.exe"
