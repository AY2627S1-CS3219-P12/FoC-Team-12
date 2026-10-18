#Requires -Version 7.2
[CmdletBinding()]
param(
    [string] $Profile = 'foc-local',
    [ValidatePattern('^foc-[a-z0-9-]+$')][string] $Namespace = 'foc-local'
)
$ErrorActionPreference = 'Stop'
. "$PSScriptRoot/Common.ps1"
Initialize-KafkaTools $Profile $Namespace

$broker = Read-KafkaSecret 'kafka-broker-secrets'
if (-not $broker) {
    $claim = Invoke-KafkaKubectl @('get', 'pvc', 'data-kafka-0', '--ignore-not-found', '-o', 'name')
    if ($claim) { throw 'Kafka storage exists without its broker Secret. Recover the original Secret; do not replace credentials.' }
    $passwords = @{}
    foreach ($key in @('KAFKA_ADMIN_PASSWORD', 'KAFKA_BROKER_PASSWORD', 'KAFKA_USER_SERVICE_PASSWORD',
            'KAFKA_ORDER_SERVICE_PASSWORD', 'KAFKA_CREDIT_SERVICE_PASSWORD', 'KAFKA_UI_BROKER_PASSWORD')) {
        $passwords[$key] = [Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
    }
    Ensure-KafkaSecret 'kafka-broker-secrets' $passwords
    $broker = Read-KafkaSecret 'kafka-broker-secrets'
}
$passwords = @{}
foreach ($key in @('KAFKA_ADMIN_PASSWORD', 'KAFKA_BROKER_PASSWORD', 'KAFKA_USER_SERVICE_PASSWORD',
        'KAFKA_ORDER_SERVICE_PASSWORD', 'KAFKA_CREDIT_SERVICE_PASSWORD', 'KAFKA_UI_BROKER_PASSWORD')) {
    if (-not $broker.data.ContainsKey($key)) { throw "Broker Secret is missing $key; recover it before proceeding." }
    $passwords[$key] = ConvertFrom-KafkaSecretValue $broker.data[$key]
    if ([string]::IsNullOrWhiteSpace($passwords[$key]) -or $passwords[$key] -match '[\r\n]') {
        throw 'Broker credentials must be nonempty and contain no line breaks.'
    }
}
try {
    Ensure-KafkaSecret 'kafka-admin-client' @{ KAFKA_ADMIN_PASSWORD = $passwords.KAFKA_ADMIN_PASSWORD }
    foreach ($service in @('user', 'order', 'credit')) {
        Ensure-KafkaSecret "$service-kafka-client" @{
            KAFKA_PASSWORD = $passwords["KAFKA_$($service.ToUpperInvariant())_SERVICE_PASSWORD"]
        }
    }
    $ui = Read-KafkaSecret 'kafka-ui-secrets'
    $loginName = if ($ui) { ConvertFrom-KafkaSecretValue $ui.data.SPRING_SECURITY_USER_NAME } else { 'kafka-viewer' }
    $loginPassword = if ($ui) { ConvertFrom-KafkaSecretValue $ui.data.SPRING_SECURITY_USER_PASSWORD } else {
        [Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
    }
    if ([string]::IsNullOrWhiteSpace($loginName) -or [string]::IsNullOrWhiteSpace($loginPassword) -or
        $loginName -match '[\r\n]' -or $loginPassword -match '[\r\n]') {
        throw 'UI login credentials must be nonempty and contain no line breaks. Recover the existing Secret.'
    }
    $escapedPassword = $passwords.KAFKA_UI_BROKER_PASSWORD.Replace('\', '\\').Replace('"', '\"')
    Ensure-KafkaSecret 'kafka-ui-secrets' @{
        KAFKA_CLUSTERS_0_PROPERTIES_SASL_JAAS_CONFIG = 'org.apache.kafka.common.security.plain.PlainLoginModule required username="kafka_ui" password="' + $escapedPassword + '";'
        SPRING_SECURITY_USER_NAME = $loginName
        SPRING_SECURITY_USER_PASSWORD = $loginPassword
    }
    Write-Host 'Kafka credentials are ready. Passwords were neither printed nor saved to files. Existing values were preserved.'
} finally { $passwords = $null; $broker = $null; $ui = $null; $loginPassword = $null; $escapedPassword = $null }
