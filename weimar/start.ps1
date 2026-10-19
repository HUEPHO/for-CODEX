$ErrorActionPreference = 'Stop'
$nodeCommand = Get-Command node -ErrorAction SilentlyContinue
if ($nodeCommand) {
    $weimarNode = $nodeCommand.Source
} else {
    $weimarNode = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
}
if (-not (Test-Path -LiteralPath $weimarNode)) {
    throw 'Node.js 24+ is required. Install Node, then run pnpm install and pnpm dev.'
}
$weimarVite = Join-Path $PSScriptRoot 'node_modules\vite\bin\vite.js'
if (-not (Test-Path -LiteralPath $weimarVite)) {
    throw 'Dependencies are missing. Run pnpm install --frozen-lockfile in this folder.'
}
Push-Location -LiteralPath $PSScriptRoot
try {
    & $weimarNode $weimarVite --host 127.0.0.1 @args
} finally {
    Pop-Location
}
