# Csharp API Explorer Installation Script
# Author: Dankit
# Description: Package and install VSCode extension

Write-Host "=====================================" -ForegroundColor Cyan
Write-Host "  C# API Console Installer" -ForegroundColor Cyan
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host ""

# Check Node.js
Write-Host "Checking Node.js..." -ForegroundColor Yellow
try {
    $nodeVersion = node --version
    Write-Host "Node.js installed: $nodeVersion" -ForegroundColor Green
} catch {
    Write-Host "Node.js not found. Please install Node.js first." -ForegroundColor Red
    exit 1
}

# Check VSCode
Write-Host "Checking VSCode..." -ForegroundColor Yellow
try {
    $codeVersion = code --version 2>&1 | Select-Object -First 1
    Write-Host "VSCode installed: $codeVersion" -ForegroundColor Green
} catch {
    Write-Host "VSCode CLI not found." -ForegroundColor Red
    Write-Host "Please install 'code' command in PATH from VSCode." -ForegroundColor Yellow
    exit 1
}

# Check vsce
Write-Host "Checking vsce..." -ForegroundColor Yellow
try {
    $vsceVersion = vsce --version 2>&1
    Write-Host "vsce installed: $vsceVersion" -ForegroundColor Green
} catch {
    Write-Host "vsce not found. Installing..." -ForegroundColor Yellow
    npm install -g @vscode/vsce
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Failed to install vsce" -ForegroundColor Red
        exit 1
    }
    Write-Host "vsce installed successfully" -ForegroundColor Green
}

Write-Host ""
Write-Host "=====================================" -ForegroundColor Cyan

# Install dependencies
Write-Host "Installing dependencies..." -ForegroundColor Yellow
npm install
if ($LASTEXITCODE -ne 0) {
    Write-Host "Failed to install dependencies" -ForegroundColor Red
    exit 1
}
Write-Host "Dependencies installed" -ForegroundColor Green

# Compile
Write-Host "Compiling..." -ForegroundColor Yellow
npm run compile
if ($LASTEXITCODE -ne 0) {
    Write-Host "Compilation failed" -ForegroundColor Red
    exit 1
}
Write-Host "Compilation successful" -ForegroundColor Green

# Package
Write-Host "Packaging extension..." -ForegroundColor Yellow
vsce package
if ($LASTEXITCODE -ne 0) {
    Write-Host "Packaging failed" -ForegroundColor Red
    exit 1
}
Write-Host "Packaging successful" -ForegroundColor Green

Write-Host "Done" -ForegroundColor Cyan
