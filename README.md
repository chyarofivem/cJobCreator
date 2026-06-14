# cJobCreator - Premium Glassmorphic Job & Faction Manager

`cJobCreator` is a premium, state-of-the-art job and faction creation system for FiveM (ESX). It replaces standard console/chat menus and basic UI elements with a modern, high-performance, double-pane glassmorphic NUI interface designed following advanced web styling standards (harmony of custom colors, smooth backdrop blurs, and hover micro-animations).

---

## 🎯 Key Features

### 1. Modern Glassmorphic NUI
- **Double-Pane Layout**: Left-pane sidebar navigation and right-pane action area.
- **Visual Design**: Curated dark palette with sleek `#00ADED` accents, translucent card components, responsive layouts, and modern typography (`Outfit` font).
- **Zero Third-Party UI Blockers**: Replaces old dialogs with custom-built HTML overlay modals for inputs, confirmations, and alerts, keeping users fully immersed.

### 2. Drag & Drop Grade Reordering
- **Discord-like Priority Sorting**: Allows administrators to drag and drop grades to rearrange their hierarchical order.
- **Auto-Recalculation**: Grade indices (0 to N) are dynamically calculated and updated client-to-server instantly upon saving.
- **CEF-Safe Interaction**: Built using custom mouse-coordinate tracking algorithms to bypass FiveM CEF sandbox restrictions on native HTML5 drag-and-drop API.

### 3. Click-to-Edit Grade Customization
- **Quick Modals**: Click on any grade within the editor list to open a custom overlay modal.
- **Full Customizability**: Modify the grade name (system ID), label (display name), and salary directly through the UI.

### 4. Dynamic Multi-Language Translation
- **On-Demand Loading**: Client fetches translation strings from `/locales/*.json` dynamically using native `LoadResourceFile()` and sends them to the UI.
- **Automatic DOM Compile**: A lightweight jQuery loop parses elements marked with `data-translate` attributes, ensuring 100% translation coverage of NUI screens without client-side lag.

### 5. Configurable Position Markers & Systems
- **Auto Gridsystem Sync**: Register/unregister marker positions for Wardrobe, Inventories (Stashes), Boss Menus, and Garage access points dynamically.
- **Illenium Appearance Wardrobe**: Open wardrobes, preview, save, or delete uniforms directly from a shared faction vault (grade-restricted for administrative options).
- **Database-Stored Faction Garages**: Register vehicles with custom model spawn codes, labels, plate prefixes, colors (RGB), and full engine/suspension modification packages.

---

## 🔧 Installation & Database Setup

1. **Extract/Move Folder**: Place `cJobCreator` inside your server resources directory (e.g. `[skripte]/cJobCreator`).
2. **Import Database Schema**: Run the provided `database.sql` script. This sets up the following schema tables:
   - `hposlovi_jobs` - Faction registration info.
   - `hposlovi_positions` - Vector3 positions of boss menus, wardrobes, inventories, and garages.
   - `hposlovi_inventories` - Faction stash sizes, weights, and minimum grade accesses.
   - `hposlovi_vehicles` - Faction garage fleet configurations.
   - `hposlovi_outfits` - Saved faction uniforms.
3. **Configure Dependencies**: Add to your `server.cfg`:
   ```cfg
   ensure cJobCreator
   ```

---

## 📦 Dependencies

- **Framework**: `es_extended` (ESX)
- **Database**: `oxmysql`
- **Inventory**: `ox_inventory`
- **Gridsystem/Markers**: `ox_gridsystem`
- **Appearance**: `illenium-appearance`
- **Society**: `esx_society`
- **Utilities**: `ox_lib`

---

## 📋 Configuration (`config/config.lua`)

```lua
Config = {}

-- ===========================================
-- DEBUG & LOCALE SETTINGS
-- ===========================================
Config.Debug = false -- Enable detailed console logs
Config.Locale = 'en' -- Options: 'en', 'hr'

-- ===========================================
-- MARKER SETTINGS
-- ===========================================
Config.MarkerType = 21 -- Set to -1 for custom textures
Config.MarkerDrawDistance = 3
Config.InteractDistance = 2
Config.MarkerSize = vector3(0.8, 0.8, 0.8)
Config.MarkerColor = { r = 255, g = 255, b = 255 }

-- Default fallback grades if none are defined during job creation
Config.IfNotGrades =  {
    { grade = 0, name = 'recruit', label = 'Recruit', salary = '1000' },
    { grade = 1, name = 'officer', label = 'Officer', salary = '2000' },
    { grade = 2, name = 'sergeant', label = 'Sergeant', salary = '2500' },
    { grade = 3, name = 'lieutenant', label = 'Lieutenant', salary = '3000' },
    { grade = 4, name = 'boss', label = 'Chief', salary = '3500' },
}

-- Commands
Config.CreateCommand = 'makejob'
Config.EditCommand = 'editjob'
Config.AutoSetJob = true -- Auto-set job of the creator to the new faction

-- Permitted admins (checks player group against this list)
Config.AdminGroups = {
    'superadmin',
    'developer'
}
```

---

## 📝 Administrative Commands

* **`/makejob`**: Opens the NUI Creator screen to register a new faction/job.
* **`/editjob`**: Opens the NUI Job Manager screen where you can select, modify, or permanently delete registered factions.

---

## 🎨 Translation / Localization System

Locales are loaded directly from the `locales/` directory:
- `en.json` (English)
- `hr.json` (Croatian)

### Adding a New Language
1. Create a new `.json` file in `/locales/` (e.g. `de.json`).
2. Translate all key-value mappings matching the structure in `en.json`.
3. Set `Config.Locale = 'de'` in `config/config.lua`.

---

## 🛠️ Developer Technical Notes

- **ESX society integration**: Triggered via `YourBossmenuFunc` custom configurations in `config.lua` or server events calling `esx_society:openBossMenu`.
- **Illenium wardrobe handler**: Dynamic grade evaluation reads positions from the database first, confirms permissions, and opens wardrobes using `illenium-appearance` API hooks.
- **Refresh Flow**: Creating or modifying a job auto-executes `ESX.RefreshJobs()` and triggers `hPoslovi:client:refreshJobs` globally to redraw and synchronize markers on all clients.
