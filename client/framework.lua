local FrameworkName = nil
ESX = nil
QBCore = nil

-- Detect the framework dynamically
if GetResourceState('es_extended') == 'started' then
    FrameworkName = 'esx'
    ESX = exports['es_extended']:getSharedObject()
elseif GetResourceState('qbx_core') == 'started' then
    FrameworkName = 'qbx'
elseif GetResourceState('qb-core') == 'started' then
    FrameworkName = 'qb'
    QBCore = exports['qb-core']:GetCoreObject()
end

Framework = {}
Framework.Type = FrameworkName
CurrentJob = nil
CurrentJob2 = nil

-- Debug logger
local function DebugLog(message)
    if Config.Debug then
        print('[hPoslovi DEBUG] ' .. message)
    end
end

-- Normalize GetPlayerData
function Framework.GetPlayerData()
    if Framework.Type == 'esx' then
        return ESX.GetPlayerData()
    elseif Framework.Type == 'qbx' then
        return exports.qbx_core:GetPlayerData()
    elseif Framework.Type == 'qb' then
        return QBCore.Functions.GetPlayerData()
    end
    return {}
end

-- Normalize GetPlayerJob (returns jobName, jobGrade)
function Framework.GetPlayerJob()
    local data = Framework.GetPlayerData()
    if Framework.Type == 'esx' then
        if data and data.job then
            return data.job.name, data.job.grade
        end
    elseif Framework.Type == 'qb' or Framework.Type == 'qbx' then
        if data and data.job then
            return data.job.name, data.job.grade.level
        end
    end
    return 'unemployed', 0
end

-- Notify function (framework independent)
function Framework.Notify(msg)
    if Framework.Type == 'esx' then
        ESX.ShowNotification(msg)
    elseif Framework.Type == 'qbx' then
        exports.qbx_core:Notify(msg)
    elseif Framework.Type == 'qb' then
        TriggerEvent('QBCore:Notify', msg)
    end
end

-- Text UI Show/Hide
function Framework.ShowTextUI(msg)
    lib.showTextUI('[E] - ' .. msg, {
        position = 'right-center',
        icon = 'circle',
        style = {
            borderRadius = 10,
            backgroundColor = 'rgba(0, 0, 0, 0.5)',
            color = '#ffffff',
        },
    })
end

function Framework.HideTextUI()
    lib.hideTextUI()
end

-- Boss menu opener
function Framework.OpenBossMenu(job)
    print("[cJobCreator DEBUG] Framework.OpenBossMenu called for job: " .. tostring(job))
    print("[cJobCreator DEBUG] Framework.Type: " .. tostring(Framework.Type))
    
    if Framework.Type == 'esx' then
        TriggerEvent('esx_society:openBossMenu', job, function(data, menu)
            menu.close()
        end, {
            wash = false
        })
    elseif GetResourceState('qbx_management') == 'started' then
        print("[cJobCreator DEBUG] Invoking qbx_management OpenBossMenu")
        pcall(function()
            local pData = exports.qbx_core:GetPlayerData()
            local jobInfo = pData.job
            print("[cJobCreator DEBUG] Player Job details:")
            print("  - Name: " .. tostring(jobInfo.name))
            print("  - Grade Level: " .. tostring(jobInfo.grade.level))
            print("  - Grade Name: " .. tostring(jobInfo.grade.name))
            print("  - IsBoss: " .. tostring(jobInfo.isboss))
            print("  - Payment: " .. tostring(jobInfo.payment))
            
            local qbxJob = exports.qbx_core:GetJob(jobInfo.name)
            if qbxJob then
                print("[cJobCreator DEBUG] Registered Job details in QBox:")
                print("  - Label: " .. tostring(qbxJob.label))
                print("  - Grades:")
                for gradeIdx, gradeData in pairs(qbxJob.grades) do
                    print("    - Grade " .. tostring(gradeIdx) .. " (" .. type(gradeIdx) .. "): Name = " .. tostring(gradeData.name) .. ", IsBoss = " .. tostring(gradeData.isboss) .. ", Payment = " .. tostring(gradeData.payment))
                end
            else
                print("[cJobCreator DEBUG] Job is not registered in QBox core!")
            end
        end)
        exports.qbx_management:OpenBossMenu('job')
    elseif GetResourceState('qb-bossmenu') == 'started' then
        print("[cJobCreator DEBUG] Triggering qb-bossmenu:client:OpenMenu")
        TriggerEvent('qb-bossmenu:client:OpenMenu')
    else
        print("[cJobCreator DEBUG] No boss menu resource (esx_society, qbx_management, or qb-bossmenu) is started!")
    end
end

-- Framework-agnostic Spawn Point Clear check
function Framework.IsSpawnPointClear(coords, radius)
    local vehicles = GetGamePool('CVehicle')
    local radiusSq = radius * radius
    for i = 1, #vehicles do
        local vehCoords = GetEntityCoords(vehicles[i])
        local distSq = #(coords - vehCoords)
        if distSq <= radiusSq then
            return false
        end
    end
    return true
end

-- Framework-agnostic Delete Vehicle helper
function Framework.DeleteVehicle(vehicle)
    if DoesEntityExist(vehicle) then
        SetEntityAsMissionEntity(vehicle, true, true)
        DeleteVehicle(vehicle)
        if DoesEntityExist(vehicle) then
            DeleteEntity(vehicle)
        end
    end
end

-- Framework-agnostic Give Keys helper
function Framework.GiveVehicleKeys(vehicle)
    if not DoesEntityExist(vehicle) then return end
    local plate = GetVehicleNumberPlateText(vehicle)
    
    if Framework.Type == 'qb' or Framework.Type == 'qbx' then
        -- Trigger client-side vehiclekeys owner event (supported by qb-vehiclekeys and qbx_vehiclekeys compatibility)
        TriggerEvent('vehiclekeys:client:SetOwner', plate)
    end
end

-- Startup/OnLoad initialization thread
CreateThread(function()
    if Framework.Type == 'esx' then
        while not ESX.IsPlayerLoaded() do
            Wait(10)
        end
        local pData = ESX.GetPlayerData()
        CurrentJob = pData.job
        CurrentJob2 = pData.job2 or { name = 'unemployed', grade = 0 }
    elseif Framework.Type == 'qb' or Framework.Type == 'qbx' then
        while not LocalPlayer.state.isLoggedIn do
            Wait(10)
        end
        local pData = Framework.GetPlayerData()
        if pData and pData.job then
            CurrentJob = { name = pData.job.name, grade = pData.job.grade.level }
        end
        if pData and pData.gang then
            CurrentJob2 = { name = pData.gang.name, grade = pData.gang.grade.level }
        else
            CurrentJob2 = { name = 'unemployed', grade = 0 }
        end
    end
end)

-- Event handlers for PlayerLoaded and JobUpdates
RegisterNetEvent('esx:playerLoaded', function(xPlayer)
    CurrentJob = xPlayer.job
    CurrentJob2 = xPlayer.job2 or { name = 'unemployed', grade = 0 }
    TriggerEvent('hPoslovi:client:refreshJobs')
end)

RegisterNetEvent('QBCore:Client:OnPlayerLoaded', function()
    local pData = Framework.GetPlayerData()
    if pData and pData.job then
        CurrentJob = { name = pData.job.name, grade = pData.job.grade.level }
    end
    if pData and pData.gang then
        CurrentJob2 = { name = pData.gang.name, grade = pData.gang.grade.level }
    else
        CurrentJob2 = { name = 'unemployed', grade = 0 }
    end
    TriggerEvent('hPoslovi:client:refreshJobs')
end)

RegisterNetEvent('qbx_core:client:onPlayerLoaded', function()
    local pData = Framework.GetPlayerData()
    if pData and pData.job then
        CurrentJob = { name = pData.job.name, grade = pData.job.grade.level }
    end
    if pData and pData.gang then
        CurrentJob2 = { name = pData.gang.name, grade = pData.gang.grade.level }
    else
        CurrentJob2 = { name = 'unemployed', grade = 0 }
    end
    TriggerEvent('hPoslovi:client:refreshJobs')
end)

RegisterNetEvent('esx:setJob', function(job)
    CurrentJob = job
end)

RegisterNetEvent('esx:setJob2', function(job)
    CurrentJob2 = job
end)

RegisterNetEvent('QBCore:Client:OnJobUpdate', function(job)
    CurrentJob = { name = job.name, grade = job.grade.level }
end)

RegisterNetEvent('QBCore:Client:OnGangUpdate', function(gang)
    CurrentJob2 = { name = gang.name, grade = gang.grade.level }
end)

RegisterNetEvent('qbx_core:client:onJobUpdate', function(jobName, job)
    if job then
        CurrentJob = { name = jobName, grade = job.grade }
    else
        CurrentJob = { name = 'unemployed', grade = 0 }
    end
end)

RegisterNetEvent('qbx_core:client:onGangUpdate', function(gangName, gang)
    if gang then
        CurrentJob2 = { name = gangName, grade = gang.grade }
    else
        CurrentJob2 = { name = 'unemployed', grade = 0 }
    end
end)
