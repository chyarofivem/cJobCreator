# cJobCreator — Technical Reference (v3.0.0)

> **Resource name:** `cJobCreator`  
> **Internal event prefix:** `hPoslovi`  
> **Framework:** ESX (es_extended) / QB-Core / QBox + ox_lib + ox_inventory + illenium-appearance  
> **Language:** Lua (FiveM)

---

## Overview

cJobCreator is a dynamic job management system for FiveM servers (both ESX and QB-Core/QBox). It allows admins to create, edit, and delete jobs at runtime — without restarting the server — through a premium glassmorphic NUI (HTML/JS) interface. All job data is persisted in a MySQL database and hot-reloaded on all clients when changes are made.

Each job can have:
- A **boss menu** marker (opens framework-native boss panel)
- A **wardrobe** marker (opens `illenium-appearance` outfit picker)
- A **garage** with two positions: a *retrieve* marker (opens car vehicle spawn menu) and a *spawn* position (where cars appear)
- A **helipad** with two positions: a *retrieve* marker (opens helicopter spawn menu) and a *spawn* position (where helicopters appear)
- Up to N **inventory** markers (opens `ox_inventory` stashes)
- A list of **grades** (synced to framework native structures)
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
│   ├── framework.lua    — Dynamic client framework bridge, TextUI & notification normalization [NEW in v3.0.0]
│   ├── main.lua         — All client logic: markers, NUI callbacks, commands [Updated to clean English in v3.0.0]
│   └── marker.lua       — ox_gridsystem marker registration helpers
├── server/
│   ├── framework.lua    — Dynamic server framework bridge, startup syncing, migrations [NEW in v3.0.0]
│   └── main.lua         — All server logic: schema bootstrap, DB queries, framework sync, callbacks
├── html/                — NUI frontend (index.html + css/style.css + js/script.js)
├── locales/
│   ├── en.json
│   └── hr.json          — Active locale (set via Config.Locale)
└── fxmanifest.lua
```

---

## Configuration (`config/config.lua`)

All keys live on the global `Config` table (shared script, available on both sides). There are **no functions** in config.lua to ensure a clean upgrade path and easy customization.

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
| `Config.AdminGroups` | string[] | Framework admin groups/permissions allowed to use create/edit commands |

---

## Database Schema

### Schema Bootstrap (automatic)

On every server start, `server/main.lua` runs `CREATE TABLE IF NOT EXISTS` for all tables and applies schema migrations. **No manual SQL import is required.** Migrations are idempotent.

Migrations applied:
- `ALTER TABLE hposlovi_positions MODIFY COLUMN position_type varchar(50)` — ensures the column is not an ENUM
- `ALTER TABLE hposlovi_vehicles ADD COLUMN vehicle_type varchar(10) DEFAULT 'car'` — adds vehicle type column
- `ALTER TABLE hposlovi_jobs ADD COLUMN job_grades longtext DEFAULT NULL` — JSON field containing grade configuration for QB/QBox servers [NEW in v3.0.0]

### `hposlovi_jobs`
| Column | Type | Description |
|--------|------|-------------|
| `job_name` | varchar(50) | Primary key, matches framework job name |
| `job_label` | varchar(100) | Display label |
| `job_grades` | longtext | JSON configuration of job grades (used by QB/QBox) |

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
| `hPoslovi:server:getJobVehicles` | `jobName, vehicleType` | `vehicle[]` | All vehicles for a job filtered by `vehicleType` (`'car'` or `'heli'`). |
| `hPoslovi:server:getBossGrade` | `jobName` | `number` | Boss grade from the bossmenu extra_data |
| `hPoslovi:server:getJobOutfits` | `jobName` | `{[outfitName]: outfitData}` | All saved outfits for the job |
| `hPoslovi:server:getGarageRetrievePos` | `jobName` | `{x,y,z}` or `nil` | The `garage_retrieve` world position for the job |
| `hPoslovi:server:getHelipadRetrievePos` | `jobName` | `{x,y,z}` or `nil` | The `helipad_retrieve` world position for the job |

### `RegisterNetEvent` (client → server, no response)

| Name | Args | Description |
|------|------|-------------|
| `hPoslovi:server:createOrUpdateJob` | `jobData, isModifying` | Creates or updates a job. Triggers dynamic sync to clients. |
| `hPoslovi:server:deleteJob` | `jobName` | Deletes job and refreshes framework memory. |
| `hPoslovi:server:addVehicle` | `jobName, vehicleData` | Inserts into `hposlovi_vehicles`. |
| `hPoslovi:server:deleteVehicle` | `vehicleId, jobName` | Deletes from `hposlovi_vehicles` by ID. |
| `hPoslovi:server:saveJobOutfit` | `jobName, outfitName, outfitData` | Upserts into `hposlovi_outfits`. |
| `hPoslovi:server:deleteJobOutfit` | `jobName, outfitName` | Deletes from `hposlovi_outfits`. |

### `TriggerClientEvent` (server → all clients or specific)

| Name | Target | Description |
|------|--------|-------------|
| `hPoslovi:client:refreshJobs` | `-1` (all) | Tells all clients to re-fetch job data and rebuild markers |
| `hPoslovi:client:refreshVehicles` | `-1` (all) | Notifies clients that vehicle list changed |
| `hPoslovi:client:openEditMenu` | `source` | Opens job list NUI for admin |
| `hPoslovi:client:openCreateMenu` | `source` | Opens create-job prompt NUI for admin |

---

## Client Logic

### Marker System (`client/main.lua` — `CreateMarkers(data)`)

Called on startup (after 2s) and on every `hPoslovi:client:refreshJobs` event.

For each job in `data`:
1. **Unregisters** all previous markers for that job.
2. Waits 250ms for ox_lib to flush old points.
3. **Registers** markers based on which positions exist:
   - `bossmenu{job}` — permission-gated to job + boss grade
   - `camerino{job}` — permission-gated to job, grade 0
   - `garage1{job}` — permission-gated to job, grade 0 — opens `OpenGarage()` (car list)
   - `garage2{job}` — deposit marker, deletes the vehicle the player is in
   - `helipad1{job}` — permission-gated to job, grade 0 — opens `OpenHelipad()` (heli list)
   - `helipad2{job}` — deposit marker, deletes the helicopter the player is in
   - `inv_{job}_{idx}` — permission-gated to job + `min_grade` — opens ox_inventory stash

### NUI Callbacks (`RegisterNUICallback`)

All callback handlers correspond to JS `$.post` actions, routing data to appropriate English client-side handlers.

### Key Client Functions

- **`CreateMarkers(data)`** — Rebuilds all job markers from a full job data array.
- **`OpenGarage(data, job)`** — Fetches `car` vehicles for the job and opens the NUI garage menu.
- **`OpenHelipad(data, job)`** — Fetches `heli` vehicles for the job and opens the NUI helipad menu.
- **`SpawnJobVehicle(vehicleData, garageData)`** — Validates grade, spawn point, model, then spawns the car and warps the player.
- **`SpawnJobHelicopter(vehicleData, helipadData)`** — Validates grade, spawn point, model, then spawns the helicopter and warps the player.
- **`OpenMenu(label, job, isModifying, selected)`** — Opens the NUI creator/editor.
- **`OpenWardrobe(job)`** — Opens the outfit wardrobe NUI.

---

## Outfit System

- Outfits are saved as full `illenium-appearance` appearance blobs.
- Only players at or above the boss grade can save or delete outfits.
- All players in the job can wear any saved outfit.
- In-memory cache: `jobOutfits[jobName][outfitName]` on the server, populated at startup and kept in sync.
