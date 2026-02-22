param(
    [string]$Remote = "origin",
    [string]$MainBranch = "master"
)

$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")

Write-Host "Fetching latest from $Remote..."
git fetch $Remote --prune

Write-Host "Checking out $MainBranch..."
git checkout $MainBranch

Write-Host "Fast-forwarding $MainBranch from $Remote/$MainBranch..."
git pull --ff-only $Remote $MainBranch

Write-Host "Current status:"
git status -sb
