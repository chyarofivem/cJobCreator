let activeMode = 'creator'; // 'creator', 'garage', 'wardrobe'
let locales = {};
let isModifying = false;
let currentJobName = '';

// In-memory job creator state
let datafaz = {
    job: '',
    label: '',
    bossmenu: { gradoboss: 4 },
    camerino: null,
    garage: { pos1: null, pos2: null, heading: 0.0 },
    inv: [],
    gradi: []
};

// Mode-specific data
let garageVehicles = [];
let wardrobeOutfits = [];
let canManageOutfits = false;

// Locales fall-back
function locale(key, defaultVal = '') {
    return locales[key] || defaultVal || key;
}

$(document).ready(function () {
    // Escape Key Listener to Close UI
    $(document).keyup(function (e) {
        if (e.key === "Escape") {
            closeUI();
        }
    });

    // Close Button Bind
    $('#close-ui-btn').click(function () {
        closeUI();
    });

    // Creator navigation tabs click listener
    $('.tab-btn').click(function () {
        const targetTab = $(this).data('tab');
        $('.tab-btn').removeClass('active');
        $(this).addClass('active');

        $('.tab-content').removeClass('active');
        $(`#tab-${targetTab}`).addClass('active');

        if (targetTab === 'finish') {
            updateSummaryTab();
        }
    });

    // Get input field modifications for general tab in creator mode
    $('#job-name').on('input', function() {
        datafaz.job = $(this).val().trim();
    });

    $('#job-label').on('input', function() {
        datafaz.label = $(this).val().trim();
    });

    $('#boss-grade').on('input', function() {
        datafaz.bossmenu.gradoboss = parseInt($(this).val()) || 0;
    });

    // Get current coords buttons binding
    $('#set-bossmenu-coords button').click(function () {
        getCoordinates('bossmenu', function (coords) {
            datafaz.bossmenu.pos = { x: coords.x, y: coords.y, z: coords.z };
            $('#bossmenu-coords').text(`X: ${coords.x.toFixed(2)}, Y: ${coords.y.toFixed(2)}, Z: ${coords.z.toFixed(2)}`);
        });
    });

    $('#set-wardrobe-coords button').click(function () {
        getCoordinates('wardrobe', function (coords) {
            datafaz.camerino = { x: coords.x, y: coords.y, z: coords.z };
            $('#wardrobe-coords').text(`X: ${coords.x.toFixed(2)}, Y: ${coords.y.toFixed(2)}, Z: ${coords.z.toFixed(2)}`);
        });
    });

    $('#set-garage-pos1 button').click(function () {
        getCoordinates('garage_pickup', function (coords) {
            datafaz.garage.pos1 = { x: coords.x, y: coords.y, z: coords.z };
            $('#garage-pos1-coords').text(`X: ${coords.x.toFixed(2)}, Y: ${coords.y.toFixed(2)}, Z: ${coords.z.toFixed(2)}`);
        });
    });

    $('#set-garage-pos2 button').click(function () {
        getCoordinates('garage_spawn', function (coords) {
            datafaz.garage.pos2 = { x: coords.x, y: coords.y, z: coords.z };
            datafaz.garage.heading = coords.heading;
            $('#garage-pos2-coords').text(`X: ${coords.x.toFixed(2)}, Y: ${coords.y.toFixed(2)}, Z: ${coords.z.toFixed(2)} | H: ${coords.heading.toFixed(2)}`);
        });
    });

    $('#set-inv-coords').click(function () {
        getCoordinates('inventory', function (coords) {
            $('#inv-coords').text(`X: ${coords.x.toFixed(2)}, Y: ${coords.y.toFixed(2)}, Z: ${coords.z.toFixed(2)}`);
            $('#inv-coords').data('coords', { x: coords.x, y: coords.y, z: coords.z });
        });
    });

    // Stash adding
    $('#add-inv-btn').click(function () {
        const label = $('#inv-label').val().trim();
        const weight = parseFloat($('#inv-weight').val()) || 100;
        const slots = parseInt($('#inv-slots').val()) || 50;
        const grade = parseInt($('#inv-grade').val()) || 0;
        const coords = $('#inv-coords').data('coords');

        if (!label) {
            showNotifyModal(locale('compile', 'Molimo ispravno ispunite sva polja'));
            return;
        }

        if (!coords) {
            showNotifyModal(locale('invdesc', 'Skladište će biti postavljeno na vašoj trenutnoj poziciji. Molimo postavite poziciju.'));
            return;
        }

        datafaz.inv.push({
            label: label,
            nomedeposito: label,
            peso: weight * 1000, // in grams
            slots: slots,
            grado: grade,
            pos: coords
        });

        // Reset fields
        $('#inv-label').val('');
        $('#inv-weight').val('100');
        $('#inv-slots').val('50');
        $('#inv-grade').val('0');
        $('#inv-coords').text('Pozicija: Nije postavljena').removeData('coords');

        renderInventoryList();
    });

    // Creator vehicle adding
    $('#add-vehicle-btn').click(function () {
        const label = $('#veh-label').val().trim();
        const model = $('#veh-model').val().trim().toUpperCase();
        const color = $('#veh-color').val();
        const fullkit = $('#veh-fullkit').is(':checked');
        const plate = $('#veh-plate').val().trim();
        const grade = parseInt($('#veh-grade').val()) || 0;

        if (!label || !model) {
            showNotifyModal(locale('compile', 'Molimo ispravno ispunite sva polja'));
            return;
        }

        // Convert hex color to rgb
        const rgb = hexToRgb(color);

        // Send immediately to database via client if modifying, or hold in datafaz
        const newVeh = {
            label: label,
            model: model,
            fullkit: fullkit,
            plate: plate,
            min_grade: grade,
            color_r: rgb.r,
            color_g: rgb.g,
            color_b: rgb.b
        };

        if (isModifying) {
            // Modify mode saves immediately
            $.post(`https://${GetParentResourceName()}/addVehicle`, JSON.stringify({
                job: datafaz.job,
                vehicle: newVeh
            }));
            setTimeout(() => {
                refreshVehiclesList();
            }, 300);
        } else {
            // Create mode holds in memory
            if (!datafaz.garage.veicoli) datafaz.garage.veicoli = [];
            datafaz.garage.veicoli.push(newVeh);
            renderCreatorVehiclesList();
        }

        // Reset fields
        $('#veh-label').val('');
        $('#veh-model').val('');
        $('#veh-color').val('#ffffff');
        $('#veh-plate').val('');
        $('#veh-grade').val('0');
        $('#veh-fullkit').prop('checked', false);
    });

    // Creator grade adding
    $('#add-grade-btn').click(function () {
        const name = $('#grade-name').val().trim().toLowerCase().replace(/\s+/g, '');
        const label = $('#grade-label').val().trim();
        const salary = parseInt($('#grade-salary').val()) || 0;

        if (!name || !label) {
            showNotifyModal(locale('compile', 'Molimo ispravno ispunite sva polja'));
            return;
        }

        datafaz.gradi.push({
            grade: datafaz.gradi.length,
            name: name,
            label: label,
            salary: salary
        });

        // Reset fields
        $('#grade-name').val('');
        $('#grade-label').val('');
        $('#grade-salary').val('1000');

        renderGradesList();
    });

    // Save job configuration
    $('#save-job-btn').click(function () {
        if (!datafaz.job || !datafaz.label) {
            showNotifyModal(locale('compile', 'Molimo ispravno ispunite sva polja'));
            return;
        }

        if (datafaz.gradi.length === 0) {
            showConfirmModal(locale('confirmpos', 'RANGOVI NISU KONFIGURIRANI'), locale('notgradesnot', 'Rangovi nisu konfigurirani - biće postavljeni zadani rangovi. Nastaviti?'), function() {
                // Confirm callback
                saveJobConfig();
            });
        } else {
            saveJobConfig();
        }
    });

    // Delete job configuration
    $('#delete-job-btn').click(function () {
        showConfirmModal(locale('deletejob', 'OBRIŠI POSAO'), locale('deletejob2', 'Želite li trajno obrisati ovaj posao? Ova akcija je nepovratna!'), function () {
            $.post(`https://${GetParentResourceName()}/deleteJob`, JSON.stringify({
                job: datafaz.job
            }));
            closeUI();
        });
    });

    // Wardrobe Buttons Binds
    $('#wardrobe-open-ped').click(function () {
        $.post(`https://${GetParentResourceName()}/wardrobeAction`, JSON.stringify({
            action: 'openPedMenu',
            job: currentJobName
        }));
        closeUI();
    });

    $('#wardrobe-save-current').click(function () {
        // Modal Prompt for outfit name
        showPromptModal(locale('save_outfit_title', 'Spremi Odjeću'), locale('outfit_name_label', 'Unesite naziv za ovu uniformu'), function (outfitName) {
            if (!outfitName || outfitName.trim().length < 3) {
                showNotifyModal(locale('compile', 'Naziv mora imati bar 3 slova!'));
                return;
            }
            $.post(`https://${GetParentResourceName()}/wardrobeAction`, JSON.stringify({
                action: 'saveOutfit',
                job: currentJobName,
                outfitName: outfitName.trim()
            }));
            closeUI();
        });
    });

    // Message Listener from Lua Client
    window.addEventListener('message', function (event) {
        const item = event.data;

        if (item.action === "open") {
            locales = item.locales || {};
            activeMode = item.mode; // 'creator', 'garage', 'wardrobe'
            isModifying = item.isModifying || false;
            currentJobName = item.job || '';

            // Apply locale texts to standard layout
            applyLocalesToHTML();

            // Open specific UI container
            $('.ui').fadeIn(200);

            if (activeMode === 'creator') {
                setupCreatorMode(item.data);
            } else if (activeMode === 'garage') {
                setupGarageMode(item.vehicles || [], item.job);
            } else if (activeMode === 'wardrobe') {
                setupWardrobeMode(item.outfits || [], item.job, item.canManage);
            }
        }

        if (item.action === "openJobList") {
            locales = item.locales || {};
            applyLocalesToHTML();

            let bodyHTML = `<div class="list-items" style="max-height: 300px;">`;
            item.jobs.forEach((job) => {
                bodyHTML += `
                    <div class="list-item" onclick="selectJobToEdit('${job.job}')" style="cursor:pointer;margin-bottom:8px;">
                        <div class="list-item-info">
                            <div class="list-item-icon"><i class="fa-solid fa-briefcase"></i></div>
                            <div>
                                <span class="list-item-title">${job.label}</span>
                                <span class="list-item-sub">ID: ${job.job}</span>
                            </div>
                        </div>
                    </div>
                `;
            });
            bodyHTML += `</div>`;

            $('.ui').fadeIn(200);

            openModal(locale('titleeditjob', 'Odaberi Posao'), bodyHTML, null, false);
            $('.modal-close, #modal-btn-cancel').off('click').on('click', function() {
                closeUI();
            });
        }

        if (item.action === "openCreatePrompt") {
            locales = item.locales || {};
            applyLocalesToHTML();

            let bodyHTML = `
                <div class="form-group">
                    <label>${locale('nomefaz2', 'Prikazano ime posla')}</label>
                    <input type="text" id="create-label" placeholder="Los Santos Police" style="margin-top:5px;margin-bottom:10px;" required>
                    <label>${locale('nomefaz3', 'Unesite ID posla (ID za setjob)')}</label>
                    <input type="text" id="create-name" placeholder="police" style="margin-top:5px;" required>
                </div>
            `;

            $('.ui').fadeIn(200);

            openModal(locale('nomefaz', 'Kreiraj Posao'), bodyHTML, function() {
                const label = $('#create-label').val().trim();
                const name = $('#create-name').val().trim().toLowerCase().replace(/\s+/g, '');
                if (!label || !name) {
                    showNotifyModal(locale('compile', 'Molimo ispravno ispunite sva polja'));
                    return;
                }
                
                isModifying = false;
                currentJobName = name;
                setupCreatorMode({ label: label, job: name });
            }, true);

            $('.modal-close, #modal-btn-cancel').off('click').on('click', function() {
                closeUI();
            });
        }

        if (item.action === "close") {
            $('.ui').fadeOut(150);
            closeModal();
        }
    });
});

// Window Bindings for global onclick events
window.selectJobToEdit = function(jobName) {
    closeModal();
    // Re-bind modal close
    $('.modal-close, #modal-btn-cancel').off('click').on('click', function() {
        closeModal();
    });
    $.post(`https://${GetParentResourceName()}/editSelectedJob`, JSON.stringify({ job: jobName }));
};

window.deleteStash = function(index) {
    showConfirmModal(locale('deleteinv', 'Obriši skladište'), locale('deleteinv2', 'Želite li ukloniti ovo skladište s popisa?'), function () {
        datafaz.inv.splice(index, 1);
        renderInventoryList();
    });
};

window.deleteCreatorVehicle = function(index) {
    showConfirmModal(locale('deleteveh', 'Obriši vozilo'), locale('deleteveh2', 'Želite li ukloniti ovo vozilo s popisa?'), function () {
        datafaz.garage.veicoli.splice(index, 1);
        renderCreatorVehiclesList();
    });
};

window.deleteDatabaseVehicle = function(vehicleId) {
    showConfirmModal(locale('deleteveh', 'Obriši vozilo'), locale('deleteveh2', 'Želite li ukloniti ovo vozilo s popisa?'), function () {
        $.post(`https://${GetParentResourceName()}/deleteVehicle`, JSON.stringify({
            id: vehicleId,
            job: datafaz.job
        }));
        setTimeout(() => {
            refreshVehiclesList();
        }, 300);
    });
};

window.deleteGrade = function(index) {
    showConfirmModal(locale('deletegrade', 'Obriši rang'), locale('gradeconfirm', 'Želite li ukloniti ovaj rang s popisa?'), function () {
        datafaz.gradi.splice(index, 1);
        datafaz.gradi.forEach((g, idx) => { g.grade = idx; });
        renderGradesList();
    });
};

window.editGrade = function(index) {
    const grade = datafaz.gradi[index];
    if (!grade) return;

    let bodyHTML = `
        <div class="form-group">
            <label>${locale('namegrade', 'Ime (malim slovima, bez razmaka)')}</label>
            <input type="text" id="edit-grade-name" value="${grade.name}" required>
        </div>
        <div class="form-group">
            <label>${locale('labelgrade', 'Oznaka (prikazano ime)')}</label>
            <input type="text" id="edit-grade-label" value="${grade.label}" required>
        </div>
        <div class="form-group">
            <label>${locale('salary', 'Plaća ($)')}</label>
            <input type="number" id="edit-grade-salary" value="${grade.salary}" required>
        </div>
    `;

    openModal(locale('putname', 'Uredi detalje ranga'), bodyHTML, function() {
        const name = $('#edit-grade-name').val().trim().toLowerCase().replace(/\s+/g, '');
        const label = $('#edit-grade-label').val().trim();
        const salary = parseInt($('#edit-grade-salary').val()) || 0;

        if (!name || !label) {
            showNotifyModal(locale('compile', 'Molimo ispravno ispunite sva polja'));
            return;
        }

        datafaz.gradi[index].name = name;
        datafaz.gradi[index].label = label;
        datafaz.gradi[index].salary = salary;

        renderGradesList();
    }, true);
};

window.closeModal = function() {
    $('#custom-modal').fadeOut(100);
};

// Close UI Logic
function closeUI() {
    $('.ui').fadeOut(150);
    closeModal();
    $.post(`https://${GetParentResourceName()}/close`, JSON.stringify({}));
}

// Request Coords helper
function getCoordinates(type, callback) {
    $.post(`https://${GetParentResourceName()}/getCoords`, JSON.stringify({ type: type }), function (coords) {
        if (coords) {
            callback(coords);
        }
    });
}

// Helper: Hex to RGB object conversion
function hexToRgb(hex) {
    let result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
    } : { r: 255, g: 255, b: 255 };
}

// Helper: RGB to hex string
function rgbToHex(r, g, b) {
    return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}

// Apply language translations dynamically to core elements
function applyLocalesToHTML() {
    $('[data-translate]').each(function() {
        const key = $(this).data('translate');
        const translated = locale(key);
        if (translated) {
            if ($(this).is('input') || $(this).is('textarea')) {
                $(this).attr('placeholder', translated);
            } else {
                $(this).text(translated);
            }
        }
    });
}

// SETUP CREATOR MODE
function setupCreatorMode(existingJobData) {
    $('#creator-tabs').show();
    $('#sidebar-mode-info').hide();
    
    // Switch to general tab
    $('.tab-btn').removeClass('active');
    $('.tab-btn[data-tab="general"]').addClass('active');
    $('.tab-content').removeClass('active');
    $('#tab-general').addClass('active');

    $('#sidebar-main-title').text(isModifying ? locale('titleeditjob', 'Uredi Posao') : locale('nomefaz', 'Kreiraj Posao'));
    $('#sidebar-sub-title').text(locale('sidebar_creator_desc', 'Upravljanje postavkama'));

    if (isModifying && existingJobData) {
        // Normalize bossmenu: handle empty array (Lua empty table encodes as []) or missing fields
        let rawBossMenu = existingJobData.bossmenu;
        let normalBossMenu;
        if (rawBossMenu && !Array.isArray(rawBossMenu) && rawBossMenu.pos && typeof rawBossMenu.pos === 'object') {
            // Valid bossmenu with a real position
            normalBossMenu = { gradoboss: rawBossMenu.gradoboss || 4, pos: rawBossMenu.pos };
        } else {
            // No valid position: keep gradoboss if available, drop pos
            normalBossMenu = { gradoboss: (rawBossMenu && !Array.isArray(rawBossMenu) && rawBossMenu.gradoboss) || 4 };
        }

        // Normalize garage: same issue
        let rawGarage = existingJobData.garage;
        let normalGarage;
        if (rawGarage && !Array.isArray(rawGarage)) {
            normalGarage = {
                pos1:    (rawGarage.pos1 && typeof rawGarage.pos1 === 'object') ? rawGarage.pos1 : null,
                pos2:    (rawGarage.pos2 && typeof rawGarage.pos2 === 'object') ? rawGarage.pos2 : null,
                heading: rawGarage.heading || 0.0
            };
        } else {
            normalGarage = { pos1: null, pos2: null, heading: 0.0 };
        }

        datafaz = {
            job: existingJobData.job || '',
            label: existingJobData.label || '',
            bossmenu: normalBossMenu,
            camerino: existingJobData.camerino || null,
            garage: normalGarage,
            inv: existingJobData.inv || [],
            gradi: existingJobData.gradi || []
        };
        
        $('#delete-job-btn').show();
    } else {
        datafaz = {
            job: currentJobName || '',
            label: existingJobData ? existingJobData.label : '',
            bossmenu: { gradoboss: 4 },
            camerino: null,
            garage: { pos1: null, pos2: null, heading: 0.0, veicoli: [] },
            inv: [],
            gradi: []
        };
        
        $('#delete-job-btn').hide();
    }

    // Populate general inputs
    $('#job-name').val(datafaz.job).prop('disabled', isModifying);
    $('#job-label').val(datafaz.label);
    $('#boss-grade').val(datafaz.bossmenu.gradoboss);

    // Render Boss Coordinates text
    if (datafaz.bossmenu.pos) {
        $('#bossmenu-coords').text(`X: ${datafaz.bossmenu.pos.x.toFixed(2)}, Y: ${datafaz.bossmenu.pos.y.toFixed(2)}, Z: ${datafaz.bossmenu.pos.z.toFixed(2)}`);
    } else {
        $('#bossmenu-coords').text(locale('not_set', 'Nije postavljeno'));
    }

    // Render Wardrobe Coordinates text
    if (datafaz.camerino) {
        $('#wardrobe-coords').text(`X: ${datafaz.camerino.x.toFixed(2)}, Y: ${datafaz.camerino.y.toFixed(2)}, Z: ${datafaz.camerino.z.toFixed(2)}`);
    } else {
        $('#wardrobe-coords').text(locale('not_set', 'Nije postavljeno'));
    }

    // Render Garage Coordinates text
    if (datafaz.garage.pos1) {
        $('#garage-pos1-coords').text(`X: ${datafaz.garage.pos1.x.toFixed(2)}, Y: ${datafaz.garage.pos1.y.toFixed(2)}, Z: ${datafaz.garage.pos1.z.toFixed(2)}`);
    } else {
        $('#garage-pos1-coords').text(locale('not_set', 'Nije postavljeno'));
    }

    if (datafaz.garage.pos2) {
        $('#garage-pos2-coords').text(`X: ${datafaz.garage.pos2.x.toFixed(2)}, Y: ${datafaz.garage.pos2.y.toFixed(2)}, Z: ${datafaz.garage.pos2.z.toFixed(2)} | H: ${datafaz.garage.heading.toFixed(2)}`);
    } else {
        $('#garage-pos2-coords').text(locale('not_set', 'Nije postavljeno'));
    }

    // Render lists
    renderInventoryList();
    
    if (isModifying) {
        refreshVehiclesList();
    } else {
        renderCreatorVehiclesList();
    }
    
    renderGradesList();
}

function renderInventoryList() {
    const list = $('#inventory-list');
    list.empty();

    if (datafaz.inv.length === 0) {
        list.append(`<div style="color:var(--text-muted);font-size:13px;padding:10px 0;">${locale('no_inventories', 'Nema dodanih skladišta.')}</div>`);
        return;
    }

    datafaz.inv.forEach((inv, index) => {
        list.append(`
            <div class="list-item">
                <div class="list-item-info">
                    <div class="list-item-icon"><i class="fa-solid fa-box"></i></div>
                    <div>
                        <span class="list-item-title">${inv.label}</span>
                        <span class="list-item-sub">Slots: ${inv.slots} | ${inv.peso / 1000}kg | Grade: ${inv.grado}</span>
                    </div>
                </div>
                <button class="btn-delete-item" onclick="deleteStash(${index})">
                    <i class="fa-solid fa-trash"></i>
                </button>
            </div>
        `);
    });
}

function deleteStash(index) {
    showConfirmModal(locale('deleteinv', 'Obriši skladište'), locale('deleteinv2', 'Želite li ukloniti ovo skladište s popisa?'), function () {
        datafaz.inv.splice(index, 1);
        renderInventoryList();
    });
}

// Creator Vehicle rendering
function renderCreatorVehiclesList() {
    const list = $('#creator-vehicles-list');
    list.empty();

    const veicoli = datafaz.garage.veicoli || [];

    if (veicoli.length === 0) {
        list.append(`<div style="color:var(--text-muted);font-size:13px;padding:10px 0;">${locale('vehiclenotavaible', 'Nema dodanih vozila.')}</div>`);
        return;
    }

    veicoli.forEach((veh, index) => {
        const fullkitText = veh.fullkit ? ' | Full Tuning' : '';
        const colorHex = rgbToHex(veh.color_r || 255, veh.color_g || 255, veh.color_b || 255);
        list.append(`
            <div class="list-item">
                <div class="list-item-info">
                    <div class="list-item-icon" style="color:${colorHex}"><i class="fa-solid fa-car"></i></div>
                    <div>
                        <span class="list-item-title">${veh.label}</span>
                        <span class="list-item-sub">${veh.model}${fullkitText} | Grade: ${veh.min_grade}</span>
                    </div>
                </div>
                <button class="btn-delete-item" onclick="deleteCreatorVehicle(${index})">
                    <i class="fa-solid fa-trash"></i>
                </button>
            </div>
        `);
    });
}

function deleteCreatorVehicle(index) {
    showConfirmModal(locale('deleteveh', 'Obriši vozilo'), locale('deleteveh2', 'Želite li ukloniti ovo vozilo s popisa?'), function () {
        datafaz.garage.veicoli.splice(index, 1);
        renderCreatorVehiclesList();
    });
}

// Fetch Vehicles from server callback (Edit mode)
function refreshVehiclesList() {
    $.post(`https://${GetParentResourceName()}/getJobVehicles`, JSON.stringify({ job: datafaz.job }), function (vehicles) {
        const list = $('#creator-vehicles-list');
        list.empty();

        if (!vehicles || vehicles.length === 0) {
            list.append(`<div style="color:var(--text-muted);font-size:13px;padding:10px 0;">${locale('vehiclenotavaible', 'Nema dodanih vozila.')}</div>`);
            return;
        }

        vehicles.forEach((veh) => {
            const fullkitText = veh.fullkit === 1 || veh.fullkit === true ? ' | Full Tuning' : '';
            const colorHex = rgbToHex(veh.color_r || 255, veh.color_g || 255, veh.color_b || 255);
            list.append(`
                <div class="list-item">
                    <div class="list-item-info">
                        <div class="list-item-icon" style="color:${colorHex}"><i class="fa-solid fa-car"></i></div>
                        <div>
                            <span class="list-item-title">${veh.label}</span>
                            <span class="list-item-sub">${veh.model}${fullkitText} | Grade: ${veh.min_grade}</span>
                        </div>
                    </div>
                    <button class="btn-delete-item" onclick="deleteDatabaseVehicle(${veh.id})">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                </div>
            `);
        });
    });
}

function deleteDatabaseVehicle(vehicleId) {
    showConfirmModal(locale('deleteveh', 'Obriši vozilo'), locale('deleteveh2', 'Želite li ukloniti ovo vozilo s popisa?'), function () {
        $.post(`https://${GetParentResourceName()}/deleteVehicle`, JSON.stringify({
            id: vehicleId,
            job: datafaz.job
        }));
        setTimeout(() => {
            refreshVehiclesList();
        }, 300);
    });
}

// Render grades list with native HTML5 Drag and Drop events
function renderGradesList() {
    const list = $('#grades-list');
    list.empty();

    if (datafaz.gradi.length === 0) {
        list.append(`<div style="color:var(--text-muted);font-size:13px;padding:10px 0;">${locale('no_grades', 'Nema dodanih rangova.')}</div>`);
        return;
    }

    // Sort grades in DOM by grade index
    datafaz.gradi.sort((a, b) => a.grade - b.grade);

    datafaz.gradi.forEach((grade, index) => {
        list.append(`
            <div class="list-item" draggable="true" data-index="${index}">
                <div class="list-item-info">
                    <div class="drag-handle"><i class="fa-solid fa-bars"></i></div>
                    <div class="list-item-icon"><i class="fa-solid fa-crown"></i></div>
                    <div>
                        <span class="list-item-title">${grade.label}</span>
                        <span class="list-item-sub">Grade ID: ${grade.grade} | Naziv: ${grade.name} | Plaća: $${grade.salary}</span>
                    </div>
                </div>
                <button class="btn-delete-item" onclick="deleteGrade(${index})">
                    <i class="fa-solid fa-trash"></i>
                </button>
            </div>
        `);
    });

    setupDragAndDrop();

    list.find('.list-item').off('click').on('click', function(e) {
        // Prevent trigger on delete button or drag handle
        if ($(e.target).closest('.btn-delete-item').length > 0 || $(e.target).closest('.drag-handle').length > 0) return;
        
        const index = parseInt($(this).data('index'));
        window.editGrade(index);
    });
}

function deleteGrade(index) {
    showConfirmModal(locale('deletegrade', 'Obriši rang'), locale('gradeconfirm', 'Želite li ukloniti ovaj rang s popisa?'), function () {
        datafaz.gradi.splice(index, 1);
        
        // Re-calculate grades indexes consecutively
        datafaz.gradi.forEach((g, idx) => {
            g.grade = idx;
        });
        
        renderGradesList();
    });
}

// Custom Mouse-Event Drag and Drop logic (FiveM CEF Compatible)
function setupDragAndDrop() {
    const list = $('#grades-list');
    let activeItem = null;

    list.find('.list-item').off('mousedown').on('mousedown', function(e) {
        // Only allow drag if clicking on the drag-handle
        if ($(e.target).closest('.drag-handle').length === 0) return;

        e.preventDefault();
        activeItem = $(this);
        activeItem.addClass('dragging');
        
        // Track move on window to ensure smooth tracking even if mouse moves outside list
        $(window).on('mousemove.drag', function(moveEvent) {
            if (!activeItem) return;
            
            // Find which element we are hovering over in the list
            const listItems = list.find('.list-item').not(activeItem);
            let targetItem = null;
            
            listItems.each(function() {
                const rect = this.getBoundingClientRect();
                if (moveEvent.clientY >= rect.top && moveEvent.clientY <= rect.bottom) {
                    targetItem = $(this);
                    return false; // break loop
                }
            });
            
            if (targetItem) {
                const rect = targetItem[0].getBoundingClientRect();
                const middle = rect.top + rect.height / 2;
                
                if (moveEvent.clientY < middle) {
                    activeItem.insertBefore(targetItem);
                } else {
                    activeItem.insertAfter(targetItem);
                }
            }
        });
        
        $(window).on('mouseup.drag', function() {
            $(window).off('mousemove.drag');
            $(window).off('mouseup.drag');
            
            if (activeItem) {
                activeItem.removeClass('dragging');
                activeItem = null;
                recalculateGradesOrder();
            }
        });
    });
}

function recalculateGradesOrder() {
    const reorderedGradi = [];
    const DOMitems = document.querySelectorAll('#grades-list .list-item');
    DOMitems.forEach((item, index) => {
        const originalIndex = parseInt($(item).data('index'));
        const originalGrade = datafaz.gradi[originalIndex];
        if (originalGrade) {
            reorderedGradi.push({
                grade: index, // New order index from 0 to N
                name: originalGrade.name,
                label: originalGrade.label,
                salary: originalGrade.salary
            });
        }
    });
    datafaz.gradi = reorderedGradi;
    renderGradesList();
}

// Populate creator summary tab
function updateSummaryTab() {
    $('#summary-job-name').text(datafaz.job || locale('not_entered', 'Nije uneseno'));
    $('#summary-job-label').text(datafaz.label || locale('not_entered', 'Nije uneseno'));
    $('#summary-total-invs').text(datafaz.inv.length);
    $('#summary-total-grades').text(datafaz.gradi.length);

    if (isModifying) {
        // Vehicles are query based, fetch dynamically for summary display
        $.post(`https://${GetParentResourceName()}/getJobVehicles`, JSON.stringify({ job: datafaz.job }), function (vehicles) {
            $('#summary-total-vehs').text(vehicles ? vehicles.length : 0);
        });
    } else {
        const veicoli = datafaz.garage.veicoli || [];
        $('#summary-total-vehs').text(veicoli.length);
    }
}

// Finish Faction Config Submission
function saveJobConfig() {
    $.post(`https://${GetParentResourceName()}/saveJob`, JSON.stringify({
        data: datafaz,
        isModifying: isModifying
    }));
    closeUI();
}

// SETUP GARAGE RETRIEVE MODE
function setupGarageMode(vehicles, jobName) {
    $('#creator-tabs').hide();
    $('.tab-content').removeClass('active');
    
    $('#sidebar-main-title').text(locale('garagetitle', 'Garaža Posla'));
    $('#sidebar-sub-title').text(jobName.toUpperCase());
    
    $('#sidebar-mode-desc').text(locale('garage_desc', 'Preuzmite neko od vozila registriranih za vašu frakciju.'));
    $('#sidebar-mode-info').show();

    $('#garage-mode-container').addClass('active');
    $('#wardrobe-mode-container').removeClass('active');

    const grid = $('#garage-vehicles-grid');
    grid.empty();

    if (vehicles.length === 0) {
        grid.append(`<div style="color:var(--text-secondary);font-size:14px;grid-column: span 2;text-align:center;padding:40px 0;">${locale('vehiclenotavaible', 'Nema dostupnih vozila za vaš rang.')}</div>`);
        return;
    }

    vehicles.forEach(veh => {
        const colorHex = rgbToHex(veh.color_r || 255, veh.color_g || 255, veh.color_b || 255);
        const gradeText = veh.min_grade ? locale('min_grade', `Minimalni rang: ${veh.min_grade}`) : locale('no_grade_required', 'Rang nije potreban');
        
        const card = $(`
            <div class="vehicle-card">
                <div class="vehicle-card-details">
                    <span class="vehicle-card-name">${veh.label}</span>
                    <span class="vehicle-card-model">${veh.model}</span>
                    <span class="vehicle-card-grade"><i class="fa-solid fa-crown"></i> ${gradeText}</span>
                </div>
                <div class="vehicle-card-color" style="background-color:${colorHex}"></div>
            </div>
        `);

        card.click(function () {
            // Spawn vehicle callback
            $.post(`https://${GetParentResourceName()}/spawnVehicle`, JSON.stringify({
                vehicle: veh,
                garage: datafaz.garage // coordinates reference handled client-side but sent as security checks
            }));
            closeUI();
        });

        grid.append(card);
    });
}

// SETUP WARDROBE MODE
function setupWardrobeMode(outfits, jobName, canManage) {
    $('#creator-tabs').hide();
    $('.tab-content').removeClass('active');
    
    $('#sidebar-main-title').text(locale('wardrobe_title', 'Garderoba'));
    $('#sidebar-sub-title').text(jobName.toUpperCase());
    
    $('#sidebar-mode-desc').text(locale('wardrobe_desc', 'Obucite uniformu ili spremite trenutni izgled.'));
    $('#sidebar-mode-info').show();

    $('#garage-mode-container').removeClass('active');
    $('#wardrobe-mode-container').addClass('active');

    if (canManage) {
        $('#wardrobe-save-current').show();
    } else {
        $('#wardrobe-save-current').hide();
    }

    const grid = $('#wardrobe-outfits-grid');
    grid.empty();

    // Check if empty
    let hasOutfits = false;
    for (let outfitName in outfits) {
        hasOutfits = true;
        break;
    }

    if (!hasOutfits) {
        grid.append(`<div style="color:var(--text-secondary);font-size:14px;grid-column: span 2;text-align:center;padding:40px 0;">${locale('no_outfits', 'Nema spremljenih uniformi.')}</div>`);
        return;
    }

    for (let outfitName in outfits) {
        const outfitData = outfits[outfitName];
        
        let actionsHTML = `<button class="btn btn-primary btn-sm btn-wear">${locale('btn_wear', 'Obuci')}</button>`;
        if (canManage) {
            actionsHTML += `
                <button class="btn btn-danger btn-sm btn-delete" style="padding:0 10px;">
                    <i class="fa-solid fa-trash-can"></i>
                </button>
            `;
        }

        const card = $(`
            <div class="outfit-card">
                <div class="outfit-card-info">
                    <div class="outfit-card-icon"><i class="fa-solid fa-shirt"></i></div>
                    <span class="outfit-card-name">${outfitName}</span>
                </div>
                <div class="outfit-card-actions">
                    ${actionsHTML}
                </div>
            </div>
        `);

        // Wear action
        card.find('.btn-wear').click(function () {
            $.post(`https://${GetParentResourceName()}/wardrobeAction`, JSON.stringify({
                action: 'wearOutfit',
                job: currentJobName,
                outfitName: outfitName,
                outfitData: outfitData
            }));
            closeUI();
        });

        // Delete action
        card.find('.btn-delete').click(function () {
            showConfirmModal(locale('delete_outfit_title', 'Obriši odjeću'), locale('delete_outfit_confirm', `Jeste li sigurni da želite obrisati izgled "${outfitName}"?`), function () {
                $.post(`https://${GetParentResourceName()}/wardrobeAction`, JSON.stringify({
                    action: 'deleteOutfit',
                    job: currentJobName,
                    outfitName: outfitName
                }));
                closeUI();
            });
        });

        grid.append(card);
    }
}

// ==========================================
// MODAL DIALOGS OVERLAY (Replaces Alert & Input dialogs)
// ==========================================

function openModal(title, bodyHTML, onConfirm, showCancel = true) {
    $('#modal-title').text(title);
    $('#modal-body').html(bodyHTML);
    
    // Toggle Cancel button
    if (showCancel) {
        $('#modal-btn-cancel').show();
    } else {
        $('#modal-btn-cancel').hide();
    }

    // Unbind and rebind confirmation
    $('#modal-btn-confirm').off('click').on('click', function () {
        if (onConfirm) {
            onConfirm();
        }
        closeModal();
    });

    $('#custom-modal').fadeIn(150);
}

function closeModal() {
    $('#custom-modal').fadeOut(100);
}

// Show notify info modal (replacing alert details)
function showNotifyModal(message) {
    openModal(locale('info_title', 'Obavijest'), `<p style="font-size:15px;color:var(--text-primary);padding:10px 0;">${message}</p>`, null, false);
}

// Show confirm / cancel alert dialog
function showConfirmModal(title, message, onConfirm) {
    openModal(title, `<p style="font-size:15px;color:var(--text-primary);padding:10px 0;">${message}</p>`, onConfirm, true);
}

// Show text prompt modal
function showPromptModal(title, labelText, onConfirm) {
    const bodyHTML = `
        <div class="form-group">
            <label>${labelText}</label>
            <input type="text" id="modal-prompt-input" style="margin-top:10px;" autofocus required>
        </div>
    `;
    openModal(title, bodyHTML, function () {
        const val = $('#modal-prompt-input').val();
        if (onConfirm) {
            onConfirm(val);
        }
    }, true);
    
    // Focus automatically
    setTimeout(() => {
        $('#modal-prompt-input').focus();
    }, 100);
}
