import { el, spinner, emptyState, toast, confirmDialog } from '../ui.js';
import { t } from '../i18n.js';
import { api } from '../api.js';

/* ========================================================================== */
/* Liste (nach Standort gruppiert)                                           */
/* ========================================================================== */

export async function renderInventory(mount, ctx) {
  const { go } = ctx;
  mount.append(spinner());
  let items = (await api.inventory()).items;
  let onlyLow = false;

  const listBox = el('div');

  function draw() {
    const filtered = onlyLow ? items.filter((i) => i.status === 'refill_needed') : items;
    const byLocation = new Map();
    for (const i of filtered) {
      if (!byLocation.has(i.location)) byLocation.set(i.location, []);
      byLocation.get(i.location).push(i);
    }

    listBox.replaceChildren(
      ...(byLocation.size
        ? [...byLocation.entries()].map(([location, rows]) =>
            el('div', { style: 'margin-bottom:22px' },
              el('div.section-title', {}, location, el('span.c', { text: String(rows.length) })),
              el('div.list', {},
                ...rows.map((i) =>
                  el('div.row', {},
                    i.image_path
                      ? el('img', { src: '/uploads/' + i.image_path, alt: '', style: 'width:32px;height:32px;object-fit:cover;border-radius:6px;flex:0 0 32px' })
                      : el('span', { style: 'width:32px;text-align:center;flex:0 0 32px;font-size:1.2rem', text: i.emoji || '•' }),
                    el('div.grow', {},
                      el('div.rt', { text: i.item_name }),
                      el('div.rs', { text: `${t('inv.qty')}: ${i.quantity} / ${t('inv.min')}: ${i.min_quantity}` })
                    ),
                    el('span.badge.' + (i.status === 'ok' ? 'b-completed' : 'b-unavailable'), { text: t('inv.status.' + i.status) }),
                    el('button.btn.sm', { text: '−', 'aria-label': t('inv.decrease'), onclick: () => adjust(i, -1) }),
                    el('button.btn.sm', { text: '+', 'aria-label': t('inv.increase'), onclick: () => adjust(i, 1) }),
                    el('button.btn.sm', { text: t('common.edit'), onclick: () => openEntryDialog(i, reload) }),
                    el('button.btn.sm.danger', {
                      text: '✕',
                      onclick: async () => {
                        const ok = await confirmDialog({ title: t('inv.delete_confirm', { name: i.item_name }), danger: true });
                        if (!ok) return;
                        try { await api.deleteInventory(i.id); toast(t('inv.deleted')); reload(); }
                        catch (err) { toast(err.message, 'err'); }
                      },
                    })
                  )
                )
              )
            )
          )
        : [emptyState(t('inv.none'))])
    );
  }

  async function adjust(entry, delta) {
    try {
      const { item } = await api.adjustInventory(entry.id, delta);
      Object.assign(entry, item);
      draw();
    } catch (err) { toast(err.message, 'err'); }
  }

  async function reload() {
    items = (await api.inventory()).items;
    draw();
  }

  mount.replaceChildren();
  mount.append(
    el('div.page-head', {},
      el('div', {}, el('h1', { text: t('inv.title') }), el('p', { text: t('inv.sub', { n: items.length }) })),
      el('button.btn.primary', { text: '+ ' + t('inv.new'), onclick: () => openEntryDialog(null, reload) })
    ),
    el('div.card', {},
      el('div.chips', {},
        el('button.btn.sm' + (!onlyLow ? '.primary' : ''), { text: t('common.all'), onclick: (e) => { onlyLow = false; setActive(e); draw(); } }),
        el('button.btn.sm' + (onlyLow ? '.primary' : ''), { text: t('inv.low_only'), onclick: (e) => { onlyLow = true; setActive(e); draw(); } })
      )
    ),
    el('div', { style: 'margin-top:16px' }, listBox)
  );

  function setActive(e) {
    [...e.target.parentElement.children].forEach((b) => b.classList.remove('primary'));
    e.target.classList.add('primary');
  }

  draw();
}

/* ========================================================================== */
/* Anlegen / Bearbeiten (Modal)                                              */
/* ========================================================================== */

function openEntryDialog(existing, onDone) {
  const location = el('input', { type: 'text', value: existing?.location || '', required: true, placeholder: t('inv.location_ph') });
  const quantity = el('input', { type: 'number', min: '0', value: existing?.quantity ?? 0 });
  const minQuantity = el('input', { type: 'number', min: '0', value: existing?.min_quantity ?? 0 });
  const notes = el('textarea', { value: existing?.notes || '' });

  const itemSearch = el('input', { type: 'search', placeholder: t('order.search_items'), disabled: !!existing });
  const itemResults = el('div.picker-results');
  let selectedItemId = existing?.item_id || null;
  const selectedLabel = el('div.hint', { style: 'margin-top:4px', text: existing ? existing.item_name : '' });

  let searchTimer;
  itemSearch.addEventListener('input', () => {
    clearTimeout(searchTimer);
    const q = itemSearch.value.trim();
    if (q.length < 2) { itemResults.replaceChildren(); return; }
    searchTimer = setTimeout(async () => {
      const { items: found } = await api.items({ search: q });
      itemResults.replaceChildren(
        ...found.slice(0, 30).map((it) =>
          el('button.pick', {
            type: 'button',
            onclick: () => {
              selectedItemId = it.id;
              selectedLabel.textContent = it.name;
              itemSearch.value = '';
              itemResults.replaceChildren();
            },
          }, el('span.pt', { text: it.name }))
        )
      );
    }, 180);
  });

  const root = document.getElementById('modal-root');
  const bg = el('div.modal-bg', { onclick: (e) => { if (e.target === bg) bg.remove(); } },
    el('div.modal', { role: 'dialog', 'aria-modal': 'true' },
      el('h3', { text: existing ? t('inv.edit') : t('inv.new') }),
      !existing
        ? el('div.field', {}, el('label', { text: t('inv.item') }), itemSearch, itemResults, selectedLabel)
        : el('div.field', {}, el('label', { text: t('inv.item') }), selectedLabel),
      el('div.field', {}, el('label', { text: t('inv.location') }), location),
      el('div', { style: 'display:flex;gap:10px' },
        el('div.field', { style: 'flex:1' }, el('label', { text: t('inv.qty') }), quantity),
        el('div.field', { style: 'flex:1' }, el('label', { text: t('inv.min') }), minQuantity)
      ),
      el('div.field', {}, el('label', { text: t('dino.notes') }), notes),
      el('div.modal-actions', {},
        el('button.btn.ghost', { text: t('common.cancel'), onclick: () => bg.remove() }),
        el('button.btn.primary', {
          text: existing ? t('dino.save') : t('dino.create'),
          onclick: async () => {
            if (!selectedItemId) { toast(t('inv.item_required'), 'err'); return; }
            if (!location.value.trim()) { toast(t('inv.location_required'), 'err'); return; }
            const body = { itemId: selectedItemId, location: location.value.trim(), quantity: quantity.value, minQuantity: minQuantity.value, notes: notes.value.trim() };
            try {
              if (existing) await api.updateInventory(existing.id, body);
              else await api.createInventory(body);
              toast(existing ? t('dino.saved') : t('dino.created'));
              bg.remove();
              onDone();
            } catch (err) { toast(err.message, 'err'); }
          },
        })
      )
    )
  );
  root.append(bg);
  setTimeout(() => (existing ? location : itemSearch).focus(), 30);
}
