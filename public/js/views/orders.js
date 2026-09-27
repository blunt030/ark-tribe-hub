import { el, spinner, orderCard, emptyState, toast, confirmDialog, pageHead, pill, kebabMenu, tabBar, avatar, panel, emptyBlock, orderProgress, orderTone, orderToneLabel } from '../ui.js';
import { itemArt } from '../icons.js';
import { t, timeAgo, fmtDate, fmtStamp } from '../i18n.js';
import { api } from '../api.js';
import { uiIcon } from '../ui-icons.js';

const CLOSED = ['completed', 'cancelled'];
const CATEGORY_KEY = 'ath_order_category';

/** Kategorien des Bestellablaufs. Lebende Kreaturen werden bewusst nicht bestellt. */
const CATEGORY_TILES = [
  { key: 'eggs', label: () => t('order.cat.eggs'), art: { key: 'rex_egg', product_type: 'egg' } },
  { key: 'embryos', label: () => t('order.cat.embryos'), art: { key: 'embryo', product_type: 'embryo' } },
  { key: 'saddles', label: () => t('order.cat.saddles'), art: { key: 'argentavis_saddle', product_type: 'saddle' } },
  { key: 'structures', label: () => t('order.cat.structures'), art: { key: 'metal_foundation', product_type: 'structure' } },
  { key: 'other', label: () => t('order.cat.other'), art: { key: 'tek_generator', product_type: 'structure' } },
];

function categoryTile(tile, active, onclick) {
  return el('button.cat-tile' + (active ? '.on' : ''), { type: 'button', onclick, 'aria-pressed': active ? 'true' : 'false' },
    itemArt(tile.art, { eggFirst: true }),
    el('span.cat-tile-label', { text: tile.label() }));
}

/* ========================================================================== */
/* Uebersicht                                                                 */
/* ========================================================================== */

export async function renderOrders(mount, ctx) {
  const { user, go } = ctx;
  mount.classList.add('orders-page');
  let scope = 'open';
  let prioFilter = 'all';
  let typeFilter = 'all';
  let cachedOrders = [];

  const search = el('input', { type: 'search', placeholder: t('orders.search_ph'), 'aria-label': t('common.search') });
  const listBox = el('div.orders-list');
  const tabsBox = el('div.orders-tabs-slot');
  const filterDot = el('span.filter-dot', { hidden: true });
  const filterPanel = el('div.filter-panel', { hidden: true });
  const filterBtn = el('button.icon-btn', { type: 'button', 'aria-label': t('orders.filter'), title: t('orders.filter'), 'aria-expanded': 'false',
    onclick: () => { filterPanel.hidden = !filterPanel.hidden; filterBtn.setAttribute('aria-expanded', String(!filterPanel.hidden)); } },
  uiIcon('sliders-horizontal'), filterDot);

  const inScope = (o, key) => key === 'open' ? !CLOSED.includes(o.status)
    : key === 'mine' ? o.member_id === user.id && !CLOSED.includes(o.status)
      : key === 'done' ? CLOSED.includes(o.status) : true;
  const typeKey = (o) => {
    const types = o.items.map((i) => i.product_type);
    if (types.includes('egg')) return 'eggs';
    if (types.includes('embryo')) return 'embryos';
    if (types.includes('saddle')) return 'saddles';
    if (types.includes('structure')) return 'structures';
    return 'other';
  };

  function drawTabs() {
    tabsBox.replaceChildren(tabBar(
      [['open', t('filter.open')], ['mine', t('filter.mine')], ['done', t('filter.history')], ['all', t('filter.all')]]
        .map(([key, label]) => ({ key, label, count: cachedOrders.filter((o) => inScope(o, key)).length })),
      scope, (key) => { scope = key; drawOrders(); }));
  }

  function drawFilterPanel() {
    const chipRow = (label, options, current, set) => el('div.filter-group', {},
      el('span.filter-label', { text: label }),
      el('div.chips', {}, ...options.map(([key, text]) => el('button.chip' + (current === key ? '.on' : ''), {
        type: 'button', text, onclick: () => { set(key); drawFilterPanel(); drawOrders(); },
      }))));
    filterPanel.replaceChildren(
      chipRow(t('orders.filter_prio'), [['all', t('common.all')], ['normal', t('prio.normal')], ['high', t('prio.high')], ['urgent', t('prio.urgent')]], prioFilter, (k) => { prioFilter = k; }),
      chipRow(t('orders.filter_type'), [['all', t('common.all')], ...CATEGORY_TILES.map((c) => [c.key, c.label()])], typeFilter, (k) => { typeFilter = k; }),
      el('button.btn.sm.ghost', { type: 'button', text: t('orders.filter_reset'), onclick: () => { prioFilter = 'all'; typeFilter = 'all'; drawFilterPanel(); drawOrders(); } }));
    filterDot.hidden = prioFilter === 'all' && typeFilter === 'all';
  }

  function drawOrders() {
    const query = search.value.trim().toLocaleLowerCase();
    const filtered = cachedOrders.filter((order) => inScope(order, scope)
      && (prioFilter === 'all' || order.priority === prioFilter)
      && (typeFilter === 'all' || typeKey(order) === typeFilter)
      && (!query || [order.member_username, order.note, order.assigned_username, ...order.items.map((i) => i.item_name)].join(' ').toLocaleLowerCase().includes(query)));
    listBox.replaceChildren(filtered.length
      ? el('div.illustrated-orders-grid', {}, ...filtered.map((o) => orderCard(o, (id) => go('/orders/' + id), { showImages: true, illustrated: true })))
      : cachedOrders.some((o) => inScope(o, scope))
        ? emptyBlock('magnifying-glass', t('orders.none_filtered'))
        : emptyBlock('clipboard-text', t('orders.none'), scope === 'open' ? t('orders.none_sub') : null,
          el('button.btn.primary.sm', { type: 'button', onclick: () => go('/orders/new') }, uiIcon('plus'), el('span', { text: t('order.new') }))));
  }
  search.addEventListener('input', drawOrders);

  const startNew = (key) => { try { sessionStorage.setItem(CATEGORY_KEY, key); } catch { /* optional */ } go('/orders/new'); };

  mount.append(
    pageHead({
      title: t('nav.orders'), sub: t('page.orders.sub'), icon: 'clipboard-text',
      actions: [el('button.btn.primary.lux', { type: 'button', onclick: () => go('/orders/new') }, uiIcon('plus'), el('span', { text: t('order.new') }))],
    }),
    el('div.orders-toolbar', {}, tabsBox,
      el('div.search-field', {}, uiIcon('magnifying-glass'), search), filterBtn),
    filterPanel,
    listBox,
    el('section.quick-order', {},
      el('div.quick-order-copy', {}, uiIcon('clipboard-text', 'quick-order-icon'),
        el('div', {}, el('h2', { text: t('orders.quick_title') }), el('p', { text: t('orders.quick_sub') }))),
      el('div.quick-order-tiles', {}, ...CATEGORY_TILES.map((tile) => categoryTile(tile, false, () => startNew(tile.key)))))
  );
  drawFilterPanel();
  listBox.replaceChildren(spinner());
  try {
    cachedOrders = (await api.orders()).orders;
    drawTabs();
    drawOrders();
  } catch (err) {
    listBox.replaceChildren(emptyState(err.message));
  }
}

/* ========================================================================== */
/* Neue Bestellung                                                            */
/* ========================================================================== */

export async function renderNewOrder(mount, ctx) {
  const { go } = ctx;
  mount.classList.add('new-order-page');
  const chosen = []; // { itemId, name, product_type, key, image_path, quantity }
  let priority = 'normal';
  let renderToken = 0; // schuetzt vor ueberholten Antworten (Kategorie vs. Suche)

  // Fachliche Gruppen. Eier und Embryos sind getrennt; lebende Kreaturen werden
  // nicht bestellt. "Sonstiges" haelt Ressourcen und Sonderteile erreichbar.
  const BAUSTUFEN = ['thatch', 'wood', 'stone', 'metal', 'tek', 'other'];
  const HABITAT_AWARE_TYPES = ['egg', 'embryo', 'saddle'];
  const GRUPPEN = {
    eggs: { label: () => t('order.sub.eggs'), types: ['egg'] },
    embryos: { label: () => t('order.sub.embryos'), types: ['embryo'] },
    saddles: { label: () => t('order.group.saddles'), hint: () => t('order.group.saddles_hint'), types: ['saddle'] },
    structures: { label: () => t('order.group.structures'), hint: () => t('order.group.structures_hint'), types: ['structure'], tiers: true },
    other: { label: () => t('order.group.other'), hint: () => t('order.group.other_hint'), types: ['resource'] },
  };

  let activeCat = 'eggs';
  try {
    const wanted = sessionStorage.getItem(CATEGORY_KEY);
    if (wanted && GRUPPEN[wanted]) activeCat = wanted;
    sessionStorage.removeItem(CATEGORY_KEY);
  } catch { /* optional */ }
  let activeHabitatId = null;
  let activeTier = 'metal';
  let creatureCategories = [];
  let visibleItems = [];
  let totalFound = 0;

  const catRow = el('div.cat-row');
  const subRow = el('div.sub-row');
  const resultsBox = el('div.picker-grid', { 'aria-live': 'polite' });
  const resultsInfo = el('p.picker-info');
  const chosenBox = el('div.chosen-list');
  const summary = el('p.chosen-summary');
  const search = el('input', { type: 'search', placeholder: t('order.search_items'), id: 'item-search', autocomplete: 'off', 'aria-label': t('order.what') });
  const note = el('textarea', { maxlength: '300', placeholder: t('order.note_ph'), id: 'note', rows: 2 });
  const noteCount = el('span.hint', { text: '0 / 300' });
  note.addEventListener('input', () => { noteCount.textContent = `${note.value.length} / 300`; });
  const submit = el('button.btn.primary.lux.block', { type: 'button', disabled: true }, uiIcon('package'), el('span', { text: t('order.create') }));
  const mobileBar = el('div.order-mobile-bar', { hidden: true });

  function totals() {
    return { n: chosen.length, q: chosen.reduce((s, c) => s + c.quantity, 0) };
  }

  function drawChosen() {
    chosenBox.replaceChildren(
      ...(chosen.length
        ? chosen.map((c, i) =>
            el('div.chosen-row', {},
              itemArt({ key: c.key, product_type: c.product_type, image_path: c.image_path }, { className: 'is-thumb' }),
              el('div.chosen-copy', {},
                el('strong', { text: c.name }),
                el('small', { text: t('type.' + c.product_type) })),
              qtyControl(c.quantity, (v) => { c.quantity = v; syncTotals(); renderResults(); }),
              el('button.icon-btn.is-danger', {
                type: 'button', 'aria-label': t('order.remove') + ': ' + c.name, title: t('order.remove'),
                onclick: () => { chosen.splice(i, 1); drawChosen(); renderResults(); },
              }, uiIcon('trash'))
            )
          )
        : [el('p.chosen-empty', {}, uiIcon('package'), el('span', { text: t('order.nothing_selected') }))])
    );
    syncTotals();
  }

  function syncTotals() {
    const { n, q } = totals();
    summary.textContent = n ? t('order.summary_n', { n, q }) : '';
    submit.disabled = n === 0;
    mobileBar.hidden = n === 0;
    mobileBar.replaceChildren(
      el('span', {}, el('b', { text: t('order.summary_n', { n, q }) })),
      el('button.btn.primary.lux.sm', { type: 'button', onclick: () => document.getElementById('order-selection')?.scrollIntoView({ behavior: 'smooth', block: 'start' }) },
        el('span', { text: t('order.create') }), uiIcon('arrow-right')));
  }

  function pickTile(it) {
    const selected = chosen.find((c) => c.itemId === it.id);
    const add = () => {
      if (chosen.some((c) => c.itemId === it.id)) return;
      chosen.push({ itemId: it.id, name: it.name, product_type: it.product_type, key: it.key, image_path: it.image_path, quantity: 1 });
      drawChosen();
      renderResults();
    };
    return el('div.pick-tile' + (selected ? '.selected' : ''), {},
      el('button.pick-main', { type: 'button', onclick: add, 'aria-pressed': selected ? 'true' : 'false', 'aria-label': it.name },
        itemArt(it),
        el('span.pick-name', { text: it.name }),
        el('span.pick-type', { text: t('type.' + it.product_type) })),
      el('div.pick-foot', {},
        selected
          ? qtyControl(selected.quantity, (v) => { selected.quantity = v; drawChosen(); })
          : el('button.pick-add', { type: 'button', onclick: add }, uiIcon('plus'), el('span', { text: t('order.add') }))));
  }

  const LIMIT = 60;
  function renderResults(items = visibleItems, found = totalFound) {
    visibleItems = items;
    totalFound = found;
    resultsBox.replaceChildren(...(items.length
      ? items.slice(0, LIMIT).map(pickTile)
      : [emptyBlock('magnifying-glass', t('order.no_items'))]));
    resultsInfo.textContent = items.length > LIMIT
      ? t('order.more_results', { shown: LIMIT, n: items.length })
      : items.length ? t('order.results_n', { n: items.length }) : '';
  }

  async function loadResults() {
    const myToken = ++renderToken;
    const group = GRUPPEN[activeCat];
    resultsBox.replaceChildren(spinner());
    try {
      const listen = await Promise.all(group.types.map((pt) => {
        const query = { productType: pt };
        if (HABITAT_AWARE_TYPES.includes(pt) && activeHabitatId) query.categoryId = activeHabitatId;
        return api.items(query).then((r) => r.items).catch(() => []);
      }));
      if (myToken !== renderToken) return;
      const seen = new Set();
      let items = listen.flat().filter((it) => !seen.has(it.id) && seen.add(it.id));
      if (group.tiers) {
        const stufen = BAUSTUFEN.filter((s) => s !== 'other');
        items = items.filter((i) => {
          const praefix = String(i.key || '').split('_')[0];
          return activeTier === 'other' ? !stufen.includes(praefix) : praefix === activeTier;
        });
      }
      items.sort((a, b) => String(a.name).localeCompare(String(b.name)));
      renderResults(items, items.length);
    } catch { /* UI bleibt bedienbar */ }
  }

  function drawCats() {
    catRow.replaceChildren(...CATEGORY_TILES.map((tile) => categoryTile(tile, tile.key === activeCat && !search.value.trim(), () => {
      activeCat = tile.key;
      activeHabitatId = null;
      search.value = '';
      drawCats(); drawSub(); loadResults();
    })));
  }

  function drawSub() {
    const group = GRUPPEN[activeCat];
    const chip = (text, on, onclick) => el('button.chip' + (on ? '.on' : ''), { type: 'button', text, onclick, 'aria-pressed': on ? 'true' : 'false' });
    if (search.value.trim()) { subRow.replaceChildren(); return; }
    if (group.tiers) {
      subRow.replaceChildren(el('span.filter-label', { text: t('order.filter_tier') }),
        ...BAUSTUFEN.map((stufe) => chip(t('order.tier.' + stufe), activeTier === stufe, () => { activeTier = stufe; drawSub(); loadResults(); })));
    } else if (group.types.every((pt) => HABITAT_AWARE_TYPES.includes(pt)) && creatureCategories.length) {
      subRow.replaceChildren(el('span.filter-label', { text: t('order.filter_habitat') }),
        chip(t('common.all'), activeHabitatId === null, () => { activeHabitatId = null; drawSub(); loadResults(); }),
        ...creatureCategories.map((c) => chip(c.name, activeHabitatId === c.id, () => { activeHabitatId = c.id; drawSub(); loadResults(); })));
    } else {
      subRow.replaceChildren(...(group.hint ? [el('span.filter-label', { text: group.hint() })] : []));
    }
  }

  api.categories().then(({ categories }) => {
    creatureCategories = categories.filter((c) => c.key !== 'structures');
    drawSub();
  }).catch(() => {});

  let searchTimer;
  search.addEventListener('input', () => {
    clearTimeout(searchTimer);
    const q = search.value.trim();
    drawCats(); drawSub();
    if (!q) { loadResults(); return; }
    if (q.length < 2) return;
    searchTimer = setTimeout(async () => {
      const myToken = ++renderToken;
      try {
        const { items } = await api.items({ search: q });
        if (myToken !== renderToken) return;
        renderResults(items, items.length);
      } catch { /* Eingabe bleibt nutzbar */ }
    }, 180);
  });

  const prioSeg = tabBar(['normal', 'high', 'urgent'].map((p) => ({ key: p, label: t('prio.' + p) })), priority, (p) => { priority = p; }, 'is-small');

  submit.addEventListener('click', async () => {
    submit.disabled = true;
    try {
      const res = await api.createOrder({
        priority,
        note: note.value.trim() || undefined,
        items: chosen.map((c) => ({ itemId: c.itemId, quantity: c.quantity })),
      });
      toast(t('order.created'));
      go('/orders/' + res.order.id);
    } catch (err) {
      toast(err.message, 'err');
      submit.disabled = false;
    }
  });

  mount.append(
    pageHead({ title: t('order.new'), sub: t('page.new_order.sub'), icon: 'plus-circle', back: { onclick: () => go('/orders') } }),
    el('section.ark-panel.order-cats', {}, catRow,
      el('div.order-filterbar', {}, subRow, el('div.search-field', {}, uiIcon('magnifying-glass'), search))),
    el('div.order-builder', {},
      el('section.ark-panel.order-catalog', {},
        el('header.ark-panel-head', {}, uiIcon('squares-four', 'ark-panel-icon'), el('h2', { text: t('order.what') }), resultsInfo),
        resultsBox),
      el('aside.ark-panel.order-selection', { id: 'order-selection' },
        el('header.ark-panel-head', {}, uiIcon('clipboard-text', 'ark-panel-icon'), el('h2', { text: t('order.selected_title') })),
        chosenBox,
        el('div.order-options', {},
          el('div.field', {}, el('label', { text: t('order.priority') }), prioSeg),
          el('div.field', {}, el('label', { for: 'note', text: t('order.note') }), note, noteCount)),
        summary,
        submit)
    ),
    mobileBar
  );

  drawCats();
  drawSub();
  drawChosen();
  loadResults();
}

function qtyControl(value, onChange) {
  const input = el('input', { type: 'number', min: '1', max: '9999', value: String(value), inputmode: 'numeric', 'aria-label': t('order.qty_label') });
  const set = (v) => {
    const n = Math.max(1, Math.min(9999, Number.isFinite(v) ? v : 1));
    input.value = String(n);
    onChange(n);
  };
  input.addEventListener('change', () => set(parseInt(input.value, 10) || 1));
  return el('div.qty', {},
    el('button', { type: 'button', text: '−', 'aria-label': '-1', onclick: () => set(parseInt(input.value, 10) - 1) }),
    input,
    el('button', { type: 'button', text: '+', 'aria-label': '+1', onclick: () => set(parseInt(input.value, 10) + 1) })
  );
}

/* ========================================================================== */
/* Detail                                                                     */
/* ========================================================================== */

const NEXT_STATUS = {
  open: 'prepared',
  prepared: 'issued',
  issued: 'open',
  not_available: 'open',
};
const ITEM_TONE = { open: 'open', prepared: 'progress', issued: 'done', not_available: 'urgent' };

export async function renderOrderDetail(mount, ctx, id) {
  const { user, go } = ctx;
  mount.classList.add('order-detail-page');
  mount.append(spinner());

  let order, comments = [];
  try {
    order = (await api.order(id)).order;
    comments = (await api.comments(id).catch(() => ({ comments: [] }))).comments;
  } catch (err) {
    mount.replaceChildren(
      pageHead({ title: t('order.detail'), back: { onclick: () => go('/orders') } }),
      emptyState(err.message)
    );
    return;
  }

  const isAdmin = user.roles.includes('admin') || user.roles.includes('developer');

  // Rechte haengen am AKTUELLEN Zustand und werden bei jedem Neuzeichnen neu
  // bestimmt - sonst saehe ein Breeder nach dem Uebernehmen seine Knoepfe erst
  // nach einem Reload.
  function rights() {
    const isClosed = CLOSED.includes(order.status);
    return {
      isClosed,
      isOwner: order.member_id === user.id,
      canManage: isAdmin || order.assigned_to === user.id,
      canClaim: !order.assigned_to && !isClosed && (user.roles.includes('breeder_crafter') || isAdmin),
    };
  }

  function redraw() { mount.replaceChildren(); build(); }

  async function refresh() {
    order = (await api.order(id)).order;
    redraw();
  }

  function build() {
    const { isClosed, isOwner, canManage, canClaim } = rights();
    const first = order.items[0];
    const { issued, total, pct } = orderProgress(order);
    const tone = orderTone(order);

    const claimBtn = canClaim ? el('button.btn.primary.lux', {
      type: 'button',
      onclick: async (e) => {
        e.currentTarget.disabled = true;
        try { await api.claimOrder(id); toast(t('order.claimed')); await refresh(); }
        catch (err) { toast(err.message, 'err'); e.currentTarget.disabled = false; }
      },
    }, uiIcon('check-circle'), el('span', { text: t('order.claim') })) : null;

    const menu = kebabMenu([
      canManage && order.assigned_to && !isClosed ? { label: t('order.release'), icon: 'sign-out', onclick: async () => {
        try { await api.releaseOrder(id); toast(t('order.released')); await refresh(); }
        catch (err) { toast(err.message, 'err'); }
      } } : null,
      (isOwner || isAdmin) && !isClosed ? { label: t('order.cancel'), icon: 'x-circle', danger: true, onclick: async () => {
        const ok = await confirmDialog({ title: t('order.cancel_confirm_t'), body: t('order.cancel_confirm_b'), confirmLabel: t('order.cancel'), danger: true });
        if (!ok) return;
        try { await api.cancelOrder(id); toast(t('order.cancelled')); await refresh(); }
        catch (err) { toast(err.message, 'err'); }
      } } : null,
      // Endgueltiges Loeschen - auch bei abgeschlossenen/stornierten Bestellungen,
      // damit ein Admin aufraeumen kann. Serverseitig zusaetzlich geprueft.
      isOwner || isAdmin ? { label: t('order.delete'), icon: 'trash', danger: true, onclick: async () => {
        const ok = await confirmDialog({ title: t('order.delete_confirm_t'), body: t('order.delete_confirm_b'), confirmLabel: t('common.delete'), danger: true });
        if (!ok) return;
        try { await api.deleteOrder(id); toast(t('order.deleted')); go('/orders'); }
        catch (err) { toast(err.message, 'err'); }
      } } : null,
    ], t('order.item_actions'));

    mount.append(pageHead({
      title: first ? first.item_name + (order.items.length > 1 ? ` +${order.items.length - 1}` : '') : t('order.detail'),
      sub: `${t('order.requested_by')}: ${order.member_username} · ${timeAgo(order.created_at)}`,
      icon: 'clipboard-text',
      back: { onclick: () => go('/orders') },
      actions: [claimBtn, menu],
    }));

    const positions = el('div.position-list', {},
      ...order.items.map((it) => {
        const actions = canManage && !isClosed ? el('div.position-actions', {},
          el('button.btn.sm', {
            type: 'button',
            title: t('istatus.' + NEXT_STATUS[it.status]),
            onclick: async (e) => {
              e.currentTarget.disabled = true;
              try { await api.setItemStatus(id, it.id, NEXT_STATUS[it.status]); toast(t('order.item_status_set')); await refresh(); }
              catch (err) { toast(err.message, 'err'); e.currentTarget.disabled = false; }
            },
          }, uiIcon('arrow-right'), el('span', { text: t('istatus.' + NEXT_STATUS[it.status]) })),
          it.status !== 'not_available' ? el('button.icon-btn.is-danger', {
            type: 'button', title: t('istatus.not_available'), 'aria-label': t('istatus.not_available'),
            onclick: async () => {
              try { await api.setItemStatus(id, it.id, 'not_available'); toast(t('order.item_status_set')); await refresh(); }
              catch (err) { toast(err.message, 'err'); }
            },
          }, uiIcon('warning')) : null) : null;
        return el('div.position-row', {},
          itemArt(it, { className: 'is-thumb' }),
          el('div.position-copy', {}, el('strong', { text: it.item_name }), el('small', { text: t('type.' + it.product_type) })),
          el('span.position-qty', { text: '× ' + it.quantity }),
          pill(t('istatus.' + it.status), ITEM_TONE[it.status] || 'open'),
          actions);
      }));

    const commentList = el('div.comment-list', {},
      ...(comments.length
        ? comments.map((c) => el('div.comment-row' + (c.author_id === user.id ? '.mine' : ''), {},
            avatar(c.author_username, { size: 'sm' }),
            el('div.comment-copy', {},
              el('div.comment-meta', {}, el('strong', { text: c.author_username }), el('small', { text: fmtStamp(c.created_at) })),
              el('p', { text: c.body }))))
        : [el('p.comment-empty', {}, uiIcon('chat-circle-dots'), el('span', { text: t('order.no_comments') }))]));

    const input = el('input', { type: 'text', placeholder: t('order.comment_ph'), maxlength: '1000', 'aria-label': t('order.comment_ph') });
    const sendBtn = el('button.send-btn', { type: 'submit', 'aria-label': t('order.send'), title: t('order.send') }, uiIcon('paper-plane-tilt'));
    const composer = el('form.inline-composer', { onsubmit: async (e) => {
      e.preventDefault();
      const body = input.value.trim();
      if (!body) return;
      sendBtn.disabled = true;
      try {
        await api.addComment(id, body);
        input.value = '';
        comments = (await api.comments(id)).comments;
        redraw();
      } catch (err) { toast(err.message, 'err'); }
      finally { sendBtn.disabled = false; }
    } }, input, sendBtn);

    mount.append(el('div.order-detail-grid', {},
      el('div.order-detail-main', {},
        el('section.order-hero-card.tone-' + tone, {},
          el('div.order-hero-art', {}, first ? itemArt(first) : null,
            el('span.tone-pill.tone-' + tone, { text: orderToneLabel(order) })),
          el('div.order-hero-copy', {},
            el('div.order-hero-progress', {},
              el('span', { text: t('order.progress') }),
              el('b', { text: t('dash.issued_of', { a: issued, b: total }) })),
            el('div.ark-progress.is-large', { role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(pct) }, el('span', { style: `width:${pct}%` })),
            order.note ? el('blockquote.order-note', {}, uiIcon('chat-circle-dots'), el('span', { text: order.note })) : null)),
        panel({ title: t('order.items'), icon: 'package', count: order.items.length }, positions)),
      el('aside.order-detail-side', {},
        panel({ title: t('order.status_label'), icon: 'info', className: 'order-facts' },
          el('dl.fact-list', {},
            fact(t('order.status_label'), pill(order.status === 'open' && order.assigned_to ? t('task.status.in_progress') : t('status.' + order.status),
              order.status === 'completed' ? 'done' : order.status === 'cancelled' ? 'muted' : order.assigned_to || order.status !== 'open' ? 'progress' : 'open')),
            fact(t('order.priority'), pill(t('prio.' + order.priority), order.priority === 'urgent' ? 'urgent' : order.priority === 'high' ? 'high' : 'muted')),
            fact(t('order.responsible'), order.assigned_username
              ? el('span.fact-person', {}, avatar(order.assigned_username, { size: 'sm' }), el('span', { text: order.assigned_username }))
              : el('span.fact-muted', { text: t('order.unassigned') })),
            fact(t('order.requested_by'), el('span.fact-person', {}, avatar(order.member_username, { size: 'sm' }), el('span', { text: order.member_username }))),
            fact(t('order.created_at'), el('span', { text: fmtDate(order.created_at) })))),
        panel({ title: t('order.comments'), icon: 'chat-circle-dots', count: comments.length, className: 'order-comments' }, commentList, composer))
    ));
  }

  mount.replaceChildren();
  build();
}

function fact(label, value) {
  return el('div.fact', {}, el('dt', { text: label }), el('dd', {}, value));
}

