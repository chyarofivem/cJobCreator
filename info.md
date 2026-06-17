# cJobCreator — Technical Reference

> **Resource name:** `cJobCreator`  
> **Internal event prefix:** `hPoslovi`  
> **Framework:** ESX (es_extended) + ox_lib + oxmysql + ox_inventory + illenium-appearance  
> **Language:** Lua (FiveM)

---

## Overview

cJobCreator is a dynamic job management system for FiveM ESX servers. It allows admins to create, edit, and delete jobs at runtime — without restarting the server — through a NUI (HTML/JS) interface. All job data is persisted in a MySQL database and hot-reloaded on all clients when changes are made.

Each job can have:
- A **boss menu** marker (opens `esx_society` boss panel)
- A **wardrobe** marker (opens `illenium-appearance` outfit picker)
- A **garage** with two positions: a *retrieve* marker (opens car vehicle spawn menu) and a *spawn* position (where cars appear)
- A **helipad** with two positions: a *retrieve* marker (opens helicopter spawn menu) and a *spawn* position (where helicopters appear)
- Up to N **inventory** markers (opens `ox_inventory` stashes)
- A list of **grades** (synced to ESX `jobs`/`job_grades` tables)
- A list of **vehicles** split by type — `car` (spawned from garage) and `heli` (spawned from helipad), both stored in `hposlovi_vehicles` filtered by `vehicle_type`
- A set of **outfits** (stored in `hposlovi_outfits`, per-job, managed by boss-grade players)

---

## File Structure

```
cJobCreator/
├── config/
│   ├── config.lua       — All configuration (shared: loaded on both client and server)
│   └── data.json        — Legacy/example job data (not used at runtime)
├── client/
│   ├── main.lua         — All client logic: markers, NUI callbacks, commands
│   └── marker.lua       — ox_gridsystem marker registration helpers
├── server/
│   └── main.lua         — All server logic: schema bootstrap, DB queries, ESX sync, callbacks
├── html/                — NUI frontend (index.html + css/style.css + js/script.js)
├── locales/
│   ├── en.json
│   └── hr.json          — Active locale (set via Config.Locale)
└── fxmanifest.lua
```

---

## Configuration (`config/config.lua`)

All keys live on the global `Config` table (shared script, available on both sides).

| Key | Type | Description |
|-----|------|-------------|
| `Config.Debug` | bool | Enables `[hPoslovi DEBUG]` console prints |
| `Config.Locale` | string | Active locale — `'en'` or `'hr'` |
| `Config.MarkerType` | number | GTA marker type integer (`-1` = custom texture) |
| `Config.MarkerDrawDistance` | number | Distance at which markers become visible |
| `Config.InteractDistance` | number | Distance at which the TextUI prompt appears |
| `Config.MarkerSize` | vector3 | Scale of all markers |
| `Config.MarkerColor` | `{r,g,b}` | Default marker colour |
| `Config.MarkerYTD` | string/false | Texture dictionary for custom markers |
| `Config.InventoryMarker` | string/false | Texture override for inventory markers |
| `Config.WardRobeMarker` | string/false | Texture override for wardrobe markers |
| `Config.BossMenuMarker` | string/false | Texture override for boss menu markers |
| `Config.Vehicle1Marker` | string/false | Texture override for garage retrieve marker |
| `Config.Vehicle2Marker` | string/false | Texture override for garage deposit marker |
| `Config.Helipad1Marker` | string/false | Texture override for helipad retrieve marker |
| `Config.Helipad2Marker` | string/false | Texture override for helipad deposit marker |
| `Config.IfNotGrades` | table | Fallback grade list when no grades are supplied |
| `Config.CreateCommand` | string | Chat command to open the job creation UI (`makejob`) |
| `Config.EditCommand` | string | Chat command to open the job edit UI (`editjob`) |
| `Config.BaseCommand` | string | Chat command to set GPS waypoint to `garage_retrieve` (`baza`) |
| `Config.AutoSetJob` | bool | Automatically sets creator's job to the new job on creation |
| `Config.AdminGroups` | string[] | ESX groups allowed to use create/edit commands |

**Config functions** (also in config.lua, available globally):

- `YourBossmenuFunc(job)` — Opens esx_society boss menu for the given job.
- `FunzioneTextUI(msg)` — Shows an ox_lib TextUI prompt.
- `Notify(msg)` — Shows an ESX notification.

---

## Database Schema

### Schema Bootstrap (automatic)

On every server start, `server/main.lua` runs `CREATE TABLE IF NOT EXISTS` for all tables and applies schema migrations. **No manual SQL import is required.** Migrations are idempotent — safe to run on existing databases.

Current migrations applied at startup:
- `ALTER TABLE hposlovi_positions MODIFY COLUMN position_type varchar(50)` — ensures the column is not an ENUM (fixes truncation issues with new position types)
- `ALTER TABLE hposlovi_vehicles ADD COLUMN vehicle_type varchar(10) DEFAULT 'car'` — adds vehicle type column to existing installations (wrapped in pcall, silently skipped if already present)

### `hposlovi_jobs`
| Column | Type | Description |
|--------|------|-------------|
| `job_name` | varchar(50) | Primary key, matches ESX `jobs.name` |
| `job_label` | varchar(100) | Display label |

### `hposlovi_positions`
| Column | Type | Description |
|--------|------|-------------|
| `id` | int | Auto-increment PK |
| `job_name` | varchar(50) | FK → hposlovi_jobs |
| `position_type` | varchar(50) | One of: `bossmenu`, `wardrobe`, `garage_retrieve`, `garage_spawn`, `helipad_retrieve`, `helipad_spawn`, `inventory` |
| `x`, `y`, `z` | float | World coordinates |
| `heading` | float | Used for `garage_spawn` and `helipad_spawn` |
| `extra_data` | json | Used by `bossmenu` to store `{boss_grade: N}` |

### `hposlovi_inventories`
| Column | Type | Description |
|--------|------|-------------|
| `id` | int | Auto-increment PK |
| `job_name` | varchar(50) | FK → hposlovi_jobs |
| `inventory_id` | varchar(50) | Numeric string index (`"1"`, `"2"`, …) |
| `label` | varchar(100) | Display name / stash label |
| `slots` | int | ox_inventory stash slot count |
| `max_weight` | int | ox_inventory stash weight limit |
| `min_grade` | int | Minimum job grade required to access |
| `x`, `y`, `z` | float | World position of the stash marker |

Stashes are registered as `ox_inventory` stashes with the key `{job_name}{inventory_id}` (e.g. `gsf1`).

### `hposlovi_vehicles`
| Column | Type | Description |
|--------|------|-------------|
| `id` | int | Auto-increment PK |
| `job_name` | varchar(50) | FK → hposlovi_jobs |
| `label` | varchar(100) | Display name in NUI |
| `model` | varchar(50) | GTA vehicle model name |
| `color_r/g/b` | int | Custom primary/secondary RGB colour |
| `plate` | varchar(20) | Number plate text |
| `fullkit` | tinyint | 1 = apply max engine/turbo/xenon mods |
| `min_grade` | int | Minimum grade to spawn this vehicle |
| `vehicle_type` | varchar(10) | `'car'` (garage) or `'heli'` (helipad) — default `'car'` |

### `hposlovi_outfits`
| Column | Type | Description |
|--------|------|-------------|
| `id` | int | Auto-increment PK |
| `job_name` | varchar(50) | FK → hposlovi_jobs |
| `outfit_name` | varchar(100) | Unique name within the job |
| `outfit_data` | json | Full `illenium-appearance` ped appearance blob |

---

## Server Events & Callbacks

### `lib.callback` (server → client request/response)

| Name | Args | Returns | Description |
|------|------|---------|-------------|
| `hPoslovi:server:getAllJobs` | — | `jobData[]` | Full job data for all jobs (positions, inventories, grades) |
| `hPoslovi:server:getJobVehicles` | `jobName, vehicleType` | `vehicle[]` | All vehicles for a job filtered by `vehicleType` (`'car'` or `'heli'`). Defaults to `'car'` if omitted. |
| `hPoslovi:server:getBossGrade` | `jobName` | `number` | Boss grade from the bossmenu extra_data |
| `hPoslovi:server:getJobOutfits` | `jobName` | `{[outfitName]: outfitData}` | All saved outfits for the job |
| `hPoslovi:server:getGarageRetrievePos` | `jobName` | `{x,y,z}` or `nil` | The `garage_retrieve` world position for the job |
| `hPoslovi:server:getHelipadRetrievePos` | `jobName` | `{x,y,z}` or `nil` | The `helipad_retrieve` world position for the job |

### `RegisterNetEvent` (client → server, no response)

| Name | Args | Description |
|------|------|-------------|
| `hPoslovi:server:createOrUpdateJob` | `jobData, isModifying` | Creates or updates a job in ESX + hPoslovi DB. Saves all positions including `helipad_retrieve` / `helipad_spawn`. Triggers `ESX.RefreshJobs()` and `hPoslovi:client:refreshJobs` on all clients. |
| `hPoslovi:server:deleteJob` | `jobName` | Deletes job from ESX tables, all hPoslovi tables, and refreshes. |
| `hPoslovi:server:addVehicle` | `jobName, vehicleData` | Inserts into `hposlovi_vehicles`. `vehicleData.vehicle_type` determines `'car'` or `'heli'`. Triggers `hPoslovi:client:refreshVehicles`. |
| `hPoslovi:server:deleteVehicle` | `vehicleId, jobName` | Deletes from `hposlovi_vehicles` by ID. Triggers `hPoslovi:client:refreshVehicles`. |
| `hPoslovi:server:saveJobOutfit` | `jobName, outfitName, outfitData` | Upserts into `hposlovi_outfits`. Boss grade check enforced. |
| `hPoslovi:server:deleteJobOutfit` | `jobName, outfitName` | Deletes from `hposlovi_outfits`. Boss grade check enforced. |

### `TriggerClientEvent` (server → all clients or specific)

| Name | Target | Description |
|------|--------|-------------|
| `hPoslovi:client:refreshJobs` | `-1` (all) | Tells all clients to re-fetch job data and rebuild markers |
| `hPoslovi:client:refreshVehicles` | `-1` (all) | Notifies clients that vehicle list changed |
| `hPoslovi:client:openEditMenu` | `source` | Opens job list NUI for admin |
| `hPoslovi:client:openCreateMenu` | `source` | Opens create-job prompt NUI for admin |

---

## Client Logic

### Marker System (`client/main.lua` — `CreaMark(data)`)

Called on startup (after 2s) and on every `hPoslovi:client:refreshJobs` event.

For each job in `data`:
1. **Unregisters** all previous markers for that job via `ox_gridsystem:unregisterMarker`.
2. Waits 250ms for ox_lib to flush old points.
3. **Registers** markers based on which positions exist:
   - `bossmenu{job}` — permission-gated to job + boss grade
   - `camerino{job}` — permission-gated to job, grade 0
   - `garage1{job}` — permission-gated to job, grade 0 — opens `ApriGarage()` (car list)
   - `garage2{job}` — deposit marker, deletes the vehicle the player is in
   - `helipad1{job}` — permission-gated to job, grade 0 — opens `ApriHelipad()` (heli list)
   - `helipad2{job}` — deposit marker, deletes the helicopter the player is in
   - `inv_{job}_{idx}` — permission-gated to job + `min_grade` — opens ox_inventory stash

### NUI Callbacks (`RegisterNUICallback`)

| Name | Action |
|------|--------|
| `close` | Hides NUI focus |
| `getCoords` | Returns player's current world coords + heading |
| `addVehicle` | Fires `hPoslovi:server:addVehicle` with `vehicle_type = 'car'` |
| `addHeliVehicle` | Fires `hPoslovi:server:addVehicle` with `vehicle_type = 'heli'` |
| `deleteVehicle` | Fires `hPoslovi:server:deleteVehicle` (used for both cars and helis, delete by ID) |
| `getJobVehicles` | Calls `hPoslovi:server:getJobVehicles` with type `'car'`, returns result to NUI |
| `getJobHeliVehicles` | Calls `hPoslovi:server:getJobVehicles` with type `'heli'`, returns result to NUI |
| `saveJob` | Fires `hPoslovi:server:createOrUpdateJob` |
| `deleteJob` | Fires `hPoslovi:server:deleteJob` |
| `editSelectedJob` | Opens edit UI for a specific job via `ApriMenu()` |
| `spawnVehicle` | Calls `SpawnJobVehicle()` to spawn a job car |
| `spawnHelicopter` | Calls `SpawnJobHelicopter()` to spawn a job helicopter |
| `wardrobeAction` | Handles `openPedMenu` / `saveOutfit` / `wearOutfit` / `deleteOutfit` |

### Key Client Functions

- **`CreaMark(data)`** — Rebuilds all job markers from a full job data array.
- **`ApriGarage(data, job)`** — Fetches `car` vehicles for the job and opens the NUI garage menu.
- **`ApriHelipad(data, job)`** — Fetches `heli` vehicles for the job and opens the NUI helipad menu.
- **`SpawnJobVehicle(vehicleData, garageData)`** — Validates grade, spawn point, model, then spawns the car and warps the player into it.
- **`SpawnJobHelicopter(vehicleData, helipadData)`** — Validates grade, spawn point, model, then spawns the helicopter and warps the player into it. Does not use `IsSpawnPointClear` (unreliable at height).
- **`ApriMenu(label, job, modifica, selezionata)`** — Opens the NUI creator/editor. If `modifica = true`, loads existing job data from DB first.
- **`YourWardRobeFunc(job)`** — Opens the outfit wardrobe NUI with outfit management permissions derived from boss grade.

---

## Chat Commands

| Command | Side | Who | Description |
|---------|------|-----|-------------|
| `Config.CreateCommand` (`makejob`) | Server | Admin groups | Opens job creation NUI |
| `Config.EditCommand` (`editjob`) | Server | Admin groups | Opens job list for editing |
| `Config.BaseCommand` (`baza`) | **Client** | Any employed player | Sets GPS waypoint to the job's `garage_retrieve` position |

> **Note:** `makejob` and `editjob` are restricted by `Config.AdminGroups` (checked via `CheckPerms(source)`). `/baza` is open to any player with a non-unemployed job.

---

## Outfit System

- Outfits are saved as full `illenium-appearance` appearance blobs.
- Only players at or above the boss grade (from `hposlovi_positions.extra_data` on the `bossmenu` row) can save or delete outfits.
- All players in the job can wear any saved outfit.
- In-memory cache: `jobOutfits[jobName][outfitName]` on the server, populated at startup and kept in sync.

---

## Permissions

- **Admin commands** (`makejob`, `editjob`): checked via `CheckPerms(source)` — iterates `Config.AdminGroups` against `xPlayer.getGroup()`.
- **Marker access**: `ox_gridsystem` markers have `permission = job_name` and optional `jobGrade = N`, which the marker system evaluates against the player's current ESX job.
- **Outfit management**: server-side grade check against `boss_grade` from the job's bossmenu extra_data.
- **Vehicle/helicopter spawning**: client-side grade check against `vehicle.min_grade`.
- **Inventory access**: marker-level grade check via `jobGrade` on the ox_gridsystem marker.

---

## Data Flow — Creating a Job

```
Admin types /makejob
  → Server: CheckPerms → TriggerClientEvent openCreateMenu
  → Client: SendNUIMessage { action: 'openCreatePrompt' }
  → Admin fills form, clicks Save
  → NUI: RegisterNUICallback 'saveJob' fires
  → Client: TriggerServerEvent hPoslovi:server:createOrUpdateJob
  → Server:
      DELETE + INSERT into jobs / job_grades (ESX tables)
      ESX.RefreshJobs()
      INSERT into hposlovi_jobs
      DELETE + INSERT into hposlovi_positions
        (bossmenu, wardrobe, garage_retrieve, garage_spawn,
         helipad_retrieve, helipad_spawn)
      DELETE + INSERT into hposlovi_inventories
      RegisterStash (ox_inventory) for each inventory
      TriggerClientEvent hPoslovi:client:refreshJobs → -1 (all)
  → All clients: lib.callback getAllJobs → CreaMark(data) rebuilds markers
```

---

## Data Flow — /baza Command

```
Player types /baza
  → Client RegisterCommand fires
  → ESX.GetPlayerData() → reads job name
  → lib.callback hPoslovi:server:getGarageRetrievePos(jobName)
  → Server: MySQL.single.await SELECT garage_retrieve position
  → Client callback: SetNewWaypoint(x, y)
```

---

## Data Flow — Helipad (Player Usage)

```
Player walks to helipad1 marker
  → ox_gridsystem action fires → ApriHelipad(data, job)
  → lib.callback hPoslovi:server:getJobVehicles(jobName, 'heli')
  → Server: SELECT * FROM hposlovi_vehicles WHERE job_name = ? AND vehicle_type = 'heli'
  → Client: grade-filters results, opens NUI in 'helipad' mode
  → Player selects a helicopter
  → NUI: $.post /spawnHelicopter { vehicle, helipad }
  → Client: SpawnJobHelicopter() → grade check → CreateVehicle at helipad.pos2
  → Player warped into helicopter

Player walks to helipad2 marker
  → action fires → if player is in vehicle: ESX.Game.DeleteVehicle()
```

---

## NUI Creator — Helipad Tab

The editor (`/makejob`, `/editjob`) has a dedicated **Heliodrom** tab (helicopter icon) with:

- **Pozicija Preuzimanja** — world position of the interaction trigger marker
- **Točka Spawna i Heading** — world position + heading where the helicopter physically spawns
- **Helicopter list** — separate from the car garage list; icons show 🚁 for helis, 🚗 for cars
- **Add Helicopter form** — label, model, color, plate, min grade, fullkit (identical fields to garage vehicles but saved with `vehicle_type = 'heli'`)
