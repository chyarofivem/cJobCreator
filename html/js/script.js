let locales = {};
let isModifying = false;
let activeTab = 'general';

// In-memory job creator state
let datafaz = emptyJob();

// Position picked for the storage being added
let pendingInvCoords = null;

// Vehicle counts for the nav when editing (vehicles live in the database)
let savedVehicleCount = 0;
let savedHeliCount = 0;

const RESOURCE = typeof GetParentResourceName === 'function' ? GetParentResourceName() : 'cJobCreator';

function emptyJob() {
    return {
        job: '',
        label: '',
        bossmenu: { gradoboss: 4 },
        camerino: null,
        garage: { pos1: null, pos2: null, heading: 0.0, veicoli: [] },
        helipad: { pos1: null, pos2: null, heading: 0.0 },
        inv: [],
        gradi: []
    };
}

function post(endpoint, payload, onSuccess) {
    return $.post(`https://${RESOURCE}/${endpoint}`, JSON.stringify(payload || {}), onSuccess);
}

// ==========================================
// TEXT HELPERS
// ==========================================

// Translated string with %s placeholders filled in order
function t(key, fallback, ...args) {
    let str = locales[key] || fallback || key;
    args.forEach((arg) => { str = str.replace('%s', arg); });
    return str;
}

function esc(value) {
    return String(value == null ? '' : value)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function fmtNum(value, maxDecimals = 1) {
    return (Number(value) || 0).toLocaleString('en-US', { maximumFractionDigits: maxDecimals });
}

function slug(value) {
    return String(value || '').trim().toLowerCase().replace(/\s+/g, '');
}

function rankText(minGrade) {
    const grade = Number(minGrade) || 0;
    return grade > 0 ? t('ui_from_rank', 'Rank %s+', grade) : t('ui_any_rank', 'Any rank');
}

function isFullKit(value) {
    return value === true || value === 1 || value === '1';
}

function hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
    } : { r: 255, g: 255, b: 255 };
}

function rgbToHex(r, g, b) {
    return '#' + [r, g, b].map((c) => Math.max(0, Math.min(255, Math.round(c))).toString(16).padStart(2, '0')).join('');
}

function vehicleHex(veh) {
    const channel = (v) => (v === null || v === undefined || v === '' ? 255 : Number(v));
    return rgbToHex(channel(veh.color_r), channel(veh.color_g), channel(veh.color_b));
}

function formatCoords(pos, heading) {
    const n = (v) => Number(v).toFixed(2);
    let text = `x ${n(pos.x)}  y ${n(pos.y)}  z ${n(pos.z)}`;
    if (heading !== undefined) text += `  h ${Number(heading).toFixed(1)}°`;
    return text;
}

function coordsForCopy(pos, heading) {
    const n = (v) => Number(v).toFixed(2);
    return heading !== undefined
        ? `vector4(${n(pos.x)}, ${n(pos.y)}, ${n(pos.z)}, ${n(heading)})`
        : `vector3(${n(pos.x)}, ${n(pos.y)}, ${n(pos.z)})`;
}

// ==========================================
// ICONS (Tabler outline, stroke 1.75)
// ==========================================

const ICONS = {
    'settings': ['M10.325 4.317c.426 -1.756 2.924 -1.756 3.35 0a1.724 1.724 0 0 0 2.573 1.066c1.543 -.94 3.31 .826 2.37 2.37a1.724 1.724 0 0 0 1.065 2.572c1.756 .426 1.756 2.924 0 3.35a1.724 1.724 0 0 0 -1.066 2.573c.94 1.543 -.826 3.31 -2.37 2.37a1.724 1.724 0 0 0 -2.572 1.065c-.426 1.756 -2.924 1.756 -3.35 0a1.724 1.724 0 0 0 -2.573 -1.066c-1.543 .94 -3.31 -.826 -2.37 -2.37a1.724 1.724 0 0 0 -1.065 -2.572c-1.756 -.426 -1.756 -2.924 0 -3.35a1.724 1.724 0 0 0 1.066 -2.573c-.94 -1.543 .826 -3.31 2.37 -2.37c1 .608 2.296 .07 2.572 -1.065z', 'M9 12a3 3 0 1 0 6 0a3 3 0 0 0 -6 0'],
    'archive': ['M3 6a2 2 0 0 1 2 -2h14a2 2 0 0 1 2 2a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2z', 'M5 8v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2 -2v-10', 'M10 12l4 0'],
    'car': ['M5 17a2 2 0 1 0 4 0a2 2 0 1 0 -4 0', 'M15 17a2 2 0 1 0 4 0a2 2 0 1 0 -4 0', 'M5 17h-2v-6l2 -5h9l4 5h1a2 2 0 0 1 2 2v4h-2m-4 0h-6m-6 -6h15m-6 0v-5'],
    'helicopter': ['M3 10l1 2h6', 'M12 9a2 2 0 0 0 -2 2v3c0 1.1 .9 2 2 2h7a2 2 0 0 0 2 -2c0 -3.31 -3.13 -5 -7 -5h-2z', 'M13 9l0 -3', 'M5 6l15 0', 'M15 9.1v3.9h5.5', 'M15 19l0 -3', 'M19 19l-8 0'],
    'list-numbers': ['M11 6h9', 'M11 12h9', 'M12 18h8', 'M4 16a2 2 0 1 1 4 0c0 .591 -.5 1 -1 1.5l-3 2.5h4', 'M6 10v-6l-2 2'],
    'menu': ['M4 6l16 0', 'M4 12l16 0', 'M4 18l16 0'],
    'x': ['M18 6l-12 12', 'M6 6l12 12'],
    'plus': ['M12 5l0 14', 'M5 12l14 0'],
    'trash': ['M4 7l16 0', 'M10 11l0 6', 'M14 11l0 6', 'M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2 -2l1 -12', 'M9 7v-3a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v3'],
    'pencil': ['M4 20h4l10.5 -10.5a2.828 2.828 0 1 0 -4 -4l-10.5 10.5v4', 'M13.5 6.5l4 4'],
    'copy': ['M7 9.667a2.667 2.667 0 0 1 2.667 -2.667h8.666a2.667 2.667 0 0 1 2.667 2.667v8.666a2.667 2.667 0 0 1 -2.667 2.667h-8.666a2.667 2.667 0 0 1 -2.667 -2.667z', 'M4.012 16.737a2.005 2.005 0 0 1 -1.012 -1.737v-10c0 -1.1 .9 -2 2 -2h10c.75 0 1.158 .385 1.5 1'],
    'grip': ['M8 5a1 1 0 1 0 2 0a1 1 0 1 0 -2 0', 'M8 12a1 1 0 1 0 2 0a1 1 0 1 0 -2 0', 'M8 19a1 1 0 1 0 2 0a1 1 0 1 0 -2 0', 'M14 5a1 1 0 1 0 2 0a1 1 0 1 0 -2 0', 'M14 12a1 1 0 1 0 2 0a1 1 0 1 0 -2 0', 'M14 19a1 1 0 1 0 2 0a1 1 0 1 0 -2 0'],
    'circle-check': ['M3 12a9 9 0 1 0 18 0a9 9 0 1 0 -18 0', 'M9 12l2 2l4 -4'],
    'circle-x': ['M3 12a9 9 0 1 0 18 0a9 9 0 1 0 -18 0', 'M10 10l4 4m0 -4l-4 4'],
    'info-circle': ['M3 12a9 9 0 1 0 18 0a9 9 0 0 0 -18 0', 'M12 9h.01', 'M11 12h1v4h1']
};

function icon(name, size = 20) {
    const paths = (ICONS[name] || []).map((d) => `<path d="${d}"/>`).join('');
    return `<svg class="ico" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
}

function iconButton(name, tip, attrs = '', extraClass = '') {
    return `<button type="button" class="icon-btn ${extraClass}" aria-label="${esc(tip)}" data-tip="${esc(tip)}" ${attrs}>${icon(name)}</button>`;
}

function hydrateIcons(root) {
    $(root).find('i[data-icon]').each(function () {
        const inButton = $(this).closest('.btn').length > 0;
        $(this).replaceWith(icon($(this).data('icon'), inButton ? 16 : 20));
    });
    $(root).find('[data-icon-btn]').each(function () {
        $(this).html(icon($(this).data('icon-btn')));
    });
}

// ==========================================
// ACCENT THEMING
// Config.AccentColor takes a preset name or a hex colour.
// ==========================================

// fill = 700, hover = 800, text = 500, glow = 400 (indigo, violet, purple: text 400, glow 300)
const ACCENT_PRESETS = {
    blue:    ['#1d4ed8', '#1e40af', '#3b82f6', '#60a5fa'],
    indigo:  ['#4338ca', '#3730a3', '#818cf8', '#a5b4fc'],
    violet:  ['#6d28d9', '#5b21b6', '#a78bfa', '#c4b5fd'],
    purple:  ['#7e22ce', '#6b21a8', '#c084fc', '#d8b4fe'],
    fuchsia: ['#a21caf', '#86198f', '#d946ef', '#e879f9'],
    pink:    ['#be185d', '#9d174d', '#ec4899', '#f472b6'],
    rose:    ['#be123c', '#9f1239', '#f43f5e', '#fb7185'],
    red:     ['#b91c1c', '#991b1b', '#ef4444', '#f87171'],
    orange:  ['#c2410c', '#9a3412', '#f97316', '#fb923c'],
    amber:   ['#b45309', '#92400e', '#f59e0b', '#fbbf24'],
    yellow:  ['#a16207', '#854d0e', '#eab308', '#facc15'],
    lime:    ['#4d7c0f', '#3f6212', '#84cc16', '#a3e635'],
    green:   ['#15803d', '#166534', '#22c55e', '#4ade80'],
    emerald: ['#047857', '#065f46', '#10b981', '#34d399'],
    teal:    ['#0f766e', '#115e59', '#14b8a6', '#2dd4bf'],
    cyan:    ['#0e7490', '#155e75', '#06b6d4', '#22d3ee'],
    sky:     ['#0369a1', '#075985', '#0ea5e9', '#38bdf8']
};

const SIDEBAR_HEX = '#1c1e23';

function srgbToLinear(c) {
    c /= 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function linearToSrgb(c) {
    const v = c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
    return v * 255;
}

function luminance(hex) {
    const { r, g, b } = hexToRgb(hex);
    return 0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b);
}

function contrast(hexA, hexB) {
    const a = luminance(hexA);
    const b = luminance(hexB);
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

function hexToOklch(hex) {
    const { r, g, b } = hexToRgb(hex);
    const lr = srgbToLinear(r), lg = srgbToLinear(g), lb = srgbToLinear(b);
    const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
    const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
    const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
    const L = 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s;
    const A = 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s;
    const B = 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s;
    return { l: L, c: Math.sqrt(A * A + B * B), h: Math.atan2(B, A) };
}

function oklchToLinear(L, C, H) {
    const A = C * Math.cos(H);
    const B = C * Math.sin(H);
    const l = Math.pow(L + 0.3963377774 * A + 0.2158037573 * B, 3);
    const m = Math.pow(L - 0.1055613458 * A - 0.0638541728 * B, 3);
    const s = Math.pow(L - 0.0894841775 * A - 1.2914855480 * B, 3);
    return [
        4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
        -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
        -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s
    ];
}

// OKLCH to hex, lowering chroma until the colour fits in sRGB
function oklchToHex(L, C, H) {
    L = Math.max(0, Math.min(1, L));
    const inGamut = (rgb) => rgb.every((v) => v >= -0.0001 && v <= 1.0001);
    let rgb = oklchToLinear(L, C, H);
    if (!inGamut(rgb)) {
        let lo = 0, hi = C;
        for (let i = 0; i < 24; i++) {
            const mid = (lo + hi) / 2;
            if (inGamut(oklchToLinear(L, mid, H))) lo = mid; else hi = mid;
        }
        rgb = oklchToLinear(L, lo, H);
    }
    return rgbToHex(...rgb.map((v) => linearToSrgb(Math.max(0, Math.min(1, v)))));
}

function deriveAccent(hex) {
    const base = hexToOklch(hex);
    let fillL = base.l;
    let fill = oklchToHex(fillL, base.c, base.h);
    while (contrast('#ffffff', fill) < 4.5 && fillL > 0) {
        fillL -= 0.01;
        fill = oklchToHex(fillL, base.c, base.h);
    }
    const hover = oklchToHex(fillL - 0.065, base.c * 0.85, base.h);
    let textL = 0.68;
    let text = oklchToHex(textL, base.c, base.h);
    if (contrast(text, SIDEBAR_HEX) < 4.5) {
        textL = 0.75;
        text = oklchToHex(textL, base.c, base.h);
    }
    const glow = oklchToHex(textL + 0.07, base.c, base.h);
    return [fill, hover, text, glow];
}

function rgba(hex, alpha) {
    const { r, g, b } = hexToRgb(hex);
    return `rgb(${r} ${g} ${b} / ${alpha})`;
}

function applyAccent(setting) {
    const value = String(setting || 'blue').trim().toLowerCase();
    let tokens = ACCENT_PRESETS[value];
    if (!tokens && /^#?[0-9a-f]{6}$/.test(value)) {
        tokens = deriveAccent(value.charAt(0) === '#' ? value : '#' + value);
    }
    tokens = tokens || ACCENT_PRESETS.blue;

    const [fill, hover, text, glow] = tokens;
    const root = document.documentElement.style;
    root.setProperty('--accent', fill);
    root.setProperty('--accent-hover', hover);
    root.setProperty('--accent-text', text);
    root.setProperty('--accent-glow', glow);
    root.setProperty('--accent-soft', rgba(fill, 0.10));
    root.setProperty('--accent-tint', rgba(fill, 0.15));
    root.setProperty('--accent-edge', rgba(fill, 0.20));
    root.setProperty('--accent-icon', rgba(text, 0.50));
}

// ==========================================
// TOOLTIPS
// ==========================================

let tipTimer = null;
let tipHideTimer = null;
let tipTarget = null;

function showTip(el, text) {
    const tip = $('#tooltip');
    tip.text(text).removeClass('is-below').removeAttr('hidden');
    const rect = el.getBoundingClientRect();
    const w = tip.outerWidth();
    const h = tip.outerHeight();
    let top = rect.top - h - 8;
    if (top < 4) {
        top = rect.bottom + 8;
        tip.addClass('is-below');
    }
    const center = rect.left + rect.width / 2;
    const left = Math.max(4, Math.min(window.innerWidth - w - 4, center - w / 2));
    tip.css({ top: `${top}px`, left: `${left}px`, '--caret': `${center - left}px` });
    tipTarget = el;
}

function hideTip() {
    clearTimeout(tipTimer);
    clearTimeout(tipHideTimer);
    tipTarget = null;
    $('#tooltip').attr('hidden', true);
}

function bindTooltips() {
    $(document).on('mouseenter', '[data-tip]', function () {
        const el = this;
        clearTimeout(tipTimer);
        if ($(el).hasClass('row-title') && el.scrollWidth <= el.clientWidth) return;
        tipTimer = setTimeout(() => { if (document.body.contains(el)) showTip(el, el.dataset.tip); }, 300);
    });
    $(document).on('focusin', '[data-tip]', function () {
        const el = this;
        let keyboard = true;
        try { keyboard = el.matches(':focus-visible'); } catch (e) { /* older engines */ }
        if (!keyboard) return;
        clearTimeout(tipTimer);
        tipTimer = setTimeout(() => showTip(el, el.dataset.tip), 300);
    });
    $(document).on('mouseleave focusout', '[data-tip]', hideTip);
    $(document).on('mousedown', '[data-tip]:not([data-copy])', hideTip);
    $('#content, .modal-body').on('scroll', hideTip);
}

// ==========================================
// CLIPBOARD
// ==========================================

function copyText(text, sourceEl) {
    let ok = false;
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    document.body.removeChild(area);
    if (!ok && navigator.clipboard) {
        navigator.clipboard.writeText(text).catch(() => {});
    }
    if (sourceEl) {
        $(sourceEl).trigger('focus');
        clearTimeout(tipTimer);
        clearTimeout(tipHideTimer);
        showTip(sourceEl, t('ui_copied', 'Copied'));
        tipHideTimer = setTimeout(hideTip, 2000);
    }
}

// ==========================================
// TOASTS
// ==========================================

function toast(type, title, body, action) {
    const iconName = { success: 'circle-check', error: 'circle-x', info: 'info-circle' }[type] || 'info-circle';
    const el = $(`
        <div class="toast is-${type}" ${type === 'error' ? 'role="alert"' : ''}>
            ${icon(iconName, 16)}
            <div class="toast-text">
                <div class="toast-title">${esc(title)}</div>
                ${body ? `<div class="toast-body">${esc(body)}</div>` : ''}
            </div>
            ${action ? `<button type="button" class="btn btn-secondary toast-action"><span class="btn-label">${esc(action.label)}</span></button>` : ''}
            ${iconButton('x', t('ui_close', 'Close'), 'data-dismiss')}
        </div>
    `);
    const remove = () => { hideTip(); el.remove(); };
    el.find('[data-dismiss]').on('click', remove);
    if (action) {
        el.find('.toast-action').on('click', () => { action.onClick(); remove(); });
    }
    $('#toasts').append(el);
    if (type !== 'error') setTimeout(remove, 5000);
}

// ==========================================
// FIELD VALIDATION
// ==========================================

function setFieldError(input, message) {
    const $input = $(input);
    const field = $input.closest('.field');
    const id = `${$input.attr('id')}-error`;
    field.addClass('has-error').find('.field-error').remove();
    field.append(`<p class="field-error" id="${id}">${icon('circle-x', 16)}<span>${esc(message)}</span></p>`);
    $input.attr({ 'aria-invalid': 'true', 'aria-describedby': id });
}

function clearFieldError(input) {
    const $input = $(input);
    const field = $input.closest('.field');
    field.removeClass('has-error').find('.field-error').remove();
    $input.removeAttr('aria-invalid aria-describedby');
}

// Returns the first empty required input, marking every empty one
function requireFields(selectors) {
    let first = null;
    selectors.forEach((sel) => {
        const input = $(sel);
        if (!String(input.val() || '').trim()) {
            setFieldError(input, t('ui_err_required', 'Fill in this field.'));
            first = first || input;
        }
    });
    if (first) first.trigger('focus');
    return first;
}

// ==========================================
// MODAL
// ==========================================

const modalState = { onConfirm: null, onDismiss: null, busy: false, returnFocus: null };

function isModalOpen() {
    return !$('#modal').is('[hidden]');
}

// opts: title, desc, body (HTML), confirmLabel, danger, cancelLabel, wide, onConfirm (return false to stay open), onDismiss
function openModal(opts) {
    hideTip();
    modalState.onConfirm = opts.onConfirm || null;
    modalState.onDismiss = opts.onDismiss || null;
    modalState.busy = false;
    modalState.returnFocus = document.activeElement;

    $('#modal-title').text(opts.title || '');
    $('#modal-desc').text(opts.desc || '');
    $('#modal-body').html(opts.body || '');
    $('#modal .modal').toggleClass('is-wide', !!opts.wide);

    $('#modal-cancel .btn-label').text(opts.cancelLabel || t('ui_cancel', 'Cancel'));
    const confirm = $('#modal-confirm');
    if (opts.confirmLabel) {
        confirm.removeAttr('hidden').prop('disabled', false)
            .toggleClass('btn-danger', !!opts.danger).toggleClass('btn-primary', !opts.danger);
        confirm.find('.btn-label').text(opts.confirmLabel);
    } else {
        confirm.attr('hidden', true);
    }

    $('#modal').removeAttr('hidden');
    hydrateIcons('#modal-body');

    const firstInput = $('#modal-body').find('input').first();
    setTimeout(() => (firstInput.length ? firstInput : (opts.confirmLabel ? confirm : $('#modal-cancel'))).trigger('focus'), 50);
}

function closeModal() {
    hideTip();
    $('#modal').attr('hidden', true);
    $('#modal-body').empty();
    modalState.onConfirm = null;
    modalState.onDismiss = null;
    const target = modalState.returnFocus;
    modalState.returnFocus = null;
    if (target && document.body.contains(target) && $(target).is(':visible')) target.focus();
}

function dismissModal() {
    if (modalState.busy) return;
    const onDismiss = modalState.onDismiss;
    closeModal();
    if (onDismiss) onDismiss();
}

function confirmModal() {
    const confirm = $('#modal-confirm');
    if (modalState.busy || confirm.is('[hidden]') || confirm.prop('disabled')) return;
    if (modalState.onConfirm && modalState.onConfirm() === false) return;
    closeModal();
}

function trapModalFocus(e) {
    const focusables = $('#modal').find('button, input, [tabindex]:not([tabindex="-1"])').filter(':visible:not(:disabled)');
    if (!focusables.length) return;
    const first = focusables.first()[0];
    const last = focusables.last()[0];
    if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
    }
}

// ==========================================
// SHELL
// ==========================================

function showUI() {
    $('#ui').removeAttr('hidden');
}

function hideUI() {
    hideTip();
    closeModal();
    closeDrawer();
    $('#toasts').empty();
    $('#ui').attr('hidden', true);
}

function closeUI() {
    hideUI();
    post('close', {});
}

function openDrawer() {
    $('#app').addClass('drawer-open');
    $('#sidebar .nav-row.active').trigger('focus');
}

function closeDrawer() {
    $('#app').removeClass('drawer-open');
}

function setPage(title, subtitle) {
    $('#page-title').text(title);
    $('#page-subtitle').text(subtitle || '');
}

function applyLocalesToHTML() {
    $('[data-translate]').each(function () {
        const key = $(this).data('translate');
        if (locales[key]) $(this).text(locales[key]);
    });
    $('[data-tip-key]').each(function () {
        const key = $(this).data('tip-key');
        const text = locales[key] || $(this).attr('data-tip');
        $(this).attr({ 'data-tip': text, 'aria-label': text });
    });
}

function readOpenPayload(item) {
    locales = item.locales || {};
    applyAccent(item.accent);
    applyLocalesToHTML();
}

// ==========================================
// CREATOR: TABS AND HEADER
// ==========================================

function switchTab(tab) {
    activeTab = tab;
    $('.nav-row').removeClass('active').removeAttr('aria-current');
    $(`.nav-row[data-tab="${tab}"]`).addClass('active').attr('aria-current', 'page');

    $('.view').removeClass('active');
    const view = $(`#tab-${tab}`).addClass('active');
    setPage(t(view.data('title-key'), view.data('title')), t(view.data('sub-key'), view.data('sub')));

    closeDrawer();
    $('#content').scrollTop(0);
}

function updateCreatorHeader() {
    const name = datafaz.label || (isModifying ? t('ui_edit_job', 'Edit job') : t('ui_create_job', 'Create job'));
    $('#sidebar-title').text(name);
    $('#sidebar-sub').text(datafaz.job || '');
    $('#topbar-title').text(name);
    $('#save-job-btn .btn-label').text(isModifying ? t('ui_save_changes', 'Save changes') : t('ui_create_job', 'Create job'));
}

function updateCounts() {
    const garageCount = isModifying ? savedVehicleCount : (datafaz.garage.veicoli || []).length;
    const heliCount = isModifying ? savedHeliCount : (datafaz.helipad.veicoli || []).length;
    $('#count-inventories').text(datafaz.inv.length);
    $('#count-garage').text(garageCount);
    $('#count-helipad').text(heliCount);
    $('#count-grades').text(datafaz.gradi.length);
}

// ==========================================
// CREATOR: POSITIONS
// ==========================================

const xyz = (c) => ({ x: c.x, y: c.y, z: c.z });

const POSITIONS = {
    bossmenu: {
        key: 'ui_pos_bossmenu', label: 'Boss menu', type: 'bossmenu',
        get: () => datafaz.bossmenu.pos,
        set: (c) => { datafaz.bossmenu.pos = xyz(c); }
    },
    wardrobe: {
        key: 'ui_pos_wardrobe', label: 'Wardrobe', type: 'wardrobe',
        get: () => datafaz.camerino,
        set: (c) => { datafaz.camerino = xyz(c); }
    },
    garage_pickup: {
        key: 'ui_pos_takeout', label: 'Take-out point', type: 'garage_pickup',
        get: () => datafaz.garage.pos1,
        set: (c) => { datafaz.garage.pos1 = xyz(c); }
    },
    garage_spawn: {
        key: 'ui_pos_garage_spawn', label: 'Spawn and return point', type: 'garage_spawn', heading: true,
        get: () => datafaz.garage.pos2,
        getHeading: () => datafaz.garage.heading,
        set: (c) => { datafaz.garage.pos2 = xyz(c); datafaz.garage.heading = c.heading; }
    },
    helipad_pickup: {
        key: 'ui_pos_takeout', label: 'Take-out point', type: 'helipad_pickup',
        get: () => datafaz.helipad.pos1,
        set: (c) => { datafaz.helipad.pos1 = xyz(c); }
    },
    helipad_spawn: {
        key: 'ui_pos_helipad_spawn', label: 'Landing pad', type: 'helipad_spawn', heading: true,
        get: () => datafaz.helipad.pos2,
        getHeading: () => datafaz.helipad.heading,
        set: (c) => { datafaz.helipad.pos2 = xyz(c); datafaz.helipad.heading = c.heading; }
    },
    inventory: {
        key: 'ui_pos_storage', label: 'Position', type: 'inventory',
        get: () => pendingInvCoords,
        set: (c) => { pendingInvCoords = xyz(c); }
    }
};

function buildPositionRows() {
    $('.pos-list[data-positions]').each(function () {
        const keys = String($(this).data('positions')).split(',');
        $(this).html(keys.map((key) => {
            const def = POSITIONS[key];
            return `
                <div class="pos-row" data-pos="${key}">
                    <div class="pos-info">
                        <div class="pos-label">${esc(t(def.key, def.label))}</div>
                        <div class="pos-value"></div>
                    </div>
                    <div class="pos-actions">
                        ${iconButton('copy', t('ui_copy_coords', 'Copy coordinates'), 'data-copy')}
                        <button type="button" class="btn btn-secondary" data-set><span class="btn-label"></span></button>
                    </div>
                </div>
            `;
        }).join(''));
    });
    updatePositions();
}

function updatePositions() {
    $('.pos-row[data-pos]').each(function () {
        const def = POSITIONS[$(this).data('pos')];
        const pos = def.get();
        const isSet = !!(pos && typeof pos === 'object' && pos.x !== undefined);
        const heading = def.heading ? (def.getHeading() || 0) : undefined;
        $(this).find('.pos-value')
            .toggleClass('mono is-empty', false)
            .addClass(isSet ? 'mono' : 'is-empty')
            .text(isSet ? formatCoords(pos, heading) : t('ui_not_set', 'Not set'));
        $(this).find('[data-copy]').attr('hidden', !isSet);
        $(this).find('[data-set] .btn-label').text(isSet ? t('ui_move_here', 'Move here') : t('ui_use_position', 'Use my position'));
    });
}

function setButtonLoading(btn, loading) {
    const $btn = $(btn);
    $btn.toggleClass('is-loading', loading).prop('disabled', loading).attr('aria-busy', loading ? 'true' : null);
    if (loading) {
        $btn.css('min-width', $btn.outerWidth() + 'px').append('<span class="spinner" aria-hidden="true"></span>');
    } else {
        $btn.css('min-width', '').find('.spinner').remove();
    }
}

function requestPosition(row) {
    const def = POSITIONS[row.data('pos')];
    const btn = row.find('[data-set]');
    setButtonLoading(btn, true);
    post('getCoords', { type: def.type }, function (coords) {
        setButtonLoading(btn, false);
        if (!coords || coords.x === undefined) {
            toast('error', t('ui_err_coords', "Couldn't read your position. Try again."));
            return;
        }
        def.set(coords);
        row.removeClass('has-error').find('.field-error').remove();
        updatePositions();
    }).fail(function () {
        setButtonLoading(btn, false);
        toast('error', t('ui_err_coords', "Couldn't read your position. Try again."));
    });
}

// ==========================================
// CREATOR: SETUP
// ==========================================

function normalisePad(raw) {
    if (raw && !Array.isArray(raw)) {
        return {
            pos1: (raw.pos1 && typeof raw.pos1 === 'object') ? raw.pos1 : null,
            pos2: (raw.pos2 && typeof raw.pos2 === 'object') ? raw.pos2 : null,
            heading: raw.heading || 0.0
        };
    }
    return { pos1: null, pos2: null, heading: 0.0 };
}

function setupCreatorMode(existingJobData) {

    if (isModifying && existingJobData) {
        // Lua encodes an empty table as [], so drop array-shaped or position-less values
        const rawBossMenu = existingJobData.bossmenu;
        const validBoss = rawBossMenu && !Array.isArray(rawBossMenu);
        const bossmenu = { gradoboss: (validBoss && rawBossMenu.gradoboss) || 4 };
        if (validBoss && rawBossMenu.pos && typeof rawBossMenu.pos === 'object') {
            bossmenu.pos = rawBossMenu.pos;
        }

        datafaz = {
            job: existingJobData.job || '',
            label: existingJobData.label || '',
            bossmenu: bossmenu,
            camerino: (existingJobData.camerino && !Array.isArray(existingJobData.camerino)) ? existingJobData.camerino : null,
            garage: normalisePad(existingJobData.garage),
            helipad: normalisePad(existingJobData.helipad),
            inv: Array.isArray(existingJobData.inv) ? existingJobData.inv : [],
            gradi: Array.isArray(existingJobData.gradi) ? existingJobData.gradi : []
        };
    } else {
        datafaz = emptyJob();
        datafaz.job = (existingJobData && existingJobData.job) || '';
        datafaz.label = existingJobData ? (existingJobData.label || '') : '';
    }

    pendingInvCoords = null;
    savedVehicleCount = 0;
    savedHeliCount = 0;

    $('#delete-job-card').attr('hidden', !isModifying);
    $('#job-name').val(datafaz.job).prop('disabled', isModifying);
    $('#job-name-help').text(isModifying
        ? t('ui_job_id_locked', "The ID can't change after the job is created.")
        : t('ui_job_id_help', 'Used with the setjob command. Lowercase, no spaces.'));
    $('#job-label').val(datafaz.label);
    $('#boss-grade').val(datafaz.bossmenu.gradoboss);
    $('.field').each(function () { clearFieldError($(this).find('.input').first()); });
    resetFleetForm('veh');
    resetFleetForm('heli');
    $('#inv-form')[0].reset();
    $('#grade-form')[0].reset();

    buildPositionRows();
    updateCreatorHeader();

    renderInventoryList();
    if (isModifying) {
        refreshVehiclesList();
        refreshHelipadVehiclesList();
    } else {
        renderCreatorVehiclesList();
        renderHelipadVehiclesList();
    }
    renderGradesList();

    switchTab('general');
}

// ==========================================
// CREATOR: LIST RENDERING
// ==========================================

function emptyState(iconName, text) {
    return `<div class="empty">${icon(iconName, 32)}<p>${esc(text)}</p></div>`;
}

function errorState(text, retryAttr) {
    return `
        <div class="empty is-error" role="alert">
            ${icon('circle-x', 16)}
            <p>${esc(text)}</p>
            <button type="button" class="btn btn-secondary" ${retryAttr}><span class="btn-label">${esc(t('ui_retry', 'Try again'))}</span></button>
        </div>
    `;
}

function skeletonRows(count) {
    return Array.from({ length: count }, () => '<div class="skeleton" aria-hidden="true"></div>').join('');
}

function renderInventoryList() {
    const list = $('#inventory-list');
    updateCounts();

    if (datafaz.inv.length === 0) {
        list.html(emptyState('archive', t('ui_no_storage', 'Storage you add appears here.')));
        return;
    }

    list.html(datafaz.inv.map((inv, index) => `
        <div class="row wraps">
            <div class="row-main">
                <span class="row-title" data-tip="${esc(inv.label)}">${esc(inv.label)}</span>
                <div class="row-meta">
                    <span>${esc(t('ui_slots_n', '%s slots', fmtNum(inv.slots, 0)))}</span>
                    <span>${esc(fmtNum((Number(inv.peso) || 0) / 1000))} kg</span>
                    <span>${esc(rankText(inv.grado))}</span>
                </div>
                ${inv.pos ? `<div class="row-meta mono">${esc(formatCoords(inv.pos))}</div>` : ''}
            </div>
            <div class="row-actions">
                ${iconButton('trash', t('ui_remove_storage', 'Remove storage'), `data-remove-inv="${index}"`)}
            </div>
        </div>
    `).join(''));
}

function vehicleRow(veh, removeAttr, removeTip) {
    return `
        <div class="row wraps">
            <span class="swatch" style="background:${vehicleHex(veh)}"></span>
            <div class="row-main">
                <span class="row-title" data-tip="${esc(veh.label)}">${esc(veh.label)}</span>
                <div class="row-meta">
                    <span class="mono">${esc(veh.model)}</span>
                    ${veh.plate ? `<span class="mono">${esc(veh.plate)}</span>` : ''}
                    <span>${esc(rankText(veh.min_grade))}</span>
                    ${isFullKit(veh.fullkit) ? `<span>${esc(t('ui_full_upgrades', 'Full upgrades'))}</span>` : ''}
                </div>
            </div>
            <div class="row-actions">
                ${iconButton('trash', removeTip, removeAttr)}
            </div>
        </div>
    `;
}

function renderCreatorVehiclesList() {
    const veicoli = datafaz.garage.veicoli || [];
    updateCounts();
    $('#creator-vehicles-list').html(veicoli.length === 0
        ? emptyState('car', t('ui_no_vehicles', 'Vehicles you add appear here.'))
        : veicoli.map((veh, index) => vehicleRow(veh, `data-remove-veh="${index}"`, t('ui_remove_vehicle', 'Remove vehicle'))).join(''));
}

function renderHelipadVehiclesList() {
    const veicoli = datafaz.helipad.veicoli || [];
    updateCounts();
    $('#creator-helivehicles-list').html(veicoli.length === 0
        ? emptyState('helicopter', t('ui_no_helicopters', 'Helicopters you add appear here.'))
        : veicoli.map((veh, index) => vehicleRow(veh, `data-remove-heli="${index}"`, t('ui_remove_helicopter', 'Remove helicopter'))).join(''));
}

// Edit mode: vehicles are stored in the database straight away
function refreshVehiclesList() {
    const list = $('#creator-vehicles-list');
    if (!list.children('.row').length) list.html(skeletonRows(2));
    post('getJobVehicles', { job: datafaz.job }, function (vehicles) {
        vehicles = Array.isArray(vehicles) ? vehicles : [];
        savedVehicleCount = vehicles.length;
        updateCounts();
        list.html(vehicles.length === 0
            ? emptyState('car', t('ui_no_vehicles', 'Vehicles you add appear here.'))
            : vehicles.map((veh) => vehicleRow(veh, `data-delete-db-veh="${esc(veh.id)}" data-name="${esc(veh.label)}"`, t('ui_remove_vehicle', 'Remove vehicle'))).join(''));
    }).fail(function () {
        list.html(errorState(t('ui_err_load_vehicles', "Vehicles couldn't be loaded."), 'data-retry="vehicles"'));
    });
}

function refreshHelipadVehiclesList() {
    const list = $('#creator-helivehicles-list');
    if (!list.children('.row').length) list.html(skeletonRows(2));
    post('getJobHeliVehicles', { job: datafaz.job }, function (vehicles) {
        vehicles = Array.isArray(vehicles) ? vehicles : [];
        savedHeliCount = vehicles.length;
        updateCounts();
        list.html(vehicles.length === 0
            ? emptyState('helicopter', t('ui_no_helicopters', 'Helicopters you add appear here.'))
            : vehicles.map((veh) => vehicleRow(veh, `data-delete-db-heli="${esc(veh.id)}" data-name="${esc(veh.label)}"`, t('ui_remove_helicopter', 'Remove helicopter'))).join(''));
    }).fail(function () {
        list.html(errorState(t('ui_err_load_helicopters', "Helicopters couldn't be loaded."), 'data-retry="helis"'));
    });
}

function renderGradesList(focusIndex) {
    const list = $('#grades-list');
    updateCounts();

    if (datafaz.gradi.length === 0) {
        list.html(emptyState('list-numbers', t('ui_no_ranks', 'No ranks yet. Jobs saved without ranks get recruit, employee, manager and boss.')));
        return;
    }

    datafaz.gradi.sort((a, b) => a.grade - b.grade);

    list.html(datafaz.gradi.map((grade, index) => `
        <div class="row is-clickable" data-index="${index}">
            ${iconButton('grip', t('ui_drag_rank', 'Drag to reorder'), '', 'drag-handle')}
            <span class="badge">${esc(grade.grade)}</span>
            <div class="row-main">
                <span class="row-title">${esc(grade.label)}</span>
                <div class="row-meta">
                    <span class="mono">${esc(grade.name)}</span>
                    <span>$${esc(fmtNum(grade.salary, 0))}</span>
                </div>
            </div>
            <div class="row-actions">
                ${iconButton('pencil', t('ui_edit_rank', 'Edit rank'), 'data-edit-grade')}
                ${iconButton('trash', t('ui_remove_rank', 'Remove rank'), 'data-remove-grade')}
            </div>
        </div>
    `).join(''));

    if (focusIndex !== undefined) {
        list.find(`.row[data-index="${focusIndex}"] .drag-handle`).trigger('focus');
    }
}

// Remove from an unsaved list, with undo
function removeWithUndo(arr, index, rerender) {
    const [removed] = arr.splice(index, 1);
    rerender();
    toast('success', t('ui_removed', "Removed '%s'", removed.label), null, {
        label: t('ui_undo', 'Undo'),
        onClick: () => { arr.splice(index, 0, removed); rerender(); }
    });
}

// ==========================================
// CREATOR: RANK ORDERING
// ==========================================

function renumberGrades() {
    datafaz.gradi.forEach((g, idx) => { g.grade = idx; });
}

function moveGrade(from, to) {
    if (to < 0 || to >= datafaz.gradi.length) return;
    const [grade] = datafaz.gradi.splice(from, 1);
    datafaz.gradi.splice(to, 0, grade);
    renumberGrades();
    renderGradesList(to);
}

// Mouse-driven drag (FiveM CEF does not support native HTML5 drag and drop)
function startGradeDrag(row, e) {
    e.preventDefault();
    hideTip();
    const list = $('#grades-list');
    row.addClass('is-dragging');

    $(window).on('mousemove.drag', function (moveEvent) {
        let target = null;
        list.find('.row').not(row).each(function () {
            const rect = this.getBoundingClientRect();
            if (moveEvent.clientY >= rect.top && moveEvent.clientY <= rect.bottom) {
                target = $(this);
                return false;
            }
        });
        if (target) {
            const rect = target[0].getBoundingClientRect();
            if (moveEvent.clientY < rect.top + rect.height / 2) row.insertBefore(target);
            else row.insertAfter(target);
        }
    });

    $(window).on('mouseup.drag', function () {
        $(window).off('mousemove.drag mouseup.drag');
        row.removeClass('is-dragging');
        recalculateGradesOrder();
    });
}

function recalculateGradesOrder() {
    const reordered = [];
    $('#grades-list .row').each(function (index) {
        const original = datafaz.gradi[parseInt($(this).data('index'), 10)];
        if (original) {
            reordered.push({ grade: index, name: original.name, label: original.label, salary: original.salary });
        }
    });
    datafaz.gradi = reordered;
    renderGradesList();
}

function editGrade(index) {
    const grade = datafaz.gradi[index];
    if (!grade) return;

    openModal({
        title: t('ui_edit_rank', 'Edit rank'),
        confirmLabel: t('ui_save_rank', 'Save rank'),
        body: `
            <div class="form">
                <div class="field">
                    <label class="label" for="edit-grade-label">${esc(t('ui_display_name', 'Display name'))}<span class="req" aria-hidden="true">*</span></label>
                    <input class="input" type="text" id="edit-grade-label" value="${esc(grade.label)}" autocomplete="off">
                </div>
                <div class="field">
                    <label class="label" for="edit-grade-name">${esc(t('ui_rank_id', 'Rank ID'))}<span class="req" aria-hidden="true">*</span></label>
                    <input class="input mono" type="text" id="edit-grade-name" value="${esc(grade.name)}" autocomplete="off" spellcheck="false">
                    <p class="helper">${esc(t('ui_rank_id_help', 'Lowercase, no spaces.'))}</p>
                </div>
                <div class="field">
                    <label class="label" for="edit-grade-salary">${esc(t('ui_salary', 'Salary ($)'))}</label>
                    <input class="input num" type="number" id="edit-grade-salary" value="${esc(grade.salary)}" min="0">
                </div>
            </div>
        `,
        onConfirm: function () {
            if (requireFields(['#edit-grade-label', '#edit-grade-name'])) return false;
            grade.label = $('#edit-grade-label').val().trim();
            grade.name = slug($('#edit-grade-name').val());
            grade.salary = parseInt($('#edit-grade-salary').val(), 10) || 0;
            renderGradesList();
        }
    });
}

// ==========================================
// CREATOR: FORMS
// ==========================================

function resetFleetForm(prefix) {
    const form = $(`#${prefix}-form`);
    form[0].reset();
    form.find('.color-hex').text('#FFFFFF');
    form.find('.input').each(function () { clearFieldError(this); });
}

function addFleetVehicle(prefix) {
    if (requireFields([`#${prefix}-label`, `#${prefix}-model`])) return;

    const rgb = hexToRgb($(`#${prefix}-color`).val());
    const vehicle = {
        label: $(`#${prefix}-label`).val().trim(),
        model: $(`#${prefix}-model`).val().trim().toUpperCase(),
        fullkit: $(`#${prefix}-fullkit`).is(':checked'),
        plate: $(`#${prefix}-plate`).val().trim(),
        min_grade: parseInt($(`#${prefix}-grade`).val(), 10) || 0,
        color_r: rgb.r, color_g: rgb.g, color_b: rgb.b
    };
    const isHeli = prefix === 'heli';
    if (isHeli) vehicle.vehicle_type = 'heli';

    if (isModifying) {
        post(isHeli ? 'addHeliVehicle' : 'addVehicle', { job: datafaz.job, vehicle: vehicle });
        setTimeout(isHeli ? refreshHelipadVehiclesList : refreshVehiclesList, 300);
    } else {
        const pad = isHeli ? datafaz.helipad : datafaz.garage;
        if (!pad.veicoli) pad.veicoli = [];
        pad.veicoli.push(vehicle);
        (isHeli ? renderHelipadVehiclesList : renderCreatorVehiclesList)();
    }

    resetFleetForm(prefix);
    $(`#${prefix}-label`).trigger('focus');
}

function addStorage() {
    const missing = requireFields(['#inv-label']);
    const posRow = $('#inv-form .pos-row');
    posRow.find('.field-error').remove();
    if (!pendingInvCoords) {
        posRow.addClass('has-error').find('.pos-info').append(
            `<p class="field-error" role="alert">${icon('circle-x', 16)}<span>${esc(t('ui_err_position', 'Set a position first: stand where the stash should be and use your position.'))}</span></p>`
        );
    }
    if (missing || !pendingInvCoords) return;

    const label = $('#inv-label').val().trim();
    datafaz.inv.push({
        label: label,
        nomedeposito: label,
        peso: (parseFloat($('#inv-weight').val()) || 100) * 1000, // stored in grams
        slots: parseInt($('#inv-slots').val(), 10) || 50,
        grado: parseInt($('#inv-grade').val(), 10) || 0,
        pos: pendingInvCoords
    });

    $('#inv-form')[0].reset();
    pendingInvCoords = null;
    posRow.removeClass('has-error');
    updatePositions();
    renderInventoryList();
    $('#inv-label').trigger('focus');
}

function addGrade() {
    if (requireFields(['#grade-label', '#grade-name'])) return;
    datafaz.gradi.push({
        grade: datafaz.gradi.length,
        name: slug($('#grade-name').val()),
        label: $('#grade-label').val().trim(),
        salary: parseInt($('#grade-salary').val(), 10) || 0
    });
    $('#grade-form')[0].reset();
    renderGradesList();
    $('#grade-label').trigger('focus');
}

function saveJob() {
    const missing = [];
    if (!datafaz.job) missing.push('#job-name');
    if (!datafaz.label) missing.push('#job-label');
    if (missing.length) {
        switchTab('general');
        requireFields(missing);
        return;
    }

    if (datafaz.gradi.length === 0) {
        openModal({
            title: t('ui_no_ranks_title', 'Save without ranks?'),
            desc: t('ui_no_ranks_body', 'The default ranks are added: recruit, employee, manager and boss.'),
            confirmLabel: t('ui_save_default_ranks', 'Save with default ranks'),
            onConfirm: saveJobConfig
        });
    } else {
        saveJobConfig();
    }
}

function saveJobConfig() {
    post('saveJob', { data: datafaz, isModifying: isModifying });
    closeUI();
}

function confirmDeleteJob() {
    openModal({
        title: t('ui_delete_job_title', "Delete '%s'?", datafaz.label || datafaz.job),
        desc: t('ui_delete_job_body', "Its ranks, storage, vehicles and outfits are removed for everyone. This can't be undone."),
        confirmLabel: t('ui_delete_job', 'Delete job'),
        danger: true,
        body: `
            <div class="field">
                <label class="label" for="delete-confirm-input">${esc(t('ui_type_to_confirm', 'Type %s to confirm')).replace('%s', `<span class="mono">${esc(datafaz.job)}</span>`)}</label>
                <input class="input mono" type="text" id="delete-confirm-input" autocomplete="off" spellcheck="false">
            </div>
        `,
        onConfirm: function () {
            post('deleteJob', { job: datafaz.job });
            closeUI();
        }
    });
    $('#modal-confirm').prop('disabled', true);
    $('#delete-confirm-input').on('input', function () {
        $('#modal-confirm').prop('disabled', $(this).val().trim() !== datafaz.job);
    });
}

// ==========================================
// BINDINGS
// ==========================================

$(document).ready(function () {
    hydrateIcons(document.body);
    bindTooltips();

    $(document).on('keydown', function (e) {
        if (e.key === 'Escape') {
            if (isModalOpen()) dismissModal();
            else if ($('#app').hasClass('drawer-open')) closeDrawer();
            else if (!$('#ui').is('[hidden]')) closeUI();
        } else if (e.key === 'Tab' && isModalOpen()) {
            trapModalFocus(e);
        } else if (e.key === 'Enter' && isModalOpen() && $(e.target).is('#modal-body input')) {
            e.preventDefault();
            confirmModal();
        }
    });

    // Shell
    $(document).on('click', '[data-close-ui]', closeUI);
    $('#menu-btn').on('click', openDrawer);
    $('#scrim').on('click', closeDrawer);
    $('.nav-row').on('click', function () { switchTab($(this).data('tab')); });

    // Modal
    $('#modal-close, #modal-cancel').on('click', dismissModal);
    $('#modal-confirm').on('click', confirmModal);
    $('#modal').on('mousedown', function (e) { if (e.target === this) dismissModal(); });

    // Clear an error as soon as the field changes
    $(document).on('input change', '.field.has-error .input, .field.has-error input', function () {
        clearFieldError(this);
    });

    // General
    $('#job-name').on('input', function () {
        datafaz.job = slug($(this).val());
        updateCreatorHeader();
    }).on('change', function () { $(this).val(datafaz.job); });
    $('#job-label').on('input', function () {
        datafaz.label = $(this).val().trim();
        updateCreatorHeader();
    });
    $('#boss-grade').on('input', function () {
        datafaz.bossmenu.gradoboss = parseInt($(this).val(), 10) || 0;
    });
    $('#save-job-btn').on('click', saveJob);
    $('#delete-job-btn').on('click', confirmDeleteJob);

    // Positions
    $(document).on('click', '.pos-row [data-set]', function () {
        requestPosition($(this).closest('.pos-row'));
    });
    $(document).on('click', '.pos-row [data-copy]', function () {
        const def = POSITIONS[$(this).closest('.pos-row').data('pos')];
        const pos = def.get();
        if (pos) copyText(coordsForCopy(pos, def.heading ? (def.getHeading() || 0) : undefined), this);
    });

    // Forms
    $('#inv-form').on('submit', function (e) { e.preventDefault(); addStorage(); });
    $('#veh-form').on('submit', function (e) { e.preventDefault(); addFleetVehicle('veh'); });
    $('#heli-form').on('submit', function (e) { e.preventDefault(); addFleetVehicle('heli'); });
    $('#grade-form').on('submit', function (e) { e.preventDefault(); addGrade(); });
    $('.color-field input').on('input change', function () {
        $(this).siblings('.color-hex').text($(this).val().toUpperCase());
    });

    // Storage list
    $('#inventory-list').on('click', '[data-remove-inv]', function () {
        removeWithUndo(datafaz.inv, parseInt($(this).data('remove-inv'), 10), renderInventoryList);
    });

    // Vehicle lists
    $('#creator-vehicles-list').on('click', '[data-remove-veh]', function () {
        removeWithUndo(datafaz.garage.veicoli, parseInt($(this).data('remove-veh'), 10), renderCreatorVehiclesList);
    });
    $('#creator-helivehicles-list').on('click', '[data-remove-heli]', function () {
        removeWithUndo(datafaz.helipad.veicoli, parseInt($(this).data('remove-heli'), 10), renderHelipadVehiclesList);
    });
    $('#creator-vehicles-list, #creator-helivehicles-list').on('click', '[data-delete-db-veh], [data-delete-db-heli]', function () {
        const isHeli = $(this).is('[data-delete-db-heli]');
        const id = $(this).data(isHeli ? 'delete-db-heli' : 'delete-db-veh');
        openModal({
            title: t('ui_remove_vehicle_title', "Remove '%s'?", $(this).data('name')),
            desc: t('ui_remove_vehicle_body', 'It is removed from the job straight away.'),
            confirmLabel: isHeli ? t('ui_remove_helicopter', 'Remove helicopter') : t('ui_remove_vehicle', 'Remove vehicle'),
            danger: true,
            onConfirm: function () {
                post('deleteVehicle', { id: id, job: datafaz.job });
                setTimeout(isHeli ? refreshHelipadVehiclesList : refreshVehiclesList, 300);
            }
        });
    });
    $('#creator-vehicles-list').on('click', '[data-retry]', refreshVehiclesList);
    $('#creator-helivehicles-list').on('click', '[data-retry]', refreshHelipadVehiclesList);

    // Ranks
    const gradesList = $('#grades-list');
    gradesList.on('mousedown', '.drag-handle', function (e) {
        if (e.button === 0) startGradeDrag($(this).closest('.row'), e);
    });
    gradesList.on('keydown', '.drag-handle', function (e) {
        const index = parseInt($(this).closest('.row').data('index'), 10);
        if (e.key === 'ArrowUp') { e.preventDefault(); moveGrade(index, index - 1); }
        if (e.key === 'ArrowDown') { e.preventDefault(); moveGrade(index, index + 1); }
    });
    gradesList.on('click', '[data-remove-grade]', function (e) {
        e.stopPropagation();
        const index = parseInt($(this).closest('.row').data('index'), 10);
        const rerender = () => { renumberGrades(); renderGradesList(); };
        removeWithUndo(datafaz.gradi, index, rerender);
    });
    gradesList.on('click', '.row', function (e) {
        if ($(e.target).closest('.drag-handle, [data-remove-grade]').length) return;
        editGrade(parseInt($(this).data('index'), 10));
    });

    // Messages from the Lua client
    window.addEventListener('message', function (event) {
        const item = event.data || {};

        if (item.action === 'open' && item.mode === 'creator') {
            readOpenPayload(item);
            isModifying = item.isModifying || false;
            closeModal();
            showUI();
            setupCreatorMode(item.data);
        }

        if (item.action === 'close') {
            hideUI();
        }
    });
});
