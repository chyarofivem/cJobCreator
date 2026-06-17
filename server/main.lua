
-- ========================================
-- hPoslovi Server - V1.0 Release
-- ESX Society + Illenium Appearance Only
-- ========================================

lib.locale(Config.Locale)
lib.versionCheck('chyarofivem/cJobCreator')

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

    -- ============================================================
    -- SCHEMA BOOTSTRAP: Create tables if they don't exist yet
    -- ============================================================

    MySQL.query.await([[
        CREATE TABLE IF NOT EXISTS `hposlovi_jobs` (
            `id`          int(11)      NOT NULL AUTO_INCREMENT,
            `job_name`    varchar(50)  NOT NULL UNIQUE,
            `job_label`   varchar(100) NOT NULL,
            `created_at`  timestamp    DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (`id`),
            KEY `job_name` (`job_name`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    ]], {})

    MySQL.query.await([[
        CREATE TABLE IF NOT EXISTS `hposlovi_positions` (
            `id`            int(11)      NOT NULL AUTO_INCREMENT,
            `job_name`      varchar(50)  NOT NULL,
            `position_type` varchar(50)  NOT NULL,
            `position_id`   varchar(50)  DEFAULT NULL,
            `x`             float        NOT NULL,
            `y`             float        NOT NULL,
            `z`             float        NOT NULL,
            `heading`       float        DEFAULT NULL,
            `extra_data`    text         DEFAULT NULL,
            PRIMARY KEY (`id`),
            KEY `job_name` (`job_name`),
            CONSTRAINT `fk_positions_job` FOREIGN KEY (`job_name`)
                REFERENCES `hposlovi_jobs` (`job_name`) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    ]], {})

    MySQL.query.await([[
        CREATE TABLE IF NOT EXISTS `hposlovi_inventories` (
            `id`           int(11)      NOT NULL AUTO_INCREMENT,
            `job_name`     varchar(50)  NOT NULL,
            `inventory_id` varchar(50)  NOT NULL,
            `label`        varchar(100) NOT NULL,
            `slots`        int(11)      NOT NULL DEFAULT 50,
            `max_weight`   int(11)      NOT NULL DEFAULT 100000,
            `min_grade`    int(11)      DEFAULT 0,
            `x`            float        DEFAULT NULL,
            `y`            float        DEFAULT NULL,
            `z`            float        DEFAULT NULL,
            PRIMARY KEY (`id`),
            KEY `job_name` (`job_name`),
            CONSTRAINT `fk_inventories_job` FOREIGN KEY (`job_name`)
                REFERENCES `hposlovi_jobs` (`job_name`) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    ]], {})

    MySQL.query.await([[
        CREATE TABLE IF NOT EXISTS `hposlovi_vehicles` (
            `id`           int(11)      NOT NULL AUTO_INCREMENT,
            `job_name`     varchar(50)  NOT NULL,
            `label`        varchar(100) NOT NULL,
            `model`        varchar(50)  NOT NULL,
            `color_r`      int(11)      DEFAULT 255,
            `color_g`      int(11)      DEFAULT 255,
            `color_b`      int(11)      DEFAULT 255,
            `plate`        varchar(20)  DEFAULT NULL,
            `fullkit`      tinyint(1)   DEFAULT 0,
            `min_grade`    int(11)      DEFAULT 0,
            `vehicle_type` varchar(10)  NOT NULL DEFAULT 'car',
            PRIMARY KEY (`id`),
            KEY `job_name` (`job_name`),
            CONSTRAINT `fk_vehicles_job` FOREIGN KEY (`job_name`)
                REFERENCES `hposlovi_jobs` (`job_name`) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    ]], {})

    MySQL.query.await([[
        CREATE TABLE IF NOT EXISTS `hposlovi_outfits` (
            `id`          int(11)      NOT NULL AUTO_INCREMENT,
            `job_name`    varchar(50)  NOT NULL,
            `outfit_name` varchar(100) NOT NULL,
            `outfit_data` longtext     NOT NULL,
            `created_at`  timestamp    DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (`id`),
            UNIQUE KEY `unique_outfit` (`job_name`, `outfit_name`),
            KEY `job_name` (`job_name`),
            CONSTRAINT `fk_outfits_job` FOREIGN KEY (`job_name`)
                REFERENCES `hposlovi_jobs` (`job_name`) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    ]], {})

    -- ============================================================
    -- SCHEMA MIGRATION: Ensure position_type is varchar(50).
    -- If the column was created as an ENUM (or too-small varchar)
    -- this widens it so helipad_retrieve / helipad_spawn fit.
    -- ============================================================
    MySQL.query.await([[
        ALTER TABLE `hposlovi_positions`
        MODIFY COLUMN `position_type` varchar(50) NOT NULL
    ]], {})

    -- Add vehicle_type to existing installations (silently ignored if already present)
    pcall(function()
        MySQL.query.await([[
            ALTER TABLE `hposlovi_vehicles`
            ADD COLUMN `vehicle_type` varchar(10) NOT NULL DEFAULT 'car'
        ]], {})
    end)

    print('[hPoslovi] Schema bootstrap complete.')

    -- ============================================================
    -- RUNTIME INIT: Load inventories & outfits into memory
    -- ============================================================
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

-- Get garage_retrieve position for a job (used by /baza client command)
lib.callback.register('hPoslovi:server:getGarageRetrievePos', function(source, jobName)
    local pos = MySQL.single.await(
        'SELECT x, y, z FROM hposlovi_positions WHERE job_name = ? AND position_type = "garage_retrieve" LIMIT 1',
        { jobName }
    )
    if pos and pos.x and pos.y then
        return pos
    end
    return nil
end)

-- Get helipad_retrieve position for a job (used by /helipad client command)
lib.callback.register('hPoslovi:server:getHelipadRetrievePos', function(source, jobName)
    local pos = MySQL.single.await(
        'SELECT x, y, z FROM hposlovi_positions WHERE job_name = ? AND position_type = "helipad_retrieve" LIMIT 1',
        { jobName }
    )
    if pos and pos.x and pos.y then
        return pos
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
    
    -- Helipad positions
    if jobData.helipad then
        if jobData.helipad.pos1 then
            MySQL.insert.await('INSERT INTO hposlovi_positions (job_name, position_type, x, y, z) VALUES (?, ?, ?, ?, ?)', {
                jobData.job, 'helipad_retrieve', jobData.helipad.pos1.x, jobData.helipad.pos1.y, jobData.helipad.pos1.z
            })
        end
        if jobData.helipad.pos2 then
            MySQL.insert.await('INSERT INTO hposlovi_positions (job_name, position_type, x, y, z, heading) VALUES (?, ?, ?, ?, ?, ?)', {
                jobData.job, 'helipad_spawn', jobData.helipad.pos2.x, jobData.helipad.pos2.y, jobData.helipad.pos2.z, jobData.helipad.heading or 0.0
            })
        end
    end
    
    -- Delete old inventories and save new ones
    MySQL.query.await('DELETE FROM hposlovi_inventories WHERE job_name = ?', {jobData.job})
    
    if jobData.inv then
        for idx, inv in ipairs(jobData.inv) do
            if inv.label and inv.slots and inv.peso then
                -- Save x/y/z position directly on the inventory row
                local invX = inv.pos and inv.pos.x or nil
                local invY = inv.pos and inv.pos.y or nil
                local invZ = inv.pos and inv.pos.z or nil
                
                MySQL.insert.await('INSERT INTO hposlovi_inventories (job_name, inventory_id, label, slots, max_weight, min_grade, x, y, z) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', {
                    jobData.job, tostring(idx), inv.label, tonumber(inv.slots), tonumber(inv.peso), tonumber(inv.grado) or 0,
                    invX, invY, invZ
                })
                
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
        -- Initialize with explicit null fields so json.encode produces {} objects, not [] arrays
        local jobData = {
            job = job.job_name,
            label = job.job_label,
            bossmenu = { pos = false, gradoboss = 4 },  -- false encodes as null in JSON but keeps it an object
            garage   = { pos1 = false, pos2 = false, heading = 0.0 },
            helipad  = { pos1 = false, pos2 = false, heading = 0.0 },
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
                    jobData.bossmenu.gradoboss = extra.boss_grade or 4
                end
            elseif pos.position_type == 'wardrobe' then
                jobData.camerino = {x = pos.x, y = pos.y, z = pos.z}
            elseif pos.position_type == 'garage_retrieve' then
                jobData.garage.pos1 = {x = pos.x, y = pos.y, z = pos.z}
            elseif pos.position_type == 'garage_spawn' then
                jobData.garage.pos2 = {x = pos.x, y = pos.y, z = pos.z}
                jobData.garage.heading = pos.heading or 0.0
            elseif pos.position_type == 'helipad_retrieve' then
                jobData.helipad.pos1 = {x = pos.x, y = pos.y, z = pos.z}
            elseif pos.position_type == 'helipad_spawn' then
                jobData.helipad.pos2 = {x = pos.x, y = pos.y, z = pos.z}
                jobData.helipad.heading = pos.heading or 0.0
            elseif pos.position_type == 'inventory' and pos.extra_data then
                local extra = json.decode(pos.extra_data)
                local invIdx = tonumber(pos.position_id) or #jobData.inv + 1
                if not jobData.inv[invIdx] then
                    jobData.inv[invIdx] = {}
                end
                jobData.inv[invIdx].pos = {x = pos.x, y = pos.y, z = pos.z}
            end
        end
        
        -- Get inventories (position stored directly as x/y/z on the inventory row)
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
            -- Read position directly from inventory row
            if inv.x and inv.y and inv.z then
                jobData.inv[invIdx].pos = {x = inv.x, y = inv.y, z = inv.z}
            end
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

lib.callback.register('hPoslovi:server:getJobVehicles', function(source, jobName, vehicleType)
    vehicleType = vehicleType or 'car'
    local vehicles = MySQL.query.await('SELECT * FROM hposlovi_vehicles WHERE job_name = ? AND vehicle_type = ?', {jobName, vehicleType})
    return vehicles or {}
end)

RegisterNetEvent('hPoslovi:server:addVehicle', function(jobName, vehicleData)
    local xPlayer = ESX.GetPlayerFromId(source)
    if not CheckPerms(source) then return end
    
    local result = MySQL.insert.await('INSERT INTO hposlovi_vehicles (job_name, label, model, color_r, color_g, color_b, plate, fullkit, min_grade, vehicle_type) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', {
        jobName,
        vehicleData.label,
        vehicleData.model,
        vehicleData.color_r or 255,
        vehicleData.color_g or 255,
        vehicleData.color_b or 255,
        vehicleData.plate,
        vehicleData.fullkit and 1 or 0,
        vehicleData.min_grade or 0,
        vehicleData.vehicle_type or 'car'
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


