#Requires -Version 7.2
[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [ValidateSet('gateway', 'supplier', 'credit', 'order')]
    [string] $Service,
    [string] $Profile = 'foc-local',
    [switch] $CheckDatabaseRestart
)

$ErrorActionPreference = 'Stop'
$command = Get-Command minikube -ErrorAction SilentlyContinue
$minikube = if ($command) { $command.Source } else {
    Join-Path $env:ProgramFiles 'Kubernetes/Minikube/minikube.exe'
}
function Invoke-Kubectl {
    param([string[]] $Arguments)
    $result = & $minikube -p $Profile kubectl -- "--context=$Profile" -n foc-local @Arguments
    if ($LASTEXITCODE -ne 0) { throw "Kubernetes check failed: $($Arguments -join ' ')" }
    return $result
}
function Assert-Http {
    param([string] $Url, [int] $Expected, [switch] $InvalidToken)
    # Reuse curl already included in User's image; no extra diagnostic image or credentials.
    $curl = @('exec', 'deployment/user-service', '--', 'curl', '--silent', '--show-error',
        '--max-time', '20', '--output', '/dev/null', '--write-out', '%{http_code}')
    if ($InvalidToken) { $curl += @('--header', 'Authorization: Bearer invalid-token') }
    if ($Expected -eq 200) {
        $curl += @('--fail', '--retry', '12', '--retry-delay', '2', '--retry-all-errors')
    }
    $status = Invoke-Kubectl ($curl + $Url)
    if ("$status" -ne "$Expected") { throw "$Url expected $Expected, received $status" }
    Write-Host "PASS $Expected $Url"
}

$deployment = if ($Service -eq 'gateway') { 'gateway' } else { "$Service-service" }
Invoke-Kubectl @('rollout', 'status', "deployment/$deployment", '--timeout=300s')
$port = @{ gateway = 8088; supplier = 8080; credit = 8083; order = 8082 }[$Service]
$base = "http://${deployment}:$port"
Assert-Http "$base/actuator/health" 200
if ($Service -eq 'gateway') {
    Assert-Http "$base/" 200
    Assert-Http "$base/.well-known/jwks.json" 200
    Assert-Http "$base/api/users/me" 401
    Assert-Http "$base/not-a-configured-route" 404
    return
}
Assert-Http "$base/v3/api-docs" 200
switch ($Service) {
    supplier {
        Assert-Http "$base/suppliers" 200
        Assert-Http "$base/api/suppliers" 200
        Assert-Http "$base/api/admin/suppliers" 401
        Assert-Http "$base/api/admin/suppliers" 401 -InvalidToken
        Assert-Http 'http://gateway:8088/suppliers' 200
        Assert-Http 'http://gateway:8088/api/suppliers' 200
    }
    credit {
        Assert-Http "$base/credits" 200
        Assert-Http "$base/api/credits/me" 401
        Assert-Http "$base/api/credits/me" 401 -InvalidToken
        Assert-Http 'http://gateway:8088/credits' 200
        Assert-Http 'http://gateway:8088/api/credits/me' 401
    }
    order {
        Assert-Http "$base/api/orders" 401 -InvalidToken
        # An unauthenticated creation must fail before input validation or mutation.
        $status = Invoke-Kubectl @('exec', 'deployment/user-service', '--', 'curl',
            '--silent', '--show-error', '--max-time', '20', '--output', '/dev/null',
            '--write-out', '%{http_code}', '--request', 'POST', "$base/api/orders")
        if ("$status" -ne '401') { throw "Order creation without JWT returned $status" }
        Write-Host 'PASS 401 unauthenticated Order creation'
        Assert-Http 'http://gateway:8088/docs/order/openapi.json' 200
        $status = Invoke-Kubectl @('exec', 'deployment/user-service', '--', 'curl',
            '--silent', '--show-error', '--max-time', '20', '--output', '/dev/null',
            '--write-out', '%{http_code}', '--request', 'POST',
            'http://gateway:8088/api/orders')
        if ("$status" -ne '401') { throw "Gateway Order creation without JWT returned $status" }
        Write-Host 'PASS 401 Order creation through the gateway'
    }
}

$database = "$Service-db"
Invoke-Kubectl @('rollout', 'status', "statefulset/$database", '--timeout=180s')
$query = "select count(*) from flyway_schema_history where success;"
$sqlArgs = @('exec', "$database-0", '--', 'psql', '-U', "${Service}_user",
    '-d', "${Service}_db", '-tAc', $query)
$before = Invoke-Kubectl $sqlArgs
if ([int] "$before" -lt 1) { throw 'No successful database migrations found.' }
$claim = "data-$database-0"
$uid = Invoke-Kubectl @('get', 'pvc', $claim, '-o', 'jsonpath={.metadata.uid}')
Write-Host "PASS database migrations: $before; persistent claim: $claim"
if ($CheckDatabaseRestart) {
    # Replace only the database pod, never its StatefulSet, claim, Secret or namespace.
    Invoke-Kubectl @('delete', 'pod', "$database-0", '--wait=true')
    Invoke-Kubectl @('rollout', 'status', "statefulset/$database", '--timeout=180s')
    $after = Invoke-Kubectl $sqlArgs
    $afterUid = Invoke-Kubectl @('get', 'pvc', $claim, '-o', 'jsonpath={.metadata.uid}')
    if ("$before" -ne "$after" -or "$uid" -ne "$afterUid") {
        throw 'Database restart did not preserve the migration records and claim identity.'
    }
    Assert-Http "$base/actuator/health" 200
    Write-Host 'PASS database pod replacement retained migrations and the same persistent claim'
}
