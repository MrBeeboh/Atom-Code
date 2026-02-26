param(
    [Parameter(Mandatory = $true)]
    [string]$BranchName,
    [string]$Remote = "origin",
    [string]$MainBranch = "master"
)

$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")

$dirty = git status --porcelain
if ($dirty) {
    throw "Working tree is not clean. Commit or stash changes before starting a new branch."
}

Write-Host "Syncing $MainBranch from $Remote..."
git fetch $Remote --prune
git checkout $MainBranch
git pull --ff-only $Remote $MainBranch

Write-Host "Creating and switching to $BranchName..."
git checkout -b $BranchName

git status -sb
