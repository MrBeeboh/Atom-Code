param(
    [Parameter(Mandatory = $true)]
    [string]$Message
)

$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")

Write-Host "Staging changes..."
git add -A

$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "No staged changes to commit."
    exit 0
}

Write-Host "Committing..."
git commit -m $Message

Write-Host "Pushing current branch to origin..."
git push -u origin HEAD

git status -sb
