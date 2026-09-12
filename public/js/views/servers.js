import { el, spinner, emptyState, toast, confirmDialog, fileToBase64 } from '../ui.js';
import { t } from '../i18n.js';
import { api } from '../api.js';

const CATEGORY_ICON = {
  base: '🏠', turret_base: '⚔️', warroom: '📦', farm: '🌾', resource: '⛏️',
  dino: '🦖', loot: '💎', cave: '🕳️', boss: '👑', other: '📍',
};
const CATEGORIES = Object.keys(CATEGORY_ICON);

/* ========================================================================== */
/* Server-Liste                                                              */
/* ========================================================================== */

export async function renderServers(mount, ctx) {
  const { go } = ctx;
  mount.append(spinner());
  const { servers } = await api.servers();

  mount.replaceChildren();
  mount.append(
    el('div.page-head', {},
      el('div', {}, el('h1', { text: t('srv.title') }), el('p', { text: t('srv.sub', { n: servers.length }) })),
      el('button.btn.primary', { text: '+ ' + t('srv.new'), onclick: () => openServerDialog(null, () => go('/servers', true)) })
    ),
    servers.length
      ? el('div.server-map-list', {},
          ...servers.map((s) =>
            el('button.server-map-card', { onclick: () => go('/servers/' + s.id) },
              s.map_image_path
                ? el('img', { src: '/uploads/' + s.map_image_path, alt: s.map_name })
                : el('div.server-map-missing', { text: t('srv.map_image_missing') }),
              el('div.server-map-copy', {},
                el('div', {}, el('div.rt', { text: s.name }), el('div.rs', { text: s.map_name })),
                el('span.badge.' + (s.status === 'active' ? 'b-completed' : 'b-cancelled'), { text: t('srv.status.' + s.status) })
              )
            )
          )
        )
      : emptyState(t('srv.none'))
  );
}

function openServerDialog(existing, onDone) {
  const name = el('input', { type: 'text', value: existing?.name || '', required: true });
  const mapName = el('input', { type: 'text', value: existing?.map_name || '', required: true, placeholder: t('srv.map_ph') });
  const status = el('select', {}, ...['active', 'inactive'].map((s) => el('option', { value: s, text: t('srv.status.' + s), selected: (existing?.status || 'active') === s })));
  const notes = el('textarea', { value: existing?.notes || '' });

  const root = document.getElementById('modal-root');
  const bg = el('div.modal-bg', { onclick: (e) => { if (e.target === bg) bg.remove(); } },
    el('div.modal', { role: 'dialog', 'aria-modal': 'true' },
      el('h3', { text: existing ? t('srv.edit') : t('srv.new') }),
      el('div.field', {}, el('label', { text: t('srv.name') }), name),
      el('div.field', {}, el('label', { text: t('srv.map') }), mapName),
      el('div.field', {}, el('label', { text: t('srv.status_label') }), status),
      el('div.field', {}, el('label', { text: t('dino.notes') }), notes),
      el('div.modal-actions', {},
        el('button.btn.ghost', { text: t('common.cancel'), onclick: () => bg.remove() }),
        el('button.btn.primary', {
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
  root.append(bg);
  setTimeout(() => name.focus(), 30);
}

/* ========================================================================== */
/* Server-Detail: Marker-Liste + schematische Karte                          */
/* ========================================================================== */

export async function renderServerDetail(mount, ctx, idParam) {
  const { go, user } = ctx;
  const id = parseInt(idParam, 10);
  mount.append(spinner());
  let data;
  try {
    data = (await api.server(id)).server;
  } catch (err) {
    mount.replaceChildren(emptyState(err.message));
    return;
  }

  let activeMarkerId = null;
  const canDelete = user.roles.includes('admin') || user.roles.includes('developer');

  const mapBox = el('div.map-grid-wrap');
  const listBox = el('div.list', { style: 'margin-top:10px' });

  function drawMap() {
    mapBox.replaceChildren();
    if (!data.map_image_path) {
      mapBox.append(el('div.map-upload-empty', {},
        el('strong', { text: t('srv.map_image_missing') }),
        el('span', { text: t('srv.map_image_hint') })
      ));
      return;
    }
    const canvas = el('div.map-canvas', {
      onclick: (event) => {
        if (event.target.closest('.map-pin')) return;
        const rect = event.currentTarget.getBoundingClientRect();
        const coord_x = Math.max(0, Math.min(100, ((event.clientX - rect.left) / rect.width) * 100)).toFixed(1);
        const coord_y = Math.max(0, Math.min(100, ((event.clientY - rect.top) / rect.height) * 100)).toFixed(1);
        openMarkerDialog({ coord_x, coord_y }, id, reload);
      },
    },
      el('img', { src: '/uploads/' + data.map_image_path, alt: data.map_name }),
      ...data.markers.filter((m) => m.coord_x != null && m.coord_y != null).map((m) =>
        el('button.map-pin' + (m.id === activeMarkerId ? '.active' : ''), {
          style: `left:${m.coord_x}%;top:${m.coord_y}%`,
          title: m.name,
          'aria-label': m.name,
          text: CATEGORY_ICON[m.category] || '📍',
          onclick: (event) => { event.stopPropagation(); activeMarkerId = m.id; drawMap(); drawList(); },
        })
      )
    );
    mapBox.append(canvas);
  }

  function drawList() {
    listBox.replaceChildren(
      ...(data.markers.length
        ? data.markers.map((m) =>
            el('div.row' + (m.id === activeMarkerId ? '.active-row' : ''), {
              style: 'cursor:pointer',
              onclick: () => { activeMarkerId = m.id; drawMap(); drawList(); },
            },
              m.image_path
                ? el('img', { src: '/uploads/' + m.image_path, alt: '', style: 'width:32px;height:32px;object-fit:cover;border-radius:6px;flex:0 0 32px' })
                : el('span', { style: 'width:32px;text-align:center;flex:0 0 32px;font-size:1.2rem', text: CATEGORY_ICON[m.category] || '📍' }),
              el('div.grow', {},
                el('div.rt', { text: m.name }),
                el('div.rs', { text: [t('srv.cat.' + m.category), m.coord_x != null ? `${m.coord_x}, ${m.coord_y}` : null].filter(Boolean).join(' · ') })
              ),
              el('button.btn.sm', { text: t('common.edit'), onclick: (e) => { e.stopPropagation(); openMarkerDialog(m, id, reload); } }),
              el('button.btn.sm.danger', {
                text: '✕',
                onclick: async (e) => {
                  e.stopPropagation();
                  const ok = await confirmDialog({ title: t('srv.delete_marker_confirm', { name: m.name }), danger: true });
                  if (!ok) return;
                  try { await api.deleteMarker(m.id); toast(t('srv.marker_deleted')); reload(); }
                  catch (err) { toast(err.message, 'err'); }
                },
              })
            )
          )
        : [emptyState(t('srv.no_markers'))])
    );
  }

  async function reload() {
    data = (await api.server(id)).server;
    if (!data.markers.some((m) => m.id === activeMarkerId)) activeMarkerId = null;
    drawMap();
    drawList();
  }

  mount.replaceChildren();
  const mapFile = el('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp', style: 'display:none' });
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
  mount.append(
    el('div.page-head', {}, el('button.btn.sm', { text: '← ' + t('common.back'), onclick: () => go('/servers') })),
    el('div.card', {},
      el('div', { style: 'display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:10px' },
        el('div', {},
          el('div', { style: 'font-family:var(--ff-display);font-size:1.3rem;font-weight:700', text: data.name }),
          el('div', { style: 'color:var(--muted)', text: data.map_name })
        ),
        el('div.chips', {},
          el('button.btn.sm', { text: t('srv.map_image_upload'), onclick: () => mapFile.click() }),
          el('button.btn.sm', { text: t('common.edit'), onclick: () => openServerDialog(data, reload) }),
          mapFile
        )
      )
    ),
    el('div.section-title', { style: 'margin-top:18px' },
      t('srv.markers'), ' ',
      el('button.btn.sm.primary', { style: 'margin-left:10px', text: '+ ' + t('srv.new_marker'), onclick: () => openMarkerDialog(null, id, reload) })
    ),
    mapBox,
    listBox,
    // Nie ein rohes null direkt an mount.append() übergeben - siehe dieselbe
    // Lektion in dinos.js: das native append() würde es sonst als Text "null"
    // anzeigen. Deshalb hier ueber ein gefiltertes Array spreaden.
    ...[
      canDelete
        ? el('div', { style: 'margin-top:20px' },
            el('button.btn.danger', {
              text: t('srv.delete_server'),
              onclick: async () => {
                const ok = await confirmDialog({ title: t('srv.delete_server_confirm', { name: data.name }), danger: true });
                if (!ok) return;
                try { await api.deleteServer(id); toast(t('srv.server_deleted')); go('/servers'); }
                catch (err) { toast(err.message, 'err'); }
              },
            })
          )
        : null,
    ].filter(Boolean)
  );

  drawMap();
  drawList();
}

function openMarkerDialog(existing, serverId, onDone) {
  const isEditing = Boolean(existing?.id);
  const name = el('input', { type: 'text', value: existing?.name || '', required: true });
  const category = el('select', {}, ...CATEGORIES.map((c) => el('option', { value: c, text: `${CATEGORY_ICON[c]} ${t('srv.cat.' + c)}`, selected: (existing?.category || 'other') === c })));
  const coordX = el('input', { type: 'number', step: '0.1', min: '0', max: '100', value: existing?.coord_x ?? '' });
  const coordY = el('input', { type: 'number', step: '0.1', min: '0', max: '100', value: existing?.coord_y ?? '' });
  const description = el('textarea', { value: existing?.description || '' });

  const root = document.getElementById('modal-root');
  const bg = el('div.modal-bg', { onclick: (e) => { if (e.target === bg) bg.remove(); } },
    el('div.modal', { role: 'dialog', 'aria-modal': 'true' },
      el('h3', { text: isEditing ? t('srv.edit_marker') : t('srv.new_marker') }),
      el('div.field', {}, el('label', { text: t('dino.name') }), name),
      el('div.field', {}, el('label', { text: t('srv.category') }), category),
      el('div', { style: 'display:flex;gap:10px' },
        el('div.field', { style: 'flex:1' }, el('label', { text: 'X (0–100)' }), coordX),
        el('div.field', { style: 'flex:1' }, el('label', { text: 'Y (0–100)' }), coordY)
      ),
      el('div.field', {}, el('label', { text: t('srv.description') }), description),
      el('div.modal-actions', {},
        el('button.btn.ghost', { text: t('common.cancel'), onclick: () => bg.remove() }),
        el('button.btn.primary', {
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
  root.append(bg);
  setTimeout(() => name.focus(), 30);
}
