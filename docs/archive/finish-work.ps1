param(
    [string]$BranchName,
    [string]$Remote = "origin",
    [string]$MainBranch = "master"
)

$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")

$currentBranch = (git rev-parse --abbrev-ref HEAD).Trim()
if (-not $BranchName) {
    $BranchName = $currentBranch
}

if ($BranchName -eq $MainBranch) {
    throw "Finish-work must be run from a feature/fix branch, not $MainBranch."
}

$dirty = git status --porcelain
if ($dirty) {
    throw "Working tree is not clean. Commit or stash changes before finishing a branch."
}

Write-Host "Syncing $MainBranch from $Remote..."
git fetch $Remote --prune
git checkout $MainBranch
git pull --ff-only $Remote $MainBranch

Write-Host "Fast-forward merging $BranchName into $MainBranch..."
git merge --ff-only $BranchName

Write-Host "Pushing $MainBranch to $Remote..."
git push $Remote $MainBranch

Write-Host "Deleting local branch $BranchName..."
git branch -d $BranchName

git status -sb
