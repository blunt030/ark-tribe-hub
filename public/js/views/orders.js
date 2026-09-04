import { el, spinner, orderCard, orderTitle, emptyState, statusBadge, priorityBadge, typeTag, toast, confirmDialog } from '../ui.js';
import { t, timeAgo } from '../i18n.js';
import { api, ApiError } from '../api.js';

/* ========================================================================== */
/* Liste                                                                      */
/* ========================================================================== */

export async function renderOrders(mount, ctx) {
  const { user, go } = ctx;
  let scope = 'open';

  const listBox = el('div');

  async function load() {
    listBox.replaceChildren(spinner());
    try {
      const { orders } = await api.orders(scope === 'all' ? undefined : scope);
      const filtered = scope === 'mine' ? orders.filter((o) => o.member_id === user.id) : orders;
      listBox.replaceChildren(
        filtered.length
          ? el('div.grid.cols2', {}, ...filtered.map((o) => orderCard(o, (id) => go('/orders/' + id))))
          : emptyState(t('orders.none'), scope === 'open' ? t('orders.none_sub') : null)
      );
    } catch (err) {
      listBox.replaceChildren(emptyState(err.message));
    }
  }

  const seg = el('div.seg', {},
    ...[['open', 'filter.open'], ['mine', 'filter.mine'], ['history', 'filter.history'], ['all', 'filter.all']].map(
      ([key, label]) =>
        el('button' + (scope === key ? '.on' : ''), {
          text: t(label),
          onclick: (e) => {
            scope = key;
            [...seg.children].forEach((b) => b.classList.remove('on'));
            e.target.classList.add('on');
            load();
          },
        })
    )
  );

  mount.append(
    el('div.page-head', {},
      el('div', {}, el('h1', { text: t('orders.title') }), seg),
      el('button.btn.primary', { text: '+ ' + t('order.new'), onclick: () => go('/orders/new') })
    ),
    listBox
  );
  load();
}

/* ========================================================================== */
/* Neue Bestellung                                                            */
/* ========================================================================== */

export async function renderNewOrder(mount, ctx) {
  const { go } = ctx;
  const chosen = []; // { itemId, name, emoji, product_type, quantity }
  let priority = 'normal';

  const chosenBox = el('div.list');
  const resultsBox = el('div.picker-results');
  const search = el('input', {
    type: 'search',
    placeholder: t('order.search_items'),
    id: 'item-search',
    autocomplete: 'off',
  });
  const note = el('textarea', { maxlength: '300', placeholder: t('order.note_ph'), id: 'note' });
  const noteCount = el('span.hint', { text: '0 / 300' });
  note.addEventListener('input', () => { noteCount.textContent = `${note.value.length} / 300`; });

  const submit = el('button.btn.primary.block', { text: t('order.create'), disabled: true });

  function drawChosen() {
    chosenBox.replaceChildren(
      ...(chosen.length
        ? chosen.map((c, i) =>
            el('div.row', {},
              el('div.grow', {},
                el('div.rt', { text: `${c.emoji ? c.emoji + ' ' : ''}${c.name}` }),
                el('div.rs', {}, typeTag(c.product_type))
              ),
              qtyControl(c.quantity, (v) => { c.quantity = v; }),
              el('button.btn.sm.danger', {
                text: '✕',
                'aria-label': t('common.cancel'),
                onclick: () => { chosen.splice(i, 1); drawChosen(); },
              })
            )
          )
        : [el('div.empty', {}, el('div', { text: t('order.no_items') }))])
    );
    submit.disabled = chosen.length === 0;
  }

  let searchTimer;
  search.addEventListener('input', () => {
    clearTimeout(searchTimer);
    const q = search.value.trim();
    if (q.length < 2) { resultsBox.replaceChildren(); return; }
    searchTimer = setTimeout(async () => {
      try {
        const { items } = await api.items({ search: q });
        resultsBox.replaceChildren(
          ...items.slice(0, 40).map((it) =>
            el('button.pick', {
              type: 'button',
              onclick: () => {
                if (!chosen.some((c) => c.itemId === it.id)) {
                  chosen.push({ itemId: it.id, name: it.name, emoji: it.emoji, product_type: it.product_type, quantity: 1 });
                  drawChosen();
                }
                search.value = '';
                resultsBox.replaceChildren();
                search.focus();
              },
            },
              el('span.pt', { text: `${it.emoji ? it.emoji + ' ' : ''}${it.name}` }),
              typeTag(it.product_type)
            )
          )
        );
      } catch { /* Suche still scheitern lassen, Eingabe bleibt nutzbar */ }
    }, 180);
  });

  const prioSeg = el('div.seg', {},
    ...['normal', 'high', 'urgent'].map((p) =>
      el('button' + (p === 'normal' ? '.on' : ''), {
        text: t('prio.' + p),
        onclick: (e) => {
          priority = p;
          [...prioSeg.children].forEach((b) => b.classList.remove('on'));
          e.target.classList.add('on');
        },
      })
    )
  );

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
    el('div.page-head', {},
      el('div', {},
        el('button.btn.sm.ghost', { text: '← ' + t('common.back'), onclick: () => go('/orders') }),
        el('h1', { text: t('order.new'), style: 'margin-top:8px' })
      )
    ),
    el('div.card', {},
      el('div.field', {},
        el('label', { for: 'item-search', text: t('order.add_item') }),
        search
      ),
      resultsBox
    ),
    el('div.section-title', {}, t('order.items')),
    chosenBox,
    el('div.card', { style: 'margin-top:18px' },
      el('div.field', {}, el('label', { text: t('order.priority') }), prioSeg),
      el('div.field', {},
        el('label', { for: 'note', text: t('order.note') }),
        note,
        noteCount
      ),
      submit
    )
  );

  drawChosen();
  setTimeout(() => search.focus(), 40);
}

function qtyControl(value, onChange) {
  const input = el('input', { type: 'number', min: '1', max: '9999', value: String(value) });
  const set = (v) => {
    const n = Math.max(1, Math.min(9999, v));
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

export async function renderOrderDetail(mount, ctx, id) {
  const { user, go } = ctx;
  mount.append(spinner());

  let order, comments = [];
  try {
    order = (await api.order(id)).order;
    comments = (await api.comments(id).catch(() => ({ comments: [] }))).comments;
  } catch (err) {
    mount.replaceChildren(
      el('div.page-head', {}, el('button.btn.sm.ghost', { text: '← ' + t('common.back'), onclick: () => go('/orders') })),
      emptyState(err.message)
    );
    return;
  }

  const isAdmin = user.roles.includes('admin') || user.roles.includes('developer');

  // Die Rechte haengen am AKTUELLEN Zustand der Bestellung und werden deshalb bei
  // jedem Neuzeichnen frisch bestimmt. Wuerde man sie einmalig beim Laden
  // berechnen, saehe ein Breeder nach dem Uebernehmen seine Statusknoepfe erst
  // nach einem Reload - genau das ist beim Testen aufgefallen.
  function rights() {
    const isClosed = ['completed', 'cancelled'].includes(order.status);
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

    // Kopf: Benutzer + Tribe statt Bestellnummer
    mount.append(
      el('div.page-head', {},
        el('div', {},
          el('button.btn.sm.ghost', { text: '← ' + t('common.back'), onclick: () => go('/orders') }),
          el('h1', { text: orderTitle(order), style: 'margin-top:8px' }),
          el('p', {}, `${t('order.created_at')}: ${timeAgo(order.created_at)}`)
        ),
        el('div.chips', {}, priorityBadge(order.priority), statusBadge(order.status))
      )
    );

    if (order.note) {
      mount.append(el('div.notice.note', { text: order.note }));
    }

    // Aktionen
    const actions = [];
    if (canClaim) {
      actions.push(el('button.btn.primary', {
        text: t('order.claim'),
        onclick: async (e) => {
          e.target.disabled = true;
          try { await api.claimOrder(id); toast(t('order.claimed')); await refresh(); }
          catch (err) { toast(err.message, 'err'); e.target.disabled = false; }
        },
      }));
    }
    if (canManage && order.assigned_to && !isClosed) {
      actions.push(el('button.btn', {
        text: t('order.release'),
        onclick: async () => {
          try { await api.releaseOrder(id); toast(t('order.released')); await refresh(); }
          catch (err) { toast(err.message, 'err'); }
        },
      }));
    }
    if ((isOwner || isAdmin) && !isClosed) {
      actions.push(el('button.btn.danger', {
        text: t('order.cancel'),
        onclick: async () => {
          const ok = await confirmDialog({
            title: t('order.cancel_confirm_t'),
            body: t('order.cancel_confirm_b'),
            confirmLabel: t('order.cancel'),
            danger: true,
          });
          if (!ok) return;
          try { await api.cancelOrder(id); toast(t('order.cancelled')); await refresh(); }
          catch (err) { toast(err.message, 'err'); }
        },
      }));
    }
    if (actions.length) mount.append(el('div.chips', { style: 'margin-bottom:6px' }, ...actions));

    mount.append(
      el('div.assign-line', {},
        el('span', { text: '👤' }),
        order.assigned_username
          ? t('order.assigned_to', { name: order.assigned_username })
          : t('order.unassigned'),
      )
    );

    // Positionen – jede einzeln steuerbar, keine Teilmengen
    mount.append(el('div.section-title', {}, t('order.items'), el('span.c', { text: order.items.length })));
    mount.append(
      el('div.list', {},
        ...order.items.map((it) => {
          const statusText = el('div.rs', {}, el('span.dot.s-' + it.status), ' ' + t('istatus.' + it.status));
          const row = el('div.row', {},
            el('div.grow', {},
              el('div.rt', { text: `${it.emoji ? it.emoji + ' ' : ''}${it.item_name} × ${it.quantity}` }),
              statusText
            )
          );
          if (canManage && !isClosed) {
            row.append(
              el('button.btn.sm', {
                text: t('istatus.' + NEXT_STATUS[it.status]),
                title: t('istatus.' + NEXT_STATUS[it.status]),
                onclick: async (e) => {
                  e.target.disabled = true;
                  try {
                    await api.setItemStatus(id, it.id, NEXT_STATUS[it.status]);
                    toast(t('order.item_status_set'));
                    await refresh();
                  } catch (err) { toast(err.message, 'err'); e.target.disabled = false; }
                },
              }),
              it.status !== 'not_available'
                ? el('button.btn.sm.danger', {
                    text: '⚠',
                    title: t('istatus.not_available'),
                    onclick: async () => {
                      try {
                        await api.setItemStatus(id, it.id, 'not_available');
                        toast(t('order.item_status_set'));
                        await refresh();
                      } catch (err) { toast(err.message, 'err'); }
                    },
                  })
                : null
            );
          }
          return row;
        })
      )
    );

    // Nachrichten
    mount.append(el('div.section-title', {}, t('order.comments'), el('span.c', { text: comments.length })));
    const commentList = el('div.list', {},
      ...(comments.length
        ? comments.map((c) =>
            el('div.comment' + (c.author_id === user.id ? '.mine' : ''), {},
              el('div.ch', {},
                el('span.ca', { text: c.author_username }),
                el('span.ct', { text: timeAgo(c.created_at) })
              ),
              el('div', { text: c.body })
            )
          )
        : [el('div.empty', {}, el('div', { text: t('order.no_comments') }))])
    );
    mount.append(commentList);

    const input = el('input', { type: 'text', placeholder: t('order.comment_ph'), maxlength: '1000' });
    const sendBtn = el('button.btn', { text: t('order.send') });
    const send = async () => {
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
    };
    sendBtn.addEventListener('click', send);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') send(); });
    mount.append(el('div', { style: 'display:flex;gap:8px;margin-top:10px' }, input, sendBtn));
  }

  mount.replaceChildren();
  build();
}
