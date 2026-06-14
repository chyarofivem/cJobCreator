-- ========================================
-- hPoslovi Server - V1.0 Release
-- ESX Society + Illenium Appearance Only
-- ========================================

lib.locale(Config.Locale)

local jobOutfits = {}


-- Helper function for debug logging
local function DebugLog(message)
    if Config.Debug then
        print('[hPoslovi DEBUG] ' .. message)
    end
end

-- ========================================
-- INITIALIZATION
-- ========================================

CreateThread(function()
    Wait(1000)
    
    DebugLog('Loading jobs from database...')
    local jobs = MySQL.query.await('SELECT * FROM hposlovi_jobs', {})
    
    if jobs then
        for _, job in ipairs(jobs) do
            DebugLog('Loading inventories for: ' .. job.job_name)
            
            -- Register inventories
            local inventories = MySQL.query.await('SELECT * FROM hposlovi_inventories WHERE job_name = ?', {job.job_name})
            if inventories then
                for _, inv in ipairs(inventories) do
                    exports.ox_inventory:RegisterStash(job.job_name .. inv.inventory_id, inv.label, tonumber(inv.slots), inv.max_weight, false)
                    DebugLog('Registered stash: ' .. job.job_name .. inv.inventory_id)
                end
            end
            
            -- Load outfits into memory
            jobOutfits[job.job_name] = {}
            local outfits = MySQL.query.await('SELECT * FROM hposlovi_outfits WHERE job_name = ?', {job.job_name})
            if outfits then
                for _, outfit in ipairs(outfits) do
                    jobOutfits[job.job_name][outfit.outfit_name] = json.decode(outfit.outfit_data)
                end
                DebugLog('Loaded ' .. #outfits .. ' outfits for ' .. job.job_name)
            end
        end
    end
    
    print('[hPoslovi] Database initialization complete!')
end)

-- ========================================
-- OUTFIT SYSTEM
-- ========================================

-- Get boss grade for a job
lib.callback.register('hPoslovi:server:getBossGrade', function(source, jobName)
    local bossMenu = MySQL.single.await('SELECT extra_data FROM hposlovi_positions WHERE job_name = ? AND position_type = "bossmenu" LIMIT 1', {jobName})
    if bossMenu and bossMenu.extra_data then
        local extra = json.decode(bossMenu.extra_data)
        return extra.boss_grade or 0
    end
    return nil
end)

-- Save outfit for job (sboss grade or higher only)
RegisterNetEvent('hPoslovi:server:saveJobOutfit', function(jobName, outfitName, outfitData)
    local xPlayer = ESX.GetPlayerFromId(source)
    if not xPlayer then return end
    
    if xPlayer.job.name ~= jobName then
        xPlayer.showNotification(locale('not_part_of_job'))
        return
    end
    
    -- Get boss grade from positions
    local bossMenu = MySQL.single.await('SELECT extra_data FROM hposlovi_positions WHERE job_name = ? AND position_type = "bossmenu" LIMIT 1', {jobName})
    local bossGrade = bossMenu and json.decode(bossMenu.extra_data).boss_grade or 0
    
    -- Check if player has sufficient grade (>= boss grade)
    if xPlayer.job.grade < bossGrade then
        xPlayer.showNotification(locale('need_grade_save_outfit', bossGrade))
        return
    end
    
    -- Save to database
    local encoded = json.encode(outfitData)
    MySQL.query.await('INSERT INTO hposlovi_outfits (job_name, outfit_name, outfit_data) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE outfit_data = ?', {
        jobName, outfitName, encoded, encoded
    })
    
    -- Update memory
    if not jobOutfits[jobName] then
        jobOutfits[jobName] = {}
    end
    jobOutfits[jobName][outfitName] = outfitData
    
    xPlayer.showNotification(locale('outfit_saved_success', outfitName))
    DebugLog('Outfit saved: ' .. outfitName .. ' for ' .. jobName)
end)

-- Get available outfits for job (everyone can view)
lib.callback.register('hPoslovi:server:getJobOutfits', function(source, jobName)
    local xPlayer = ESX.GetPlayerFromId(source)
    if not xPlayer then return {} end
    
    if xPlayer.job.name ~= jobName then
        return {}
    end
    
    return jobOutfits[jobName] or {}
end)

-- Delete outfit for job (sboss grade or higher only)
RegisterNetEvent('hPoslovi:server:deleteJobOutfit', function(jobName, outfitName)
    local xPlayer = ESX.GetPlayerFromId(source)
    if not xPlayer then return end
    
    if xPlayer.job.name ~= jobName then
        xPlayer.showNotification(locale('not_part_of_job'))
        return
    end
    
    -- Get boss grade
    local bossMenu = MySQL.single.await('SELECT extra_data FROM hposlovi_positions WHERE job_name = ? AND position_type = "bossmenu" LIMIT 1', {jobName})
    local bossGrade = bossMenu and json.decode(bossMenu.extra_data).boss_grade or 0
    
    -- Check if player has sufficient grade (>= boss grade)
    if xPlayer.job.grade < bossGrade then
        xPlayer.showNotification(locale('need_grade_delete_outfit', bossGrade))
        return
    end
    
    -- Delete from database
    MySQL.query.await('DELETE FROM hposlovi_outfits WHERE job_name = ? AND outfit_name = ?', {jobName, outfitName})
    
    -- Update memory
    if jobOutfits[jobName] and jobOutfits[jobName][outfitName] then
        jobOutfits[jobName][outfitName] = nil
        xPlayer.showNotification(locale('outfit_deleted_success', outfitName))
        DebugLog('Outfit deleted: ' .. outfitName .. ' from ' .. jobName)
    end
end)

-- ========================================
-- JOB CREATION & MODIFICATION
-- ========================================

RegisterNetEvent('hPoslovi:server:createOrUpdateJob', function(jobData, isModifying)
    local xPlayer = ESX.GetPlayerFromId(source)
    if not CheckPerms(source) then return end
    
    DebugLog((isModifying and 'Updating' or 'Creating') .. ' job: ' .. jobData.job)
    
    -- Create/update job in ESX
    MySQL.Async.execute('DELETE FROM jobs WHERE name = @job', { ['@job'] = jobData.job })
    MySQL.Async.execute('DELETE FROM job_grades WHERE job_name = @job', { ['@job'] = jobData.job })
    
    for _, grade in pairs(jobData.gradi) do 
        MySQL.insert('INSERT IGNORE INTO jobs (name, label) VALUES (?, ?)', { jobData.job, jobData.label })
        MySQL.prepare('INSERT INTO job_grades (job_name, grade, name, label, salary) VALUES (?, ?, ?, ?, ?)', {
            jobData.job, grade.grade, grade.name, grade.label, grade.salary
        })
    end
    
    Wait(500)
    
    -- REFRESH JOBS AFTER CREATION/MODIFICATION
    ESX.RefreshJobs()
    DebugLog('Jobs refreshed after ' .. (isModifying and 'update' or 'creation'))
    
    if Config.AutoSetJob then
        xPlayer.setJob(jobData.job, 0)
    end
    
    -- Save to hPoslovi database
    if isModifying then
        MySQL.query.await('UPDATE hposlovi_jobs SET job_label = ? WHERE job_name = ?', {jobData.label, jobData.job})
    else
        MySQL.insert.await('INSERT INTO hposlovi_jobs (job_name, job_label) VALUES (?, ?)', {jobData.job, jobData.label})
    end
    
    -- Delete old positions and save new ones
    MySQL.query.await('DELETE FROM hposlovi_positions WHERE job_name = ?', {jobData.job})
    
    -- Boss menu position
    if jobData.bossmenu and jobData.bossmenu.pos then
        local extra = json.encode({boss_grade = jobData.bossmenu.gradoboss})
        MySQL.insert.await('INSERT INTO hposlovi_positions (job_name, position_type, x, y, z, extra_data) VALUES (?, ?, ?, ?, ?, ?)', {
            jobData.job, 'bossmenu', jobData.bossmenu.pos.x, jobData.bossmenu.pos.y, jobData.bossmenu.pos.z, extra
        })
    end
    
    -- Wardrobe position
    if jobData.camerino then
        MySQL.insert.await('INSERT INTO hposlovi_positions (job_name, position_type, x, y, z) VALUES (?, ?, ?, ?, ?)', {
            jobData.job, 'wardrobe', jobData.camerino.x, jobData.camerino.y, jobData.camerino.z
        })
    end
    
    -- Garage positions
    if jobData.garage then
        if jobData.garage.pos1 then
            MySQL.insert.await('INSERT INTO hposlovi_positions (job_name, position_type, x, y, z) VALUES (?, ?, ?, ?, ?)', {
                jobData.job, 'garage_retrieve', jobData.garage.pos1.x, jobData.garage.pos1.y, jobData.garage.pos1.z
            })
        end
        if jobData.garage.pos2 then
            MySQL.insert.await('INSERT INTO hposlovi_positions (job_name, position_type, x, y, z, heading) VALUES (?, ?, ?, ?, ?, ?)', {
                jobData.job, 'garage_spawn', jobData.garage.pos2.x, jobData.garage.pos2.y, jobData.garage.pos2.z, jobData.garage.heading or 0.0
            })
        end
    end
    
    -- Delete old inventories and save new ones
    MySQL.query.await('DELETE FROM hposlovi_inventories WHERE job_name = ?', {jobData.job})
    
    if jobData.inv then
        for idx, inv in ipairs(jobData.inv) do
            if inv.label and inv.slots and inv.peso then
                MySQL.insert.await('INSERT INTO hposlovi_inventories (job_name, inventory_id, label, slots, max_weight, min_grade) VALUES (?, ?, ?, ?, ?, ?)', {
                    jobData.job, tostring(idx), inv.label, tonumber(inv.slots), tonumber(inv.peso), tonumber(inv.grado) or 0
                })
                
                if inv.pos then
                    local extra = json.encode({inventory_id = tostring(idx)})
                    MySQL.insert.await('INSERT INTO hposlovi_positions (job_name, position_type, position_id, x, y, z, extra_data) VALUES (?, ?, ?, ?, ?, ?, ?)', {
                        jobData.job, 'inventory', tostring(idx), inv.pos.x, inv.pos.y, inv.pos.z, extra
                    })
                end
                
                exports.ox_inventory:RegisterStash(jobData.job .. tostring(idx), inv.label, tonumber(inv.slots), tonumber(inv.peso), false)
                DebugLog('Registered inventory: ' .. jobData.job .. tostring(idx))
            end
        end
    end
    
    xPlayer.showNotification(isModifying and locale('job_updated_success') or locale('job_created_success'))
    
    -- REFRESH MARKERS ON ALL CLIENTS
    TriggerClientEvent('hPoslovi:client:refreshJobs', -1)
    DebugLog('Markers refreshed on all clients')
end)

-- Delete job
RegisterNetEvent('hPoslovi:server:deleteJob', function(jobName)
    local xPlayer = ESX.GetPlayerFromId(source)
    if not CheckPerms(source) then return end
    
    -- Delete from ESX
    MySQL.Async.execute('DELETE FROM jobs WHERE name = @job', { ['@job'] = jobName })
    MySQL.Async.execute('DELETE FROM job_grades WHERE job_name = @job', { ['@job'] = jobName })
    
    -- Delete from hPoslovi database
    MySQL.query.await('DELETE FROM hposlovi_jobs WHERE job_name = ?', {jobName})
    MySQL.query.await('DELETE FROM hposlovi_positions WHERE job_name = ?', {jobName})
    MySQL.query.await('DELETE FROM hposlovi_inventories WHERE job_name = ?', {jobName})
    MySQL.query.await('DELETE FROM hposlovi_vehicles WHERE job_name = ?', {jobName})
    MySQL.query.await('DELETE FROM hposlovi_outfits WHERE job_name = ?', {jobName})
    
    -- Refresh jobs
    Wait(500)
    ESX.RefreshJobs()
    
    -- Clear outfit storage
    jobOutfits[jobName] = nil
    
    DebugLog('Job deleted: ' .. jobName)
    xPlayer.showNotification(locale('job_deleted_success'))
    TriggerClientEvent('hPoslovi:client:refreshJobs', -1)
end)

-- ========================================
-- GET JOB DATA
-- ========================================

lib.callback.register('hPoslovi:server:getAllJobs', function(source)
    local jobs = MySQL.query.await('SELECT * FROM hposlovi_jobs', {})
    local jobsData = {}
    
    for _, job in ipairs(jobs) do
        local jobData = {
            job = job.job_name,
            label = job.job_label,
            bossmenu = {},
            garage = {},
            inv = {},
            gradi = {}
        }
        
        -- Get positions
        local positions = MySQL.query.await('SELECT * FROM hposlovi_positions WHERE job_name = ?', {job.job_name})
        for _, pos in ipairs(positions) do
            if pos.position_type == 'bossmenu' then
                jobData.bossmenu.pos = {x = pos.x, y = pos.y, z = pos.z}
                if pos.extra_data then
                    local extra = json.decode(pos.extra_data)
                    jobData.bossmenu.gradoboss = extra.boss_grade
                end
            elseif pos.position_type == 'wardrobe' then
                jobData.camerino = {x = pos.x, y = pos.y, z = pos.z}
            elseif pos.position_type == 'garage_retrieve' then
                jobData.garage.pos1 = {x = pos.x, y = pos.y, z = pos.z}
            elseif pos.position_type == 'garage_spawn' then
                jobData.garage.pos2 = {x = pos.x, y = pos.y, z = pos.z}
                jobData.garage.heading = pos.heading
            elseif pos.position_type == 'inventory' and pos.extra_data then
                local extra = json.decode(pos.extra_data)
                local invIdx = tonumber(pos.position_id) or #jobData.inv + 1
                if not jobData.inv[invIdx] then
                    jobData.inv[invIdx] = {}
                end
                jobData.inv[invIdx].pos = {x = pos.x, y = pos.y, z = pos.z}
            end
        end
        
        -- Get inventories
        local inventories = MySQL.query.await('SELECT * FROM hposlovi_inventories WHERE job_name = ?', {job.job_name})
        for _, inv in ipairs(inventories) do
            local invIdx = tonumber(inv.inventory_id) or #jobData.inv + 1
            if not jobData.inv[invIdx] then
                jobData.inv[invIdx] = {}
            end
            jobData.inv[invIdx].label = inv.label
            jobData.inv[invIdx].nomedeposito = inv.label
            jobData.inv[invIdx].slots = inv.slots
            jobData.inv[invIdx].peso = inv.max_weight
            jobData.inv[invIdx].grado = inv.min_grade
        end
        
        -- Get grades from ESX
        local grades = MySQL.query.await('SELECT * FROM job_grades WHERE job_name = ? ORDER BY grade ASC', {job.job_name})
        for _, grade in ipairs(grades) do
            table.insert(jobData.gradi, {
                grade = grade.grade,
                name = grade.name,
                label = grade.label,
                salary = grade.salary
            })
        end
        
        table.insert(jobsData, jobData)
    end
    
    return jobsData
end)

-- ========================================
-- VEHICLE SYSTEM
-- ========================================

lib.callback.register('hPoslovi:server:getJobVehicles', function(source, jobName)
    local vehicles = MySQL.query.await('SELECT * FROM hposlovi_vehicles WHERE job_name = ?', {jobName})
    return vehicles or {}
end)

RegisterNetEvent('hPoslovi:server:addVehicle', function(jobName, vehicleData)
    local xPlayer = ESX.GetPlayerFromId(source)
    if not CheckPerms(source) then return end
    
    local result = MySQL.insert.await('INSERT INTO hposlovi_vehicles (job_name, label, model, color_r, color_g, color_b, plate, fullkit, min_grade) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', {
        jobName,
        vehicleData.label,
        vehicleData.model,
        vehicleData.color_r or 255,
        vehicleData.color_g or 255,
        vehicleData.color_b or 255,
        vehicleData.plate,
        vehicleData.fullkit and 1 or 0,
        vehicleData.min_grade or 0
    })
    
    if result then
        DebugLog('Vehicle added: ' .. vehicleData.label .. ' for ' .. jobName)
        xPlayer.showNotification(locale('vehaddedsuccessfully'))
        TriggerClientEvent('hPoslovi:client:refreshVehicles', -1, jobName)
    else
        xPlayer.showNotification(locale('failed_add_veh'))
    end
end)

RegisterNetEvent('hPoslovi:server:deleteVehicle', function(vehicleId, jobName)
    local xPlayer = ESX.GetPlayerFromId(source)
    if not CheckPerms(source) then return end
    
    local result = MySQL.query.await('DELETE FROM hposlovi_vehicles WHERE id = ?', {vehicleId})
    
    if result then
        DebugLog('Vehicle deleted: ID ' .. vehicleId)
        xPlayer.showNotification(locale('veh_deleted_success'))
        TriggerClientEvent('hPoslovi:client:refreshVehicles', -1, jobName)
    else
        xPlayer.showNotification(locale('failed_delete_veh'))
    end
end)

-- ========================================
-- HELPER FUNCTIONS
-- ========================================

CheckPerms = function(source)
    local xPlayer = ESX.GetPlayerFromId(source)
    for k,v in pairs(Config.AdminGroups) do 
        if v == xPlayer.getGroup() then 
            return true
        end
    end
    xPlayer.showNotification(locale('noperms'))
    return false
end

-- ========================================
-- COMMANDS
-- ========================================

RegisterCommand(Config.EditCommand, function(source)
    if CheckPerms(source) then
        TriggerClientEvent("hPoslovi:client:openEditMenu", source)
    end
end)

RegisterCommand(Config.CreateCommand, function(source)
    if CheckPerms(source) then
        TriggerClientEvent("hPoslovi:client:openCreateMenu", source)
    end
end)
