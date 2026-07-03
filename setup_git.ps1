# Git GitHub Integration Helper Script
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host "  GitHub Repository Linker Helper Script" -ForegroundColor Cyan
Write-Host "=============================================" -ForegroundColor Cyan

# 1. Get Email and Username
$defaultUsername = "jinsung8239"
$email = Read-Host "Enter your GitHub email address"
if ([string]::IsNullOrWhiteSpace($email)) {
    Write-Error "Email is required to configure Git."
    exit 1
}

$username = Read-Host "Enter your GitHub username [Default: $defaultUsername]"
if ([string]::IsNullOrWhiteSpace($username)) {
    $username = $defaultUsername
}

Write-Host "`nConfiguring Git identity..." -ForegroundColor Yellow
git config --global user.email $email
git config --global user.name $username

# Verify configurations
Write-Host "Git Configured with:"
Write-Host "  Email: $(git config --global user.email)"
Write-Host "  Name:  $(git config --global user.name)"

# 2. Check Git status and add files
Write-Host "`nStaging files..." -ForegroundColor Yellow
git add .

# 3. Commit changes
Write-Host "`nCommitting changes..." -ForegroundColor Yellow
$commitMsg = Read-Host "Enter commit message [Default: 'first commit']"
if ([string]::IsNullOrWhiteSpace($commitMsg)) {
    $commitMsg = "first commit"
}
git commit -m $commitMsg

# 4. Set branch to main
Write-Host "`nSetting default branch to main..." -ForegroundColor Yellow
git branch -M main

# 5. Check remote origin
$remoteUrl = "https://github.com/jinsung8239/moohyun523.git"
$existingRemote = git remote get-url origin 2>$null
if ($null -eq $existingRemote) {
    Write-Host "Adding remote origin: $remoteUrl" -ForegroundColor Yellow
    git remote add origin $remoteUrl
} else {
    Write-Host "Remote origin already set: $existingRemote" -ForegroundColor Yellow
}

# 6. Push to GitHub
Write-Host "`nPushing to GitHub..." -ForegroundColor Yellow
git push -u origin main

Write-Host "`n=============================================" -ForegroundColor Green
Write-Host "  Git and GitHub Setup completed successfully!" -ForegroundColor Green
Write-Host "=============================================" -ForegroundColor Green
