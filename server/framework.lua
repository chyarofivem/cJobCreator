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

-- Debug logger
local function DebugLog(message)
    if Config.Debug then
        print('[hPoslovi DEBUG] ' .. message)
    end
end


-- Normalize GetPlayer
function Framework.GetPlayer(source)
    local src = tonumber(source)
    if not src then return nil end

    if Framework.Type == 'esx' then
        return ESX.GetPlayerFromId(src)
    elseif Framework.Type == 'qbx' then
        return exports.qbx_core:GetPlayer(src)
    elseif Framework.Type == 'qb' then
        return QBCore.Functions.GetPlayer(src)
    end
    return nil
end

-- Normalize SetPlayerJob
function Framework.SetPlayerJob(source, jobName, grade)
    local src = tonumber(source)
    if not src then return end

    if Framework.Type == 'esx' then
        local xPlayer = ESX.GetPlayerFromId(src)
        if xPlayer then
            xPlayer.setJob(jobName, grade)
        end
    elseif Framework.Type == 'qbx' then
        local Player = exports.qbx_core:GetPlayer(src)
        if Player then
            Player.Functions.SetJob(jobName, grade)
        end
    elseif Framework.Type == 'qb' then
        local Player = QBCore.Functions.GetPlayer(src)
        if Player then
            Player.Functions.SetJob(jobName, grade)
        end
    end
end

-- Notify function (server-side)
function Framework.Notify(source, msg)
    local src = tonumber(source)
    if not src then return end

    if Framework.Type == 'esx' then
        TriggerClientEvent('esx:showNotification', src, msg)
    elseif Framework.Type == 'qbx' then
        exports.qbx_core:Notify(src, msg)
    elseif Framework.Type == 'qb' then
        TriggerClientEvent('QBCore:Notify', src, msg)
    end
end

-- Permissions Check
function Framework.CheckPerms(source)
    local src = tonumber(source)
    if not src or src == 0 then return true end -- server console

    if Framework.Type == 'esx' then
        local xPlayer = ESX.GetPlayerFromId(src)
        if not xPlayer then return false end
        local group = xPlayer.getGroup()
        for _, v in ipairs(Config.AdminGroups) do
            if v == group then return true end
        end
    elseif Framework.Type == 'qbx' then
        for _, group in ipairs(Config.AdminGroups) do
            if exports.qbx_core:HasPermission(src, group) or exports.qbx_core:HasPermission(src, 'admin') or exports.qbx_core:HasPermission(src, 'god') then
                return true
            end
        end
    elseif Framework.Type == 'qb' then
        for _, group in ipairs(Config.AdminGroups) do
            if QBCore.Functions.HasPermission(src, group) or QBCore.Functions.HasPermission(src, 'admin') or QBCore.Functions.HasPermission(src, 'god') then
                return true
            end
        end
    end
    return false
end

-- Dynamic runtime Job creation/update
function Framework.CreateOrUpdateJob(jobName, jobLabel, grades, bossGrade)
    DebugLog("Registering job: " .. jobName .. " with framework: " .. Framework.Type)

    if Framework.Type == 'esx' then
        -- Delete existing grades from ESX native tables
        MySQL.Async.execute('DELETE FROM jobs WHERE name = @job', { ['@job'] = jobName })
        MySQL.Async.execute('DELETE FROM job_grades WHERE job_name = @job', { ['@job'] = jobName })
        
        -- Insert new ones
        for _, grade in pairs(grades) do 
            MySQL.insert('INSERT IGNORE INTO jobs (name, label) VALUES (?, ?)', { jobName, jobLabel })
            MySQL.prepare('INSERT INTO job_grades (job_name, grade, name, label, salary) VALUES (?, ?, ?, ?, ?)', {
                jobName, grade.grade, grade.name, grade.label, grade.salary
            })
        end
        
        Wait(500)
        ESX.RefreshJobs()
    elseif Framework.Type == 'qb' or Framework.Type == 'qbx' then
        -- Update JSON column in our jobs table
        local gradesJson = json.encode(grades)
        MySQL.query.await('UPDATE hposlovi_jobs SET job_grades = ? WHERE job_name = ?', { gradesJson, jobName })

        -- Format for QB/QBox
        local qbGrades = {}
        for _, grade in pairs(grades) do
            local isBossGrade = (tonumber(grade.grade) >= tonumber(bossGrade))
            local gradeIndex = tonumber(grade.grade) or 0

            if Framework.Type == 'qbx' then
                qbGrades[gradeIndex] = {
                    name = grade.label,
                    payment = tonumber(grade.salary) or 0,
                    isboss = isBossGrade
                }
            else -- standard qb-core
                qbGrades[tostring(gradeIndex)] = {
                    name = grade.label,
                    payment = tonumber(grade.salary) or 0,
                    isboss = isBossGrade
                }
            end
        end

        local jobConfig = {
            label = jobLabel,
            defaultDuty = true,
            offDutyPay = false,
            grades = qbGrades
        }

        if Framework.Type == 'qbx' then
            exports.qbx_core:CreateJob(jobName, jobConfig)
        else
            QBCore.Shared.Jobs[jobName] = jobConfig
            TriggerClientEvent('QBCore:Client:OnSharedUpdate', -1, 'Jobs', jobName, jobConfig)
        end
    end
end

-- Dynamic runtime Job deletion
function Framework.DeleteJob(jobName)
    DebugLog("Deleting job: " .. jobName .. " from framework: " .. Framework.Type)

    if Framework.Type == 'esx' then
        MySQL.Async.execute('DELETE FROM jobs WHERE name = @job', { ['@job'] = jobName })
        MySQL.Async.execute('DELETE FROM job_grades WHERE job_name = @job', { ['@job'] = jobName })
        Wait(500)
        ESX.RefreshJobs()
    elseif Framework.Type == 'qb' or Framework.Type == 'qbx' then
        if Framework.Type == 'qbx' then
            exports.qbx_core:RemoveJob(jobName)
        else
            QBCore.Shared.Jobs[jobName] = nil
            TriggerClientEvent('QBCore:Client:OnSharedUpdate', -1, 'Jobs', jobName, nil)
        end
    end
end

-- Startup initialization of existing jobs
function Framework.InitStartupJobs()
    if Framework.Type == 'qb' or Framework.Type == 'qbx' then
        DebugLog("Loading existing jobs into QB/QBox memory...")
        local jobs = MySQL.query.await('SELECT * FROM hposlovi_jobs', {})
        if jobs then
            for _, job in ipairs(jobs) do
                local qbGrades = {}
                local bossGrade = 4

                -- Load bossgrade from positions table
                local bossMenu = MySQL.single.await('SELECT extra_data FROM hposlovi_positions WHERE job_name = ? AND position_type = "bossmenu" LIMIT 1', {job.job_name})
                if bossMenu and bossMenu.extra_data then
                    local extra = json.decode(bossMenu.extra_data)
                    bossGrade = extra.boss_grade or 4
                end

                if job.job_grades and job.job_grades ~= "" then
                    local grades = json.decode(job.job_grades)
                    if grades then
                        for _, grade in pairs(grades) do
                            local isBossGrade = (tonumber(grade.grade) >= tonumber(bossGrade))
                            local gradeIndex = tonumber(grade.grade) or 0
                            if Framework.Type == 'qbx' then
                                qbGrades[gradeIndex] = {
                                    name = grade.label,
                                    payment = tonumber(grade.salary) or 0,
                                    isboss = isBossGrade
                                }
                            else
                                qbGrades[tostring(gradeIndex)] = {
                                    name = grade.label,
                                    payment = tonumber(grade.salary) or 0,
                                    isboss = isBossGrade
                                }
                            end
                        end
                    end
                end

                -- Fallback if no grades defined
                if not next(qbGrades) then
                    for _, grade in ipairs(Config.IfNotGrades) do
                        local isBossGrade = (tonumber(grade.grade) >= tonumber(bossGrade))
                        local gradeIndex = tonumber(grade.grade) or 0
                        if Framework.Type == 'qbx' then
                            qbGrades[gradeIndex] = {
                                name = grade.label,
                                payment = tonumber(grade.salary) or 0,
                                isboss = isBossGrade
                            }
                            else
                                qbGrades[tostring(gradeIndex)] = {
                                    name = grade.label,
                                    payment = tonumber(grade.salary) or 0,
                                    isboss = isBossGrade
                                }
                            end
                    end
                end

                local jobConfig = {
                    label = job.job_label,
                    defaultDuty = true,
                    offDutyPay = false,
                    grades = qbGrades
                }

                if Framework.Type == 'qbx' then
                    exports.qbx_core:CreateJob(job.job_name, jobConfig)
                else
                    QBCore.Shared.Jobs[job.job_name] = jobConfig
                end
                DebugLog("Dynamically loaded job into QB/QBox memory: " .. job.job_name)
            end
        end
    end
end
