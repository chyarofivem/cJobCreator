lib.locale(Config.Locale)

-- Helper function for debug logging
local function DebugLog(message)
    if Config.Debug then
        print('[hPoslovi DEBUG] ' .. message)
    end
end

local old = nil
local datafaz = {} 
local isModifying = false 
local AllJobsData = nil

exports('HasBossMenu', function(jobName)
    if not AllJobsData then return false end
    for _, v in pairs(AllJobsData) do
        if v.job == jobName and v.bossmenu and v.bossmenu.pos then
            return true
        end
    end
    return false
end)

-- HELPER: Hex to RGB Converter
local function HexToRGB(hex)
    hex = hex:gsub("#", "")
    return {
        r = tonumber("0x"..hex:sub(1,2)) or 255,
        g = tonumber("0x"..hex:sub(3,4)) or 255,
        b = tonumber("0x"..hex:sub(5,6)) or 255
    }
end

-- HELPER: Check Permissions
local function CanAccessGroup(myGrade, requiredGrade)
    if not requiredGrade then return true end
    return myGrade >= (tonumber(requiredGrade) or 0)
end

-- HELPER: Get Locales Table for NUI Translation
local function GetLocalesTable()
    local fileContent = LoadResourceFile(GetCurrentResourceName(), 'locales/' .. Config.Locale .. '.json')
    if fileContent then
        local decoded = json.decode(fileContent)
        if decoded then
            return decoded
        end
    end
    return {}
end

-- WARDROBE FUNCTION - REDESIGNED WITH ILLENIUM APPEARANCE & NUI
function OpenWardrobe(job)
    local jobName, jobGrade = Framework.GetPlayerJob()
    
    -- Get boss grade for this job from database via callback
    lib.callback('hPoslovi:server:getBossGrade', false, function(bossGrade)
        local canManageOutfits = bossGrade and jobGrade >= bossGrade
        
        -- Get outfits
        lib.callback('hPoslovi:server:getJobOutfits', false, function(outfits)
            SetNuiFocus(true, true)
            SendNUIMessage({
                action = 'open',
                mode = 'wardrobe',
                job = job,
                canManage = canManageOutfits,
                outfits = outfits,
                locales = GetLocalesTable()
            })
        end, job)
    end, job)
end

-- GARAGE FUNCTION (Player Usage) - NUI VERSION
function OpenGarage(data, job)
    local jobData = nil
    for k,v in pairs(data) do
        if v.job == job then 
            jobData = v 
            break 
        end
    end

    if not jobData then 
        Framework.Notify(locale('job_data_not_found'))
        return 
    end

    -- Ensure garage structure exists
    if not jobData.garage then
        Framework.Notify(locale('garage_not_configured'))
        return
    end

    -- Load car vehicles from database (car type only)
    lib.callback('hPoslovi:server:getJobVehicles', false, function(vehicles)
        local jobName, jobGrade = Framework.GetPlayerJob()
        local availableVehicles = {}
        
        if vehicles and #vehicles > 0 then
            for idx, vehicle in ipairs(vehicles) do
                if jobGrade >= (tonumber(vehicle.min_grade) or 0) then
                    table.insert(availableVehicles, vehicle)
                end
            end
        end

        SetNuiFocus(true, true)
        SendNUIMessage({
            action = 'open',
            mode = 'garage',
            vehicles = availableVehicles,
            job = job,
            locales = GetLocalesTable()
        })
    end, job, 'car')
end

-- SPAWN VEHICLE FUNCTION - DATABASE VERSION
function SpawnJobVehicle(vehicleData, garageData)
    local jobName, jobGrade = Framework.GetPlayerJob()
    
    -- Support both old format (args) and new database format
    local args = vehicleData.args or vehicleData
    local gradoJob = tonumber(args.grado or args.min_grade) or 0
    
    -- Grade Check
    if jobGrade < gradoJob then
        Framework.Notify(locale('gradobasso'))
        return
    end

    -- Validate spawn point
    if not garageData.pos2 then 
        Framework.Notify(locale('garage_spawn_not_set')) 
        return 
    end

    local spawnCoords = vector3(garageData.pos2.x, garageData.pos2.y, garageData.pos2.z)
    local heading = garageData.heading or 0.0

    -- Check if spawn point is clear
    if not Framework.IsSpawnPointClear(spawnCoords, 3.0) then
        Framework.Notify(locale('placeoccupat'))
        return
    end

    -- Model validation
    local model = args.model or vehicleData.model
    local modelHash = type(model) == 'string' and joaat(model) or model
    
    if not IsModelInCdimage(modelHash) then 
        Framework.Notify(locale('invalid_model_msg', tostring(model))) 
        return 
    end

    if not IsModelAVehicle(modelHash) then
        Framework.Notify(locale('model_not_vehicle', tostring(model)))
        return
    end

    -- Load model
    RequestModel(modelHash)
    local timeout = 0
    while not HasModelLoaded(modelHash) and timeout < 5000 do 
        Wait(10) 
        timeout = timeout + 10
    end

    if not HasModelLoaded(modelHash) then
        Framework.Notify(locale('failed_load_veh'))
        return
    end

    -- Create vehicle
    local vehicle = CreateVehicle(modelHash, spawnCoords.x, spawnCoords.y, spawnCoords.z, heading, true, false)
    
    if not DoesEntityExist(vehicle) then
        Framework.Notify(locale('failed_create_veh'))
        SetModelAsNoLongerNeeded(modelHash)
        return
    end

    -- Wait for vehicle to be fully created
    local vehicleTimeout = 0
    while not DoesEntityExist(vehicle) and vehicleTimeout < 2000 do
        Wait(10)
        vehicleTimeout = vehicleTimeout + 10
    end

    -- Essential Network & Entity setup
    SetEntityAsMissionEntity(vehicle, true, true)
    SetVehicleHasBeenOwnedByPlayer(vehicle, true)
    SetVehicleNeedsToBeHotwired(vehicle, false)
    SetVehRadioStation(vehicle, 'OFF')
    
    -- Handle Color (Supports database format color_r/g/b and old colore format)
    local r, g, b = nil, nil, nil
    if vehicleData.color_r and vehicleData.color_g and vehicleData.color_b then
        r = tonumber(vehicleData.color_r)
        g = tonumber(vehicleData.color_g)
        b = tonumber(vehicleData.color_b)
    elseif args and args.colore then
        r = tonumber(args.colore.r or args.colore.x)
        g = tonumber(args.colore.g or args.colore.y)
        b = tonumber(args.colore.b or args.colore.z)
    end

    if r and g and b then
        SetVehicleColours(vehicle, 0, 0)
        SetVehicleCustomPrimaryColour(vehicle, r, g, b)
        SetVehicleCustomSecondaryColour(vehicle, r, g, b)
    end

    -- Handle Plate (supports both formats)
    local plate = vehicleData.plate or args.targa
    if plate and plate ~= "" then
        SetVehicleNumberPlateText(vehicle, tostring(plate))
    end

    -- Handle Mods (supports both formats)
    local fullkit = vehicleData.fullkit == 1 or args.fullkit
    if fullkit then
        SetVehicleModKit(vehicle, 0)
        SetVehicleMod(vehicle, 11, 3, false) -- Engine
        SetVehicleMod(vehicle, 12, 2, false) -- Brakes
        SetVehicleMod(vehicle, 13, 2, false) -- Transmission
        SetVehicleMod(vehicle, 15, 3, false) -- Suspension
        ToggleVehicleMod(vehicle, 18, true) -- Turbo
        ToggleVehicleMod(vehicle, 22, true) -- Xenon
    end

    -- Clean up model
    SetModelAsNoLongerNeeded(modelHash)

    -- Put player in vehicle
    TaskWarpPedIntoVehicle(PlayerPedId(), vehicle, -1)
    Framework.GiveVehicleKeys(vehicle)
    Framework.Notify(locale('vehspawned'))
end

-- HELIPAD GARAGE FUNCTION (Player Usage) - NUI VERSION
function OpenHelipad(data, job)
    local jobData = nil
    for k,v in pairs(data) do
        if v.job == job then 
            jobData = v 
            break 
        end
    end

    if not jobData then 
        Framework.Notify(locale('job_data_not_found'))
        return 
    end

    -- Ensure helipad structure exists
    if not jobData.helipad then
        Framework.Notify(locale('helipad_not_configured'))
        return
    end

    -- Load helicopter vehicles from database (heli type only)
    lib.callback('hPoslovi:server:getJobVehicles', false, function(vehicles)
        local jobName, jobGrade = Framework.GetPlayerJob()
        local availableVehicles = {}
        
        if vehicles and #vehicles > 0 then
            for idx, vehicle in ipairs(vehicles) do
                if jobGrade >= (tonumber(vehicle.min_grade) or 0) then
                    table.insert(availableVehicles, vehicle)
                end
            end
        end

        SetNuiFocus(true, true)
        SendNUIMessage({
            action = 'open',
            mode = 'helipad',
            vehicles = availableVehicles,
            job = job,
            locales = GetLocalesTable()
        })
    end, job, 'heli')
end

-- SPAWN HELICOPTER FUNCTION
function SpawnJobHelicopter(vehicleData, helipadData)
    local jobName, jobGrade = Framework.GetPlayerJob()
    
    local args = vehicleData.args or vehicleData
    local gradoJob = tonumber(args.grado or args.min_grade) or 0
    
    -- Grade Check
    if jobGrade < gradoJob then
        Framework.Notify(locale('gradobasso'))
        return
    end

    -- Validate spawn point
    if not helipadData.pos2 then 
        Framework.Notify(locale('helipad_spawn_not_set')) 
        return 
    end

    local spawnCoords = vector3(helipadData.pos2.x, helipadData.pos2.y, helipadData.pos2.z)
    local heading = helipadData.heading or 0.0

    -- Model validation
    local model = args.model or vehicleData.model
    local modelHash = type(model) == 'string' and joaat(model) or model
    
    if not IsModelInCdimage(modelHash) then 
        Framework.Notify(locale('invalid_model_msg', tostring(model))) 
        return 
    end

    if not IsModelAVehicle(modelHash) then
        Framework.Notify(locale('model_not_vehicle', tostring(model)))
        return
    end

    -- Load model
    RequestModel(modelHash)
    local timeout = 0
    while not HasModelLoaded(modelHash) and timeout < 5000 do 
        Wait(10) 
        timeout = timeout + 10
    end

    if not HasModelLoaded(modelHash) then
        Framework.Notify(locale('failed_load_veh'))
        return
    end

    -- Create helicopter
    local vehicle = CreateVehicle(modelHash, spawnCoords.x, spawnCoords.y, spawnCoords.z, heading, true, false)
    
    if not DoesEntityExist(vehicle) then
        Framework.Notify(locale('failed_create_veh'))
        SetModelAsNoLongerNeeded(modelHash)
        return
    end

    local vehicleTimeout = 0
    while not DoesEntityExist(vehicle) and vehicleTimeout < 2000 do
        Wait(10)
        vehicleTimeout = vehicleTimeout + 10
    end

    -- Essential Network & Entity setup
    SetEntityAsMissionEntity(vehicle, true, true)
    SetVehicleHasBeenOwnedByPlayer(vehicle, true)
    SetVehicleNeedsToBeHotwired(vehicle, false)
    SetVehRadioStation(vehicle, 'OFF')
    
    -- Handle Color
    local r, g, b = nil, nil, nil
    if vehicleData.color_r and vehicleData.color_g and vehicleData.color_b then
        r = tonumber(vehicleData.color_r)
        g = tonumber(vehicleData.color_g)
        b = tonumber(vehicleData.color_b)
    elseif args and args.colore then
        r = tonumber(args.colore.r or args.colore.x)
        g = tonumber(args.colore.g or args.colore.y)
        b = tonumber(args.colore.b or args.colore.z)
    end

    if r and g and b then
        SetVehicleColours(vehicle, 0, 0)
        SetVehicleCustomPrimaryColour(vehicle, r, g, b)
        SetVehicleCustomSecondaryColour(vehicle, r, g, b)
    end

    -- Handle Plate
    local plate = vehicleData.plate or args.targa
    if plate and plate ~= "" then
        SetVehicleNumberPlateText(vehicle, tostring(plate))
    end

    -- Handle Mods
    local fullkit = vehicleData.fullkit == 1 or args.fullkit
    if fullkit then
        SetVehicleModKit(vehicle, 0)
        SetVehicleMod(vehicle, 11, 3, false)
        SetVehicleMod(vehicle, 12, 2, false)
        SetVehicleMod(vehicle, 13, 2, false)
        SetVehicleMod(vehicle, 15, 3, false)
        ToggleVehicleMod(vehicle, 18, true)
        ToggleVehicleMod(vehicle, 22, true)
    end

    SetModelAsNoLongerNeeded(modelHash)
    TaskWarpPedIntoVehicle(PlayerPedId(), vehicle, -1)
    Framework.GiveVehicleKeys(vehicle)
    Framework.Notify(locale('vehspawned'))
end

function OpenMenu(label, job, modifica, selezionata)
    isModifying = modifica
    
    if modifica then 
        DebugLog('Loading job data from database: ' .. job)
        lib.callback('hPoslovi:server:getAllJobs', false, function(data)
            for k,v in pairs(data) do 
                if v.job == job then 
                    datafaz = v
                    old = k
                    if not datafaz.garage then
                        datafaz.garage = { veicoli = {} }
                    end
                    
                    SetNuiFocus(true, true)
                    SendNUIMessage({
                        action = 'open',
                        mode = 'creator',
                        isModifying = true,
                        data = datafaz,
                        locales = GetLocalesTable()
                    })
                    break
                end
            end
        end)
    else
        datafaz = {
            job = job,
            label = label,
            bossmenu = {},
            garage = {},
            inv = {},
            gradi = {}
        }
        
        SetNuiFocus(true, true)
        SendNUIMessage({
            action = 'open',
            mode = 'creator',
            isModifying = false,
            data = datafaz,
            locales = GetLocalesTable()
        })
    end
end

-- =======================================================
-- NUI CALLBACKS
-- =======================================================

RegisterNUICallback('close', function(data, cb)
    SetNuiFocus(false, false)
    cb('ok')
end)

RegisterNUICallback('getCoords', function(data, cb)
    local coords = GetEntityCoords(PlayerPedId())
    local heading = GetEntityHeading(PlayerPedId())
    cb({ x = coords.x, y = coords.y, z = coords.z, heading = heading })
end)

RegisterNUICallback('addVehicle', function(data, cb)
    if data and data.job and data.vehicle then
        TriggerServerEvent('hPoslovi:server:addVehicle', data.job, data.vehicle)
    end
    cb('ok')
end)

RegisterNUICallback('deleteVehicle', function(data, cb)
    if data and data.id and data.job then
        TriggerServerEvent('hPoslovi:server:deleteVehicle', data.id, data.job)
    end
    cb('ok')
end)

RegisterNUICallback('getJobVehicles', function(data, cb)
    if data and data.job then
        lib.callback('hPoslovi:server:getJobVehicles', false, function(vehicles)
            cb(vehicles or {})
        end, data.job, 'car')
    else
        cb({})
    end
end)

RegisterNUICallback('getJobHeliVehicles', function(data, cb)
    if data and data.job then
        lib.callback('hPoslovi:server:getJobVehicles', false, function(vehicles)
            cb(vehicles or {})
        end, data.job, 'heli')
    else
        cb({})
    end
end)

RegisterNUICallback('addHeliVehicle', function(data, cb)
    if data and data.job and data.vehicle then
        data.vehicle.vehicle_type = 'heli'
        TriggerServerEvent('hPoslovi:server:addVehicle', data.job, data.vehicle)
    end
    cb('ok')
end)

RegisterNUICallback('saveJob', function(data, cb)
    if data and data.data then
        -- Set defaults if no grades provided
        if #data.data.gradi == 0 then
            data.data.gradi = Config.IfNotGrades
        end
        TriggerServerEvent('hPoslovi:server:createOrUpdateJob', data.data, data.isModifying)
    end
    cb('ok')
end)

RegisterNUICallback('deleteJob', function(data, cb)
    if data and data.job then
        TriggerServerEvent('hPoslovi:server:deleteJob', data.job)
    end
    cb('ok')
end)

RegisterNUICallback('editSelectedJob', function(data, cb)
    if data and data.job then
        OpenMenu("", data.job, true, nil)
    end
    cb('ok')
end)

RegisterNUICallback('spawnVehicle', function(data, cb)
    if data and data.vehicle then
        local jobName, _ = Framework.GetPlayerJob()
        local garageData = data.garage
        if (not garageData or not garageData.pos2) and AllJobsData then
            for _, v in pairs(AllJobsData) do
                if v.job == jobName then
                    garageData = v.garage
                    break
                end
            end
        end
        SpawnJobVehicle(data.vehicle, garageData)
    end
    cb('ok')
end)

RegisterNUICallback('spawnHelicopter', function(data, cb)
    if data and data.vehicle then
        local jobName, _ = Framework.GetPlayerJob()
        local helipadData = data.helipad
        if (not helipadData or not helipadData.pos2) and AllJobsData then
            for _, v in pairs(AllJobsData) do
                if v.job == jobName then
                    helipadData = v.helipad
                    break
                end
            end
        end
        SpawnJobHelicopter(data.vehicle, helipadData)
    end
    cb('ok')
end)

RegisterNUICallback('wardrobeAction', function(data, cb)
    if not data then cb('ok') return end

    if data.action == 'openPedMenu' then
        TriggerEvent("illenium-appearance:client:openClothingShop", true)
    elseif data.action == 'saveOutfit' then
        local appearance = exports['illenium-appearance']:getPedAppearance(PlayerPedId())
        if appearance then
            TriggerServerEvent('hPoslovi:server:saveJobOutfit', data.job, data.outfitName, appearance)
        else
            Framework.Notify(locale('failed_appearance'))
        end
    elseif data.action == 'wearOutfit' then
        if data.outfitData then
            exports['illenium-appearance']:setPlayerAppearance(data.outfitData)
            Framework.Notify(locale('outfit_applied', data.outfitName))
        end
    elseif data.action == 'deleteOutfit' then
        TriggerServerEvent('hPoslovi:server:deleteJobOutfit', data.job, data.outfitName)
    end
    cb('ok')
end)

-- EVENTS
RegisterNetEvent('hPoslovi:client:openEditMenu', function()
    lib.callback('hPoslovi:server:getAllJobs', false, function(data)
        if not data or #data == 0 then
            Framework.Notify(locale('no_jobs_found'))
            return
        end
        
        SetNuiFocus(true, true)
        SendNUIMessage({
            action = 'openJobList',
            jobs = data,
            locales = GetLocalesTable()
        })
    end)
end)

RegisterNetEvent('hPoslovi:client:openCreateMenu', function()
    SetNuiFocus(true, true)
    SendNUIMessage({
        action = 'openCreatePrompt',
        locales = GetLocalesTable()
    })
end)

RegisterNetEvent('hPoslovi:client:refreshJobs', function()
    DebugLog('Refreshing markers from database...')
    Wait(500)
    lib.callback('hPoslovi:server:getAllJobs', false, function(data)
        if data then
            CreateMarkers(data)
        end
    end)
end)

CreateThread(function()
    Wait(2000) -- Wait for server to load
    DebugLog('Loading markers from database...')
    lib.callback('hPoslovi:server:getAllJobs', false, function(data)
        if data then
            CreateMarkers(data)
        else
            DebugLog('No jobs found in database')
        end
    end)
end)

-- Track registered inventory marker names per job so we can clean them up on refresh
local registeredInvMarkers = {}

function CreateMarkers(data)
    if not data then 
        DebugLog('ERROR: CreateMarkers called with nil data')
        return 
    end
    AllJobsData = data
    
    DebugLog('Creating markers for ' .. #data .. ' jobs')
    
    for k,v in pairs(data) do
        DebugLog('Processing job: ' .. (v.job or 'unknown'))
        
        -- Unregister standard markers
        TriggerEvent('ox_gridsystem:unregisterMarker', 'bossmenu'..v.job)
        TriggerEvent('ox_gridsystem:unregisterMarker', 'camerino'..v.job)
        TriggerEvent('ox_gridsystem:unregisterMarker', 'garage1'..v.job)
        TriggerEvent('ox_gridsystem:unregisterMarker', 'garage2'..v.job)
        TriggerEvent('ox_gridsystem:unregisterMarker', 'helipad1'..v.job)
        TriggerEvent('ox_gridsystem:unregisterMarker', 'helipad2'..v.job)

        -- Unregister ALL previously registered inventory markers for this job
        if registeredInvMarkers[v.job] then
            for _, invName in ipairs(registeredInvMarkers[v.job]) do
                TriggerEvent('ox_gridsystem:unregisterMarker', invName)
            end
            registeredInvMarkers[v.job] = nil
        end

        -- Also unregister by current inv keys in case they changed
        if v.inv then
            for a, b in pairs(v.inv) do
                if a and b.pos then
                    TriggerEvent('ox_gridsystem:unregisterMarker', 'inv_'..v.job..'_'..a)
                end
            end
        end

        Wait(250)

        -- Register New
        if v.bossmenu and v.bossmenu.pos then
            DebugLog('Registering boss menu marker for ' .. v.job)
            TriggerEvent('ox_gridsystem:registerMarker', {
                name = 'bossmenu'..v.job,
                pos = vector3(v.bossmenu.pos.x, v.bossmenu.pos.y, v.bossmenu.pos.z),
                size = Config.MarkerSize,
                scale = Config.MarkerSize,
                type = Config.MarkerType,
                drawDistance = Config.MarkerDrawDistance,
                interactDistance = Config.InteractDistance,
                color = Config.MarkerColor,
                msg = locale('textuibossmenu'),
                permission = v.job,
                jobGrade = v.bossmenu.gradoboss,
                texture = Config.BossMenuMarker,  
                textureDict = Config.MarkerYTD,
                action = function()
                    Framework.OpenBossMenu(v.job)
                end
            })
        end

        if v.inv then
            registeredInvMarkers[v.job] = registeredInvMarkers[v.job] or {}
            for a,b in pairs(v.inv) do
                if a and b.pos then
                    local markerName = 'inv_'..v.job..'_'..a
                    table.insert(registeredInvMarkers[v.job], markerName)
                    DebugLog('Registering inventory marker ' .. tostring(a) .. ' for ' .. v.job)
                    TriggerEvent('ox_gridsystem:registerMarker', {
                        name = markerName,
                        pos = vector3(b.pos.x, b.pos.y, b.pos.z),
                        size = Config.MarkerSize,
                        scale = Config.MarkerSize,
                        type = Config.MarkerType,
                        drawDistance = math.max(Config.MarkerDrawDistance, 8),
                        interactDistance = Config.InteractDistance,
                        color = Config.MarkerColor,
                        msg = locale('textuideposito'),
                        permission = v.job,
                        jobGrade = tonumber(b.grado),
                        texture = Config.InventoryMarker,  
                        textureDict = Config.MarkerYTD,
                        action = function()
                            exports.ox_inventory:openInventory('stash', v.job..a)
                        end
                    })
                end
            end
        end

        if v.camerino then
            DebugLog('Registering wardrobe marker for ' .. v.job)
            TriggerEvent('ox_gridsystem:registerMarker', {
                name = 'camerino'..v.job,
                pos = vector3(v.camerino.x, v.camerino.y, v.camerino.z),
                size = Config.MarkerSize,
                scale = Config.MarkerSize,
                type = Config.MarkerType,
                drawDistance = Config.MarkerDrawDistance,
                interactDistance = Config.InteractDistance,
                color = Config.MarkerColor,
                msg = locale('textuiwardrobe'),
                permission = v.job,
                jobGrade = 0,
                texture = Config.WardRobeMarker,  
                textureDict = Config.MarkerYTD,
                action = function()
                    OpenWardrobe(v.job)
                end
            })
        end

        if v.garage and v.garage.pos1 then
            DebugLog('Registering garage markers for ' .. v.job)
            TriggerEvent('ox_gridsystem:registerMarker', {
                name = 'garage1'..v.job,
                pos = vector3(v.garage.pos1.x, v.garage.pos1.y, v.garage.pos1.z),
                size = Config.MarkerSize,
                scale = Config.MarkerSize,
                type = Config.MarkerType,
                drawDistance = Config.MarkerDrawDistance,
                interactDistance = Config.InteractDistance,
                color = Config.MarkerColor,
                msg = locale('texuigarage1'),
                permission = v.job,
                jobGrade = 0,
                texture = Config.Vehicle1Marker,  
                textureDict = Config.MarkerYTD,
                action = function()
                    OpenGarage(data, v.job)
                end,
                onExit = function()
                    SetNuiFocus(false, false)
                    SendNUIMessage({ action = 'close' })
                end
            })
            
            if v.garage.pos2 then
                TriggerEvent('ox_gridsystem:registerMarker', {
                    name = 'garage2'..v.job,
                    pos = vector3(v.garage.pos2.x, v.garage.pos2.y, v.garage.pos2.z),
                    size = Config.MarkerSize,
                    scale = Config.MarkerSize,
                    type = Config.MarkerType,
                    drawDistance = Config.MarkerDrawDistance,
                    interactDistance = Config.InteractDistance,
                    color = Config.MarkerColor,
                    msg = locale('texuigarage2'),
                    permission = v.job,
                    jobGrade = 0,
                    texture = Config.Vehicle2Marker,  
                    textureDict = Config.MarkerYTD,
                    action = function()
                        if IsPedInAnyVehicle(PlayerPedId()) then
                            Framework.DeleteVehicle(GetVehiclePedIsIn(PlayerPedId()))
                            Framework.Notify(locale('vehdeposited'))
                        else
                            Framework.Notify(locale('notveh'))
                        end
                    end,
                    onExit = function()
                        SetNuiFocus(false, false)
                        SendNUIMessage({ action = 'close' })
                    end
                })
            end
        end

        -- HELIPAD MARKERS
        if v.helipad and v.helipad.pos1 then
            DebugLog('Registering helipad markers for ' .. v.job)
            TriggerEvent('ox_gridsystem:registerMarker', {
                name = 'helipad1'..v.job,
                pos = vector3(v.helipad.pos1.x, v.helipad.pos1.y, v.helipad.pos1.z),
                size = Config.MarkerSize,
                scale = Config.MarkerSize,
                type = Config.MarkerType,
                drawDistance = Config.MarkerDrawDistance,
                interactDistance = Config.InteractDistance,
                color = Config.MarkerColor,
                msg = locale('texuihelipad1'),
                permission = v.job,
                jobGrade = 0,
                texture = Config.Helipad1Marker,
                textureDict = Config.MarkerYTD,
                action = function()
                    OpenHelipad(data, v.job)
                end,
                onExit = function()
                    SetNuiFocus(false, false)
                    SendNUIMessage({ action = 'close' })
                end
            })
            
            if v.helipad.pos2 then
                TriggerEvent('ox_gridsystem:registerMarker', {
                    name = 'helipad2'..v.job,
                    pos = vector3(v.helipad.pos2.x, v.helipad.pos2.y, v.helipad.pos2.z),
                    size = Config.MarkerSize,
                    scale = Config.MarkerSize,
                    type = Config.MarkerType,
                    drawDistance = Config.MarkerDrawDistance,
                    interactDistance = Config.InteractDistance,
                    color = Config.MarkerColor,
                    msg = locale('texuihelipad2'),
                    permission = v.job,
                    jobGrade = 0,
                    texture = Config.Helipad2Marker,
                    textureDict = Config.MarkerYTD,
                    action = function()
                        if IsPedInAnyVehicle(PlayerPedId()) then
                            Framework.DeleteVehicle(GetVehiclePedIsIn(PlayerPedId()))
                            Framework.Notify(locale('vehdeposited'))
                        else
                            Framework.Notify(locale('notveh'))
                        end
                    end,
                    onExit = function()
                        SetNuiFocus(false, false)
                        SendNUIMessage({ action = 'close' })
                    end
                })
            end
        end
    end
    
    DebugLog('Marker creation complete')
end

-- Refresh vehicle list when updated
RegisterNetEvent('hPoslovi:client:refreshVehicles', function(jobName)
    if datafaz and datafaz.job == jobName then
        Wait(100)
    end
end)

-- BAZA COMMAND - set GPS waypoint to Vehicle Get (garage_retrieve) position
RegisterCommand(Config.BaseCommand, function()
    local jobName, jobGrade = Framework.GetPlayerJob()

    if not jobName or jobName == 'unemployed' then
        Framework.Notify(locale('noperms'))
        return
    end

    lib.callback('hPoslovi:server:getGarageRetrievePos', false, function(pos)
        if pos and pos.x and pos.y then
            SetNewWaypoint(pos.x, pos.y)
        else
            Framework.Notify(locale('garage_not_configured'))
        end
    end, jobName)
end, false)