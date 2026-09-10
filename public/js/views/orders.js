import { el, spinner, orderCard, orderTitle, emptyState, statusBadge, priorityBadge, typeTag, toast, confirmDialog } from '../ui.js';
import { itemIcon, itemBild } from '../icons.js';
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
          ? el('div.grid.cols2', {}, ...filtered.map((o) => orderCard(o, (id) => go('/orders/' + id), { showImages: true })))
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
  let renderToken = 0; // schützt vor überholten Antworten: Gruppen-Vorschau und Suche
                        // laufen beide asynchron - ohne das hier könnte eine spät
                        // eintreffende Gruppen-Antwort eine bereits aktuellere
                        // Sucheingabe wieder überschreiben.

  const chosenBox = el('div.list');
  const resultsBox = el('div.picker-results');
  const accBox = el('div.acc.order-groups');
  const habitatChips = el('div.chips.habitats', { style: 'margin-top:10px' });
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

  function pickButton(it) {
    return el('button.pick', {
      type: 'button',
      onclick: () => {
        if (!chosen.some((c) => c.itemId === it.id)) {
          chosen.push({ itemId: it.id, name: it.name, emoji: it.emoji, product_type: it.product_type, quantity: 1 });
          drawChosen();
        }
        search.value = '';
        search.focus();
      },
    },
      itemBild(it, 40),
      el('span.pt', { text: it.name }),
      typeTag(it.product_type)
    );
  }

  function renderResults(items, emptyText) {
    resultsBox.replaceChildren(
      ...(items.length
        ? items.slice(0, 80).map(pickButton)
        : [el('p.hint', { style: 'padding:8px 2px', text: emptyText })])
    );
    if (items.length > 80) {
      resultsBox.append(el('p.hint', { style: 'padding:8px 2px', text: `80 / ${items.length} – ${t('common.search')} nutzen, um einzugrenzen.` }));
    }
  }

  /* ------------------------------------------------------------------------ */
  /* Aufklappbare Gruppen statt einer langen Reihe von Reitern.                */
  /*                                                                          */
  /* Vorher standen alle sechs Produkttypen als gleichwertige Knöpfe nebenein- */
  /* ander, darunter eine zweite Reihe für Lebensraum bzw. Baustufe. Auf dem   */
  /* Handy brach diese Doppelreihe um und war kaum zu treffen. Jetzt gibt es   */
  /* drei fachliche Gruppen (Kreaturen / Strukturen / Sättel) plus Sonstiges,  */
  /* jede mit ihren Unterpunkten - "Sonstiges" bleibt bewusst erhalten, sonst  */
  /* wären Katalogeinträge wie Werkzeuge oder Ressourcen nicht mehr            */
  /* erreichbar.                                                              */
  /* ------------------------------------------------------------------------ */

  // Land/Wasser/Flieger/Sonstige gilt nicht nur für Kreaturen, sondern genauso für
  // deren Eier/Embryos/Sättel (die haben in der Datenbank dieselbe Kategorie wie
  // ihre Kreatur - z.B. "Rex Egg" liegt in "Landtiere", genau wie "Rex" selbst).
  // Nur Strukturen und Sonstiges haben keinen Lebensraum-Bezug.
  const HABITAT_AWARE_TYPES = ['creature', 'egg', 'embryo', 'saddle'];

  // Die Baustufe steckt als Präfix im Schlüssel ("metal_wall"), es braucht also
  // keine zusätzliche Backend-Abfrage. "Sonstiges" fängt alles ab, was zu keiner
  // der fünf Bauserien gehört (Lagerbox, Schmiede, Geschütze ...).
  const BAUSTUFEN = ['thatch', 'wood', 'stone', 'metal', 'tek', 'other'];

  const GRUPPEN = [
    {
      key: 'creatures',
      art: 'creature',
      label: () => t('order.group.creatures'),
      hint: () => t('order.group.creatures_hint'),
      entries: [
        { key: 'creature', art: 'creature', label: () => t('catalog.tab.creature'), types: ['creature'] },
        { key: 'eggs', art: 'egg', label: () => t('order.sub.eggs'), types: ['egg', 'embryo'] },
      ],
    },
    {
      key: 'structures',
      art: 'structure',
      label: () => t('order.group.structures'),
      hint: () => t('order.group.structures_hint'),
      entries: BAUSTUFEN.map((stufe) => ({
        key: 'structure_' + stufe,
        art: 'structure',
        label: () => t('order.tier.' + stufe),
        types: ['structure'],
        tier: stufe,
      })),
    },
    {
      key: 'saddles',
      art: 'saddle',
      label: () => t('order.group.saddles'),
      hint: () => t('order.group.saddles_hint'),
      entries: [{ key: 'saddle', art: 'saddle', label: () => t('catalog.tab.saddle'), types: ['saddle'] }],
    },
    {
      key: 'other',
      art: 'structure',
      label: () => t('order.group.other'),
      hint: () => t('order.group.other_hint'),
      entries: [{ key: 'resource', art: 'structure', label: () => t('catalog.tab.resource'), types: ['resource'] }],
    },
  ];

  let creatureCategories = [];
  let offeneGruppe = 'creatures';
  let activeEntry = GRUPPEN[0].entries[0];
  let activeHabitatId = null;

  const istLebensraumFaehig = (entry) => entry.types.every((pt) => HABITAT_AWARE_TYPES.includes(pt));

  async function loadResults() {
    const myToken = ++renderToken;
    const entry = activeEntry;
    resultsBox.replaceChildren(spinner());
    try {
      // Ein Eintrag kann mehrere Produkttypen bündeln ("Eier & Embryos"). Die
      // Listen werden zusammengeführt und über die ID entdoppelt.
      const listen = await Promise.all(
        entry.types.map((pt) => {
          const query = { productType: pt };
          if (HABITAT_AWARE_TYPES.includes(pt) && activeHabitatId) query.categoryId = activeHabitatId;
          return api.items(query).then((r) => r.items).catch(() => []);
        })
      );
      if (myToken !== renderToken) return; // eine neuere Anfrage (Suche o.ä.) lief inzwischen los

      const gesehen = new Set();
      let items = [];
      for (const liste of listen) {
        for (const it of liste) {
          if (gesehen.has(it.id)) continue;
          gesehen.add(it.id);
          items.push(it);
        }
      }

      if (entry.tier) {
        const stufen = BAUSTUFEN.filter((s) => s !== 'other');
        items = items.filter((i) => {
          const praefix = String(i.key || '').split('_')[0];
          return entry.tier === 'other' ? !stufen.includes(praefix) : praefix === entry.tier;
        });
      }

      items.sort((a, b) => String(a.name).localeCompare(String(b.name)));
      renderResults(items, t('order.no_items'));
    } catch { /* still scheitern lassen, UI bleibt bedienbar */ }
  }

  function drawHabitatChips() {
    if (!istLebensraumFaehig(activeEntry) || creatureCategories.length === 0) {
      habitatChips.replaceChildren();
      return;
    }
    habitatChips.replaceChildren(
      el('button.btn.sm' + (activeHabitatId === null ? '.primary' : ''), {
        text: t('common.all'),
        onclick: () => { activeHabitatId = null; drawHabitatChips(); loadResults(); },
      }),
      ...creatureCategories.map((c) =>
        el('button.btn.sm' + (activeHabitatId === c.id ? '.primary' : ''), {
          text: c.name,
          onclick: () => { activeHabitatId = c.id; drawHabitatChips(); loadResults(); },
        })
      )
    );
  }

  function waehleEintrag(entry) {
    activeEntry = entry;
    activeHabitatId = null;
    search.value = '';
    drawAcc();
    drawHabitatChips();
    loadResults();
  }

  function drawAcc() {
    accBox.replaceChildren(
      ...GRUPPEN.map((g) => {
        const offen = offeneGruppe === g.key;
        return el('div.acc-group' + (offen ? '.open' : ''), { dataset: { group: g.key } },
          el('button.acc-head', {
            type: 'button',
            'aria-expanded': offen ? 'true' : 'false',
            onclick: () => {
              // Kopfzeile öffnet die Gruppe UND wählt ihren ersten Unterpunkt aus,
              // damit sofort Ergebnisse dastehen statt einer leeren Fläche.
              if (offeneGruppe === g.key) { offeneGruppe = null; drawAcc(); return; }
              offeneGruppe = g.key;
              waehleEintrag(g.entries[0]);
            },
          },
            itemIcon(g.art, 18),
            el('span.acc-copy', {},
              el('span.acc-title', { text: g.label() }),
              el('span.acc-hint', { text: g.hint() })
            ),
            el('span.acc-caret', { text: offen ? '▾' : '▸' })
          ),
          el('div.acc-body', {},
            ...g.entries.map((e) =>
              el('button.acc-item' + (activeEntry.key === e.key ? '.on' : ''), {
                type: 'button',
                onclick: () => { offeneGruppe = g.key; waehleEintrag(e); },
              },
                itemIcon(e.art, 16),
                el('span', { text: e.label() })
              )
            )
          )
        );
      })
    );
  }

  drawAcc();
  loadResults();
  // Lebensraum-Kategorien einmalig laden (nur die vier Kreaturen-Lebensräume,
  // "structures" ist keine Kreaturen-Unterkategorie).
  api.categories().then(({ categories }) => {
    creatureCategories = categories.filter((c) => c.key !== 'structures');
    drawHabitatChips();
  }).catch(() => {});

  let searchTimer;
  search.addEventListener('input', () => {
    clearTimeout(searchTimer);
    const q = search.value.trim();
    if (!q) {
      // Suche geleert -> zurück zur aktuell gewählten Gruppe/Unterebene.
      loadResults();
      return;
    }
    if (q.length < 2) return;
    searchTimer = setTimeout(async () => {
      const myToken = ++renderToken;
      try {
        const { items } = await api.items({ search: q });
        if (myToken !== renderToken) return; // Eingabe hat sich inzwischen weiterverändert
        renderResults(items, t('order.no_items'));
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
        el('label', { for: 'item-search', text: t('order.what') }),
        search
      ),
      accBox,
      habitatChips,
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
    // Endgültiges Löschen - anders als Stornieren auch bei bereits
    // abgeschlossenen/stornierten Bestellungen möglich, damit ein Admin wirklich
    // aufräumen kann. Die Berechtigung wird zusätzlich serverseitig geprüft.
    if (isOwner || isAdmin) {
      actions.push(el('button.btn.danger', {
        text: t('order.delete'),
        onclick: async () => {
          const ok = await confirmDialog({
            title: t('order.delete_confirm_t'),
            body: t('order.delete_confirm_b'),
            confirmLabel: t('common.delete'),
            danger: true,
          });
          if (!ok) return;
          try { await api.deleteOrder(id); toast(t('order.deleted')); go('/orders'); }
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
          const thumb = itemBild(it, 44);
          const row = el('div.row', {},
            thumb,
            el('div.grow', {},
              el('div.rt', { text: `${it.item_name} × ${it.quantity}` }),
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
