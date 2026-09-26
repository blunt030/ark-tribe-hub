import { el, spinner, emptyState, toast, confirmDialog, fileToBase64, pageHead, pill, kebabMenu, tabBar, emptyBlock } from '../ui.js';
import { t } from '../i18n.js';
import { api } from '../api.js';
import { STANDARD_MAPS, mitgeliefertesKartenbild } from '../map-images.js';
import { uiIcon } from '../ui-icons.js';

const CATEGORIES = ['base', 'turret_base', 'warroom', 'farm', 'resource', 'dino', 'loot', 'cave', 'boss', 'other'];

/** Darstellungsgruppen fuer Symbol, Farbe, Legende und Filter. */
export const MARKER_KINDS = {
  base: { icon: 'house', label: 'srv.filter.base' },
  resource: { icon: 'diamond', label: 'srv.filter.resources' },
  danger: { icon: 'skull', label: 'srv.filter.danger' },
  cave: { icon: 'mountains', label: 'srv.cat.cave' },
  loot: { icon: 'package', label: 'srv.cat.loot' },
  other: { icon: 'map-pin', label: 'srv.filter.other' },
};
export function markerKind(category) {
  if (['base', 'turret_base', 'warroom', 'farm'].includes(category)) return 'base';
  if (category === 'resource') return 'resource';
  if (['dino', 'boss'].includes(category)) return 'danger';
  if (category === 'cave') return 'cave';
  if (category === 'loot') return 'loot';
  return 'other';
}
const FILTERS = {
  all: () => true,
  base: (m) => markerKind(m.category) === 'base',
  resource: (m) => ['resource', 'loot'].includes(markerKind(m.category)),
  danger: (m) => markerKind(m.category) === 'danger',
  other: (m) => ['cave', 'other'].includes(markerKind(m.category)),
};

function serverKartenbild(server) {
  return server.map_image_path
    ? '/uploads/' + server.map_image_path
    : mitgeliefertesKartenbild(server.map_name);
}

const hasCoords = (m) => m.coord_x != null && m.coord_y != null && m.coord_x !== '' && m.coord_y !== ''
  && Number.isFinite(Number(m.coord_x)) && Number.isFinite(Number(m.coord_y));
const clampPct = (v) => Math.min(100, Math.max(0, Number(v)));
/** ARK-Koordinaten: Lat = vertikal (y), Lon = horizontal (x). */
export function coordText(m) {
  return hasCoords(m) ? `Lat ${Number(m.coord_y).toFixed(1)} · Lon ${Number(m.coord_x).toFixed(1)}` : '';
}

/**
 * Kartenflaeche ohne Verzerrung: Der Rahmen uebernimmt exakt das
 * Seitenverhaeltnis der Bilddatei, Marker liegen prozentual darin. Der Rest der
 * Buehne zeigt eine unscharfe Kopie der Karte statt grauer Raender.
 */
export function mapBoard(src, fallback, markers, { onPin, activeId = null, labels = false, onPlace = null } = {}) {
  const frame = el('div.map-frame' + (onPlace ? '.is-placeable' : ''));
  const img = el('img.map-image', { src, alt: '', decoding: 'async', draggable: 'false' });
  const setRatio = () => {
    if (!img.naturalWidth) return;
    frame.style.setProperty('--map-ar', `${img.naturalWidth} / ${img.naturalHeight}`);
    frame.style.setProperty('--map-r', String(img.naturalWidth / img.naturalHeight));
  };
  img.addEventListener('load', setRatio);
  img.addEventListener('error', () => { if (fallback && img.getAttribute('src') !== fallback) { img.src = fallback; stage.style.setProperty('--map-bg', `url("${fallback}")`); } }, { once: false });
  frame.append(img, ...markers.filter(hasCoords).map((m) => {
    const kind = markerKind(m.category);
    return el('button.map-pin.mk-' + kind + (m.id === activeId ? '.active' : ''), {
      type: 'button',
      style: `left:${clampPct(m.coord_x)}%;top:${clampPct(m.coord_y)}%`,
      title: m.name, 'aria-label': m.name,
      onclick: (event) => { event.stopPropagation(); onPin?.(m); },
    }, el('span.pin-head', {}, uiIcon(MARKER_KINDS[kind].icon)), labels || m.id === activeId ? el('span.pin-label', { text: m.name }) : null);
  }));
  if (onPlace) {
    frame.addEventListener('click', (event) => {
      if (event.target.closest('.map-pin')) return;
      const rect = frame.getBoundingClientRect();
      const x = Math.max(0, Math.min(100, ((event.clientX - rect.left) / rect.width) * 100)).toFixed(1);
      const y = Math.max(0, Math.min(100, ((event.clientY - rect.top) / rect.height) * 100)).toFixed(1);
      onPlace({ coord_x: x, coord_y: y });
    });
  }
  const stage = el('div.map-stage', { style: `--map-bg:url("${src}")` }, frame);
  if (img.complete) setRatio();
  return stage;
}

/* ========================================================================== */
/* Server-Liste                                                              */
/* ========================================================================== */

export async function renderServers(mount, ctx) {
  const { go } = ctx;
  mount.append(spinner());
  const { servers } = await api.servers();

  mount.replaceChildren(
    pageHead({
      title: t('srv.title'), sub: t('page.servers.sub'), icon: 'map',
      actions: [el('button.btn.primary.lux', { type: 'button', onclick: () => openServerDialog(null, () => go('/servers', true)) }, uiIcon('plus'), el('span', { text: t('srv.new') }))],
    }),
    servers.length
      ? el('div.server-grid', {},
          ...servers.map((s) => {
            const src = serverKartenbild(s);
            return el('button.server-card', { type: 'button', onclick: () => go('/servers/' + s.id) },
              el('span.server-card-map', {}, src ? el('img', { src, alt: '', loading: 'lazy' }) : el('span.server-map-missing', {}, uiIcon('map'), el('small', { text: t('srv.map_image_missing') }))),
              el('span.server-card-copy', {},
                el('strong', { text: s.name }),
                el('span', { text: s.map_name }),
                pill(t('srv.status.' + s.status), s.status === 'active' ? 'done' : 'muted')),
              uiIcon('caret-right', 'server-card-chevron'));
          }))
      : emptyBlock('map', t('srv.none'), t('srv.map_image_hint'))
  );
}

function openServerDialog(existing, onDone) {
  const name = el('input', { type: 'text', value: existing?.name || '', required: true, id: 'srv-name' });
  const mapListId = 'server-map-names';
  const mapName = el('input', { type: 'text', value: existing?.map_name || '', required: true, placeholder: t('srv.map_ph'), list: mapListId, id: 'srv-map' });
  const mapNames = el('datalist', { id: mapListId }, ...STANDARD_MAPS.map((map) => el('option', { value: map.name })));
  const status = el('select', { id: 'srv-status' }, ...['active', 'inactive'].map((s) => el('option', { value: s, text: t('srv.status.' + s), selected: (existing?.status || 'active') === s })));
  const notes = el('textarea', { id: 'srv-notes' });
  notes.value = existing?.notes || '';

  const root = document.getElementById('modal-root');
  const bg = el('div.modal-bg', { onclick: (e) => { if (e.target === bg) bg.remove(); } },
    el('div.modal', { role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'srv-dialog-title' },
      el('h3', { id: 'srv-dialog-title' }, uiIcon('map'), el('span', { text: existing ? t('srv.edit') : t('srv.new') })),
      el('div.field', {}, el('label', { for: 'srv-name', text: t('srv.name') }), name),
      el('div.field', {}, el('label', { for: 'srv-map', text: t('srv.map') }), mapName, mapNames),
      el('div.field', {}, el('label', { for: 'srv-status', text: t('srv.status_label') }), status),
      el('div.field', {}, el('label', { for: 'srv-notes', text: t('dino.notes') }), notes),
      el('div.modal-actions', {},
        el('button.btn.ghost', { type: 'button', text: t('common.cancel'), onclick: () => bg.remove() }),
        el('button.btn.primary', {
          type: 'button',
          text: existing ? t('dino.save') : t('dino.create'),
          onclick: async () => {
            if (!name.value.trim() || !mapName.value.trim()) { toast(t('srv.name_map_required'), 'err'); return; }
            try {
              if (existing) await api.updateServer(existing.id, { name: name.value.trim(), mapName: mapName.value.trim(), status: status.value, notes: notes.value.trim() });
              else await api.createServer({ name: name.value.trim(), mapName: mapName.value.trim(), status: status.value, notes: notes.value.trim() });
              toast(existing ? t('srv.saved') : t('srv.created'));
              bg.remove();
              onDone();
            } catch (err) { toast(err.message, 'err'); }
          },
        })
      )
    )
  );
  bg.addEventListener('keydown', (e) => { if (e.key === 'Escape') bg.remove(); });
  root.append(bg);
  setTimeout(() => name.focus(), 30);
}

/* ========================================================================== */
/* Server-Detail: Karte + Markierungen                                        */
/* ========================================================================== */

export async function renderServerDetail(mount, ctx, idParam) {
  const { go, user } = ctx;
  const id = parseInt(idParam, 10);
  mount.append(spinner());
  let data, servers = [];
  try {
    [data, servers] = await Promise.all([
      api.server(id).then((r) => r.server),
      api.servers().then((r) => r.servers).catch(() => []),
    ]);
  } catch (err) {
    mount.replaceChildren(pageHead({ title: t('srv.title'), back: { onclick: () => go('/servers') } }), emptyState(err.message));
    return;
  }

  let activeMarkerId = null;
  let filter = 'all';
  const canDelete = user.roles.includes('admin') || user.roles.includes('developer');

  const mapBox = el('div.server-map-card');
  const listBox = el('div.marker-list');
  const countLabel = el('span.ark-count');

  function drawMap() {
    const mapSrc = serverKartenbild(data);
    if (!mapSrc) {
      mapBox.replaceChildren(emptyBlock('map', t('srv.map_image_missing'), t('srv.map_image_hint'),
        el('button.btn.sm', { type: 'button', onclick: () => mapFile.click() }, uiIcon('image'), el('span', { text: t('srv.map_image_upload') }))));
      return;
    }
    const visible = data.markers.filter(FILTERS[filter]);
    const used = [...new Set(data.markers.map((m) => markerKind(m.category)))];
    mapBox.replaceChildren(
      mapBoard(mapSrc, mitgeliefertesKartenbild(data.map_name), visible, {
        activeId: activeMarkerId,
        labels: true,
        onPin: (m) => { activeMarkerId = m.id; drawMap(); drawList(true); },
        onPlace: (coords) => openMarkerDialog(coords, id, reload),
      }),
      el('div.map-compass', { 'aria-hidden': 'true' }, uiIcon('compass')),
      used.length ? el('div.map-legend', { 'aria-label': t('dash.legend') },
        ...used.map((kind) => el('span', {}, el('i.marker-dot.mk-' + kind, {}, uiIcon(MARKER_KINDS[kind].icon)), el('span', { text: t(MARKER_KINDS[kind].label) })))) : null,
      el('p.map-hint', {}, uiIcon('map-pin'), el('span', { text: t('srv.tap_to_place') }))
    );
  }

  function drawList(scrollToActive = false) {
    const visible = data.markers.filter(FILTERS[filter]);
    countLabel.textContent = String(data.markers.length);
    listBox.replaceChildren(
      ...(visible.length
        ? visible.map((m) => {
            const kind = markerKind(m.category);
            const row = el('div.marker-row' + (m.id === activeMarkerId ? '.active' : ''), {
              role: 'button', tabindex: '0',
              onclick: () => { activeMarkerId = m.id; drawMap(); drawList(); },
              onkeydown: (e) => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); activeMarkerId = m.id; drawMap(); drawList(); } },
            },
              m.image_path
                ? el('img.marker-thumb', { src: '/uploads/' + m.image_path, alt: '' })
                : el('i.marker-dot.mk-' + kind, {}, uiIcon(MARKER_KINDS[kind].icon)),
              el('div.marker-copy', {},
                el('strong', { text: m.name }),
                el('small', { text: [t('srv.cat.' + m.category), coordText(m)].filter(Boolean).join(' · ') })),
              kebabMenu([
                { label: t('common.edit'), icon: 'pencil-simple', onclick: () => openMarkerDialog(m, id, reload) },
                { label: t('common.delete'), icon: 'trash', danger: true, onclick: async () => {
                  const ok = await confirmDialog({ title: t('srv.delete_marker_confirm', { name: m.name }), danger: true });
                  if (!ok) return;
                  try { await api.deleteMarker(m.id); toast(t('srv.marker_deleted')); reload(); }
                  catch (err) { toast(err.message, 'err'); }
                } },
              ])
            );
            return row;
          })
        : [el('p.marker-empty', {}, uiIcon('map-pin'), el('span', { text: t('srv.no_markers') }))])
    );
    if (scrollToActive) listBox.querySelector('.marker-row.active')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  async function reload() {
    data = (await api.server(id)).server;
    if (!data.markers.some((m) => m.id === activeMarkerId)) activeMarkerId = null;
    drawMap();
    drawList();
  }

  const mapFile = el('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp', hidden: true });
  mapFile.addEventListener('change', async () => {
    const file = mapFile.files[0];
    if (!file) return;
    try {
      const result = await api.uploadServerMap(id, { imageBase64: await fileToBase64(file), mimeType: file.type });
      data.map_image_path = result.mapImagePath;
      toast(t('srv.map_image_saved'));
      drawMap();
    } catch (err) { toast(err.message, 'err'); }
  });

  const thumbSrc = serverKartenbild(data);
  const serverSelect = el('label.server-select', {},
    thumbSrc ? el('img', { src: thumbSrc, alt: '' }) : uiIcon('map'),
    el('select', { 'aria-label': t('srv.select'), onchange: (e) => go('/servers/' + e.target.value) },
      ...(servers.length ? servers : [data]).map((s) => el('option', { value: String(s.id), selected: Number(s.id) === id, text: `${s.map_name} · ${s.name}` }))));

  const manage = kebabMenu([
    { label: t('common.edit'), icon: 'pencil-simple', onclick: () => openServerDialog(data, reload) },
    { label: t('srv.map_image_upload'), icon: 'image', onclick: () => mapFile.click() },
    canDelete ? { label: t('srv.delete_server'), icon: 'trash', danger: true, onclick: async () => {
      const ok = await confirmDialog({ title: t('srv.delete_server_confirm', { name: data.name }), danger: true });
      if (!ok) return;
      try { await api.deleteServer(id); toast(t('srv.server_deleted')); go('/servers'); }
      catch (err) { toast(err.message, 'err'); }
    } } : null,
  ], t('srv.manage'));

  const filterTabs = tabBar([
    { key: 'all', label: t('common.all') },
    { key: 'base', label: t('srv.filter.base') },
    { key: 'resource', label: t('srv.filter.resources') },
    { key: 'danger', label: t('srv.filter.danger') },
    { key: 'other', label: t('srv.filter.other') },
  ], filter, (key) => { filter = key; drawMap(); drawList(); }, 'is-small');

  mount.replaceChildren(
    pageHead({
      title: t('srv.title'), sub: t('page.servers.sub'), icon: 'map',
      back: { onclick: () => go('/servers') },
      extra: el('div.banner-row', {}, serverSelect, pill(t('srv.status.' + data.status), data.status === 'active' ? 'done' : 'muted')),
      actions: [manage],
    }),
    el('div.server-workspace', {},
      mapBox,
      el('aside.ark-panel.marker-panel', {},
        el('header.ark-panel-head', {}, uiIcon('map-pin', 'ark-panel-icon'), el('h2', { text: t('srv.markers') }), countLabel),
        el('button.btn.primary.lux.block', { type: 'button', onclick: () => openMarkerDialog(null, id, reload) }, uiIcon('plus'), el('span', { text: t('srv.add_marker') })),
        filterTabs,
        listBox)
    ),
    mapFile
  );

  drawMap();
  drawList();
}

function openMarkerDialog(existing, serverId, onDone) {
  const isEditing = Boolean(existing?.id);
  const name = el('input', { type: 'text', value: existing?.name || '', required: true, id: 'mk-name' });
  const category = el('select', { id: 'mk-cat' }, ...CATEGORIES.map((c) => el('option', { value: c, text: t('srv.cat.' + c), selected: (existing?.category || 'other') === c })));
  const coordX = el('input', { type: 'number', step: '0.1', min: '0', max: '100', value: existing?.coord_x ?? '', id: 'mk-x', inputmode: 'decimal' });
  const coordY = el('input', { type: 'number', step: '0.1', min: '0', max: '100', value: existing?.coord_y ?? '', id: 'mk-y', inputmode: 'decimal' });
  const description = el('textarea', { id: 'mk-desc' });
  description.value = existing?.description || '';

  const root = document.getElementById('modal-root');
  const bg = el('div.modal-bg', { onclick: (e) => { if (e.target === bg) bg.remove(); } },
    el('div.modal', { role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'mk-dialog-title' },
      el('h3', { id: 'mk-dialog-title' }, uiIcon('map-pin'), el('span', { text: isEditing ? t('srv.edit_marker') : t('srv.new_marker') })),
      el('div.field', {}, el('label', { for: 'mk-name', text: t('dino.name') }), name),
      el('div.field', {}, el('label', { for: 'mk-cat', text: t('srv.category') }), category),
      el('div.field-row', {},
        el('div.field', {}, el('label', { for: 'mk-y', text: 'Lat (Y, 0–100)' }), coordY),
        el('div.field', {}, el('label', { for: 'mk-x', text: 'Lon (X, 0–100)' }), coordX)
      ),
      el('div.field', {}, el('label', { for: 'mk-desc', text: t('srv.description') }), description),
      el('div.modal-actions', {},
        el('button.btn.ghost', { type: 'button', text: t('common.cancel'), onclick: () => bg.remove() }),
        el('button.btn.primary', {
          type: 'button',
          text: isEditing ? t('dino.save') : t('dino.create'),
          onclick: async () => {
            if (!name.value.trim()) { toast(t('common.name_required'), 'err'); return; }
            const body = { name: name.value.trim(), category: category.value, coordX: coordX.value, coordY: coordY.value, description: description.value.trim() };
            try {
              if (isEditing) await api.updateMarker(existing.id, body);
              else await api.createMarker(serverId, body);
              toast(isEditing ? t('dino.saved') : t('dino.created'));
              bg.remove();
              onDone();
            } catch (err) { toast(err.message, 'err'); }
          },
        })
      )
    )
  );
  bg.addEventListener('keydown', (e) => { if (e.key === 'Escape') bg.remove(); });
  root.append(bg);
  setTimeout(() => name.focus(), 30);
}
