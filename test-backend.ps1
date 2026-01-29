# ============================================
# SCRIPT DE TESTE - INTER-IA ODONTO BACKEND
# ============================================

$BASE_URL = "https://api-odonto.marciosager.com/api/v1"
$headers = @{ "Content-Type" = "application/json" }

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  TESTANDO BACKEND INTER-IA ODONTO" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# ============================================
# 1. HEALTH CHECK
# ============================================
Write-Host "[1/8] Health Check..." -ForegroundColor Yellow
try {
    $health = Invoke-RestMethod -Uri "https://api-odonto.marciosager.com/api/health" -Method GET
    Write-Host "  ✅ Backend online! Status: $($health.data.status)" -ForegroundColor Green
    Write-Host "  ✅ Database: $($health.data.info.database.status)" -ForegroundColor Green
} catch {
    Write-Host "  ❌ Erro: $_" -ForegroundColor Red
    exit 1
}
Write-Host ""

# ============================================
# 2. CRIAR CLINICA
# ============================================
Write-Host "[2/8] Criando clinica de teste..." -ForegroundColor Yellow
$clinicData = @{
    name = "Clinica Sorriso Teste"
    cnpj = "12345678000199"
    phone = "11999998888"
    email = "contato@clinicasorriso.com"
    address = "Rua das Flores, 123"
    city = "Sao Paulo"
    state = "SP"
} | ConvertTo-Json

try {
    $clinic = Invoke-RestMethod -Uri "$BASE_URL/clinics" -Method POST -Headers $headers -Body $clinicData
    $clinicId = $clinic.data.id
    Write-Host "  ✅ Clinica criada! ID: $clinicId" -ForegroundColor Green
} catch {
    $errorMsg = $_.ErrorDetails.Message | ConvertFrom-Json
    if ($errorMsg.message -match "unique constraint" -or $errorMsg.message -match "already exists") {
        Write-Host "  ⚠️ Clinica ja existe, buscando..." -ForegroundColor Yellow
        $clinics = Invoke-RestMethod -Uri "$BASE_URL/clinics" -Method GET
        $clinicId = $clinics.data[0].id
        Write-Host "  ✅ Usando clinica existente: $clinicId" -ForegroundColor Green
    } else {
        Write-Host "  ❌ Erro: $($errorMsg.message)" -ForegroundColor Red
    }
}
Write-Host ""

# ============================================
# 3. CRIAR USUARIO
# ============================================
Write-Host "[3/8] Criando usuario de teste..." -ForegroundColor Yellow
$userData = @{
    name = "Dr. Teste Silva"
    email = "dr.teste@clinicasorriso.com"
    password = "Senha123!"
    clinic_id = $clinicId
} | ConvertTo-Json

try {
    $user = Invoke-RestMethod -Uri "$BASE_URL/auth/register" -Method POST -Headers $headers -Body $userData
    Write-Host "  ✅ Usuario criado! ID: $($user.data.user.id)" -ForegroundColor Green
} catch {
    $errorMsg = $_.ErrorDetails.Message | ConvertFrom-Json
    if ($errorMsg.message -match "already exists" -or $errorMsg.message -match "unique") {
        Write-Host "  ⚠️ Usuario ja existe" -ForegroundColor Yellow
    } else {
        Write-Host "  ❌ Erro: $($errorMsg.message)" -ForegroundColor Red
    }
}
Write-Host ""

# ============================================
# 4. LOGIN
# ============================================
Write-Host "[4/8] Fazendo login..." -ForegroundColor Yellow
$loginData = @{
    email = "dr.teste@clinicasorriso.com"
    password = "Senha123!"
} | ConvertTo-Json

try {
    $login = Invoke-RestMethod -Uri "$BASE_URL/auth/login" -Method POST -Headers $headers -Body $loginData
    $token = $login.data.access_token
    Write-Host "  ✅ Login OK! Token recebido" -ForegroundColor Green
    $authHeaders = @{ 
        "Content-Type" = "application/json"
        "Authorization" = "Bearer $token"
    }
} catch {
    Write-Host "  ❌ Erro no login: $_" -ForegroundColor Red
    exit 1
}
Write-Host ""

# ============================================
# 5. CRIAR SERVICOS
# ============================================
Write-Host "[5/8] Criando servicos..." -ForegroundColor Yellow
$servicos = @(
    @{ name = "Limpeza"; price = 150.00; duration = 30; description = "Limpeza dental completa" },
    @{ name = "Clareamento"; price = 800.00; duration = 60; description = "Clareamento dental" },
    @{ name = "Restauracao"; price = 200.00; duration = 45; description = "Restauracao em resina" },
    @{ name = "Extracao"; price = 250.00; duration = 40; description = "Extracao simples" },
    @{ name = "Canal"; price = 900.00; duration = 90; description = "Tratamento de canal" }
)

foreach ($servico in $servicos) {
    $servicoData = @{
        clinic_id = $clinicId
        name = $servico.name
        price = $servico.price
        duration = $servico.duration
        description = $servico.description
    } | ConvertTo-Json
    
    try {
        $result = Invoke-RestMethod -Uri "$BASE_URL/services" -Method POST -Headers $authHeaders -Body $servicoData
        Write-Host "  ✅ $($servico.name) - R$ $($servico.price)" -ForegroundColor Green
    } catch {
        Write-Host "  ⚠️ $($servico.name) ja existe ou erro" -ForegroundColor Yellow
    }
}
Write-Host ""

# ============================================
# 6. CRIAR DENTISTA
# ============================================
Write-Host "[6/8] Criando dentista..." -ForegroundColor Yellow
$dentistData = @{
    clinic_id = $clinicId
    name = "Dra. Ana Santos"
    cro = "SP-12345"
    specialty = "Ortodontia"
    phone = "11988887777"
    email = "dra.ana@clinicasorriso.com"
} | ConvertTo-Json

try {
    $dentist = Invoke-RestMethod -Uri "$BASE_URL/dentists" -Method POST -Headers $authHeaders -Body $dentistData
    $dentistId = $dentist.data.id
    Write-Host "  ✅ Dentista criado! ID: $dentistId" -ForegroundColor Green
} catch {
    Write-Host "  ⚠️ Dentista ja existe ou erro" -ForegroundColor Yellow
    $dentists = Invoke-RestMethod -Uri "$BASE_URL/dentists" -Method GET -Headers $authHeaders
    if ($dentists.data.Count -gt 0) {
        $dentistId = $dentists.data[0].id
    }
}
Write-Host ""

# ============================================
# 7. CRIAR PACIENTE
# ============================================
Write-Host "[7/8] Criando paciente de teste..." -ForegroundColor Yellow
$patientData = @{
    clinic_id = $clinicId
    name = "Joao da Silva"
    phone = "11977776666"
    email = "joao@email.com"
    cpf = "12345678901"
} | ConvertTo-Json

try {
    $patient = Invoke-RestMethod -Uri "$BASE_URL/patients" -Method POST -Headers $authHeaders -Body $patientData
    $patientId = $patient.data.id
    Write-Host "  ✅ Paciente criado! ID: $patientId" -ForegroundColor Green
} catch {
    Write-Host "  ⚠️ Paciente ja existe ou erro" -ForegroundColor Yellow
    $patients = Invoke-RestMethod -Uri "$BASE_URL/patients" -Method GET -Headers $authHeaders
    if ($patients.data.Count -gt 0) {
        $patientId = $patients.data[0].id
    }
}
Write-Host ""

# ============================================
# 8. LISTAR TUDO
# ============================================
Write-Host "[8/8] Verificando dados criados..." -ForegroundColor Yellow

try {
    $clinics = Invoke-RestMethod -Uri "$BASE_URL/clinics" -Method GET -Headers $authHeaders
    Write-Host "  📋 Clinicas: $($clinics.data.Count)" -ForegroundColor Cyan
    
    $services = Invoke-RestMethod -Uri "$BASE_URL/services" -Method GET -Headers $authHeaders
    Write-Host "  📋 Servicos: $($services.data.Count)" -ForegroundColor Cyan
    
    $dentists = Invoke-RestMethod -Uri "$BASE_URL/dentists" -Method GET -Headers $authHeaders
    Write-Host "  📋 Dentistas: $($dentists.data.Count)" -ForegroundColor Cyan
    
    $patients = Invoke-RestMethod -Uri "$BASE_URL/patients" -Method GET -Headers $authHeaders
    Write-Host "  📋 Pacientes: $($patients.data.Count)" -ForegroundColor Cyan
} catch {
    Write-Host "  ❌ Erro ao listar: $_" -ForegroundColor Red
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  TESTE CONCLUIDO!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Clinic ID: $clinicId" -ForegroundColor White
Write-Host "Token: $token" -ForegroundColor White
Write-Host ""
Write-Host "Para testar webhook da IA, configure a Z-API com:" -ForegroundColor Yellow
Write-Host "  Webhook URL: https://api-odonto.marciosager.com/api/v1/webhooks/z-api" -ForegroundColor White
Write-Host ""