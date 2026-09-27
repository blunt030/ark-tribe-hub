import { el, spinner, emptyState, toast, confirmDialog, fileToBase64, pageHead, pill, kebabMenu, tabBar, panel, emptyBlock } from '../ui.js';
import { itemArt } from '../icons.js';
import { uiIcon } from '../ui-icons.js';
import { t } from '../i18n.js';
import { api } from '../api.js';

const STAT_KEYS = ['health', 'stamina', 'oxygen', 'food', 'weight', 'melee', 'movement_speed', 'torpor'];

function statusBadge(status) {
  const tone = status === 'active' ? 'done' : status === 'breeding' ? 'progress' : status === 'reserve' ? 'role' : 'muted';
  return pill(t('dino.status.' + status), tone);
}
/** Bild eines Tiers: eigener Upload, sonst das passende Artenbild (falls vorhanden). */
function dinoArt(d, className = '') {
  const key = String(d.species || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  return itemArt({ key, product_type: 'creature', image_path: d.image_path || null }, { className });
}

/* ========================================================================== */
/* Liste                                                                      */
/* ========================================================================== */

export async function renderDinos(mount, ctx) {
  const { go, user } = ctx;
  const canEdit = user.roles.some((r) => ['admin', 'developer', 'breeder_crafter'].includes(r));
  mount.append(spinner());
  let dinos = (await api.dinos()).dinos;

  let query = '';
  let statusFilter = null;
  const listBox = el('div.dino-grid');
  const search = el('input', { type: 'search', placeholder: t('dino.search_ph'), 'aria-label': t('dino.search_ph') });

  function draw() {
    const filtered = dinos.filter(
      (d) =>
        (!statusFilter || d.status === statusFilter) &&
        (!query || d.name.toLowerCase().includes(query.toLowerCase()) || d.species.toLowerCase().includes(query.toLowerCase()))
    );
    listBox.replaceChildren(
      ...(filtered.length
        ? filtered.map((d) =>
            el('article.dino-card', {
              onclick: () => go('/dinos/' + d.id),
              role: 'link',
              tabindex: '0',
              onkeydown: (e) => { if (e.key === 'Enter') go('/dinos/' + d.id); },
            },
              el('div.dino-card-art', {}, dinoArt(d), statusBadge(d.status)),
              el('div.dino-card-body', {},
                el('h3', { text: d.name }),
                el('small', { text: [d.species, d.level ? 'Lvl ' + d.level : null].filter(Boolean).join(' · ') }),
                statsSummary(d) ? el('p.dino-card-stats', { text: statsSummary(d) }) : null,
                d.owner_name ? el('small.dino-card-owner', {}, uiIcon('leaf'), el('span', { text: d.owner_name })) : null)
            )
          )
        : [emptyBlock('chart-bar', t('dino.none'))])
    );
  }

  search.addEventListener('input', () => { query = search.value.trim(); draw(); });

  mount.replaceChildren(
    pageHead({
      title: t('dino.title'), sub: t('dino.sub', { n: dinos.length }), icon: 'chart-bar',
      actions: [canEdit ? el('button.btn.primary.lux', { type: 'button', onclick: () => go('/dinos/new') }, uiIcon('plus'), el('span', { text: t('dino.new') })) : null],
    }),
    el('div.task-toolbar', {},
      tabBar([{ key: 'all', label: t('common.all') }, ...['active', 'breeding', 'paused', 'reserve'].map((st) => ({ key: st, label: t('dino.status.' + st), count: dinos.filter((d) => d.status === st).length }))],
        'all', (key) => { statusFilter = key === 'all' ? null : key; draw(); }),
      el('div.search-field', {}, uiIcon('magnifying-glass'), search)),
    listBox
  );
  draw();
}

/* ========================================================================== */
/* Anlegen / Bearbeiten                                                       */
/* ========================================================================== */

export async function renderDinoForm(mount, ctx, idParam) {
  const { go, user } = ctx;
  if (!user.roles.some((role) => ['admin', 'developer', 'breeder_crafter'].includes(role))) {
    mount.replaceChildren(emptyState(t('dino.read_only')));
    return;
  }
  const editingId = idParam && idParam !== 'new' ? parseInt(idParam, 10) : null;
  mount.append(spinner());

  const [existing, { members }, { dinos: allDinos }] = await Promise.all([
    editingId ? api.dino(editingId) : Promise.resolve(null),
    api.members().catch(() => ({ members: [] })),
    api.dinos().catch(() => ({ dinos: [] })),
  ]);
  const d = existing?.dino || {};
  const stats = d.stats || {};

  mount.replaceChildren();

  const name = el('input', { type: 'text', value: d.name || '', required: true });
  const species = el('input', { type: 'text', value: d.species || '', required: true, list: 'species-list' });
  const speciesList = el('datalist', { id: 'species-list' }, ...[...new Set(allDinos.map((x) => x.species))].map((s) => el('option', { value: s })));
  const sex = el('select', {}, ...['unknown', 'male', 'female'].map((s) => el('option', { value: s, text: t('dino.sex.' + s), selected: (d.sex || 'unknown') === s })));
  const level = el('input', { type: 'number', min: '1', value: d.level || '' });
  // Zuchttiere gehoeren Breedern (bzw. Konten mit der alten kombinierten Rolle).
  const breeders = members.filter((m) => { const r = m.roles || []; return r.includes('breeder') || (r.includes('breeder_crafter') && !r.includes('crafter')); });
  const owner = el('select', {}, el('option', { value: '', text: '—' }), ...breeders.map((m) => el('option', { value: m.id, text: m.username, selected: d.owner_id === m.id })));
  const server = el('input', { type: 'text', value: d.server || '' });
  const map = el('input', { type: 'text', value: d.map || '' });
  const location = el('input', { type: 'text', value: d.location || '', placeholder: t('dino.location_ph') });
  const generation = el('input', { type: 'number', min: '0', value: d.generation ?? '' });
  const mutM = el('input', { type: 'number', min: '0', value: d.mutations_male ?? 0 });
  const mutF = el('input', { type: 'number', min: '0', value: d.mutations_female ?? 0 });
  const status = el('select', {}, ...['active', 'breeding', 'paused', 'reserve'].map((s) => el('option', { value: s, text: t('dino.status.' + s), selected: (d.status || 'active') === s })));
  const notes = el('textarea', { value: d.notes || '' });

  const otherDinos = allDinos.filter((x) => x.id !== editingId);
  const father = el('select', {}, el('option', { value: '', text: '—' }), ...otherDinos.map((x) => el('option', { value: x.id, text: `${x.name} (${x.species})`, selected: d.parent_male_id === x.id })));
  const mother = el('select', {}, el('option', { value: '', text: '—' }), ...otherDinos.map((x) => el('option', { value: x.id, text: `${x.name} (${x.species})`, selected: d.parent_female_id === x.id })));

  const statInputs = {};
  const statFields = STAT_KEYS.map((k) => {
    const inp = el('input', { type: 'number', step: '0.1', value: stats[k] ?? '', placeholder: t('dino.stat.' + k) });
    statInputs[k] = inp;
    return el('div.field', {}, el('label', { text: t('dino.stat.' + k) }), inp);
  });

  const submit = el('button.btn.primary.lux', { type: 'button', text: editingId ? t('dino.save') : t('dino.create') });

  submit.addEventListener('click', async (e) => {
    e.preventDefault();
    if (!name.value.trim() || !species.value.trim()) { toast(t('dino.name_species_required'), 'err'); return; }
    submit.disabled = true;
    const statsOut = {};
    for (const k of STAT_KEYS) if (statInputs[k].value !== '') statsOut[k] = parseFloat(statInputs[k].value);

    const body = {
      name: name.value.trim(),
      species: species.value.trim(),
      sex: sex.value,
      level: level.value || null,
      ownerId: owner.value || null,
      server: server.value.trim(),
      map: map.value.trim(),
      location: location.value.trim(),
      generation: generation.value,
      mutationsMale: mutM.value,
      mutationsFemale: mutF.value,
      parentMaleId: father.value || null,
      parentFemaleId: mother.value || null,
      status: status.value,
      stats: Object.keys(statsOut).length ? statsOut : null,
      notes: notes.value.trim(),
    };
    try {
      const result = editingId ? await api.updateDino(editingId, body) : await api.createDino(body);
      toast(editingId ? t('dino.saved') : t('dino.created'));
      go('/dinos/' + result.dino.id, true);
    } catch (err) { toast(err.message, 'err'); submit.disabled = false; }
  });

  const f = (key, input, cls = '') => el('div.field' + cls, {}, el('label', { text: t(key) }), input);
  mount.append(
    pageHead({ title: editingId ? t('dino.edit') : t('dino.new'), icon: 'chart-bar', back: { onclick: () => go(editingId ? '/dinos/' + editingId : '/dinos') } }),
    speciesList,
    el('div.dino-form', {},
      panel({ title: t('dino.title'), icon: 'paw-print' },
        el('div.form-grid', {}, f('dino.name', name), f('dino.species', species), f('dino.sex_label', sex), f('dino.level', level),
          f('dino.breeder', owner), f('dino.status_label', status), f('dino.server', server), f('dino.map', map), f('dino.location', location, '.span-2'))),
      panel({ title: t('dino.breeding'), icon: 'egg' },
        el('div.form-grid', {}, f('dino.generation', generation), el('div'), f('dino.mutations_male', mutM), f('dino.mutations_female', mutF), f('dino.father', father), f('dino.mother', mother))),
      panel({ title: t('dino.stats'), icon: 'chart-bar' }, el('div.stat-form-grid', {}, ...statFields)),
      panel({ title: t('dino.notes'), icon: 'clipboard-text' }, notes)),
    el('div.form-actions', {}, el('button.btn.ghost', { type: 'button', text: t('common.cancel'), onclick: () => go(editingId ? '/dinos/' + editingId : '/dinos') }), submit)
  );
}

/* ========================================================================== */
/* Detailansicht                                                              */
/* ========================================================================== */

export async function renderDinoDetail(mount, ctx, idParam) {
  const { go, user } = ctx;
  const id = parseInt(idParam, 10);
  mount.append(spinner());
  let data;
  try {
    data = (await api.dino(id)).dino;
  } catch (err) {
    mount.replaceChildren(emptyState(err.message));
    return;
  }

  mount.replaceChildren();

  const artBox = el('div.dino-hero-art', {}, dinoArt(data), statusBadge(data.status));
  const fileInput = el('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp', hidden: true });
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files[0];
    if (!file) return;
    try {
      const base64 = await fileToBase64(file);
      const res = await api.uploadDinoImage(id, { imageBase64: base64, mimeType: file.type });
      data.image_path = res.imagePath + '?v=' + Date.now();
      artBox.replaceChildren(dinoArt(data), statusBadge(data.status));
      toast(t('dino.image_saved'));
    } catch (err) { toast(err.message, 'err'); }
  });

  const canDelete = user.roles.includes('admin') || user.roles.includes('developer');
  const canEdit = canDelete || user.roles.includes('breeder_crafter');
  const fact = (label, value) => el('div.fact', {}, el('dt', { text: label }), el('dd', {}, value instanceof Node ? value : el('span', { text: String(value) })));
  const statEntries = STAT_KEYS.filter((k) => data.stats && data.stats[k] != null);

  mount.append(
    pageHead({
      title: data.name, sub: [data.species, data.level ? 'Lvl ' + data.level : null].filter(Boolean).join(' · '), icon: 'chart-bar',
      back: { onclick: () => go('/dinos') },
      actions: [
        canEdit ? el('button.btn', { type: 'button', onclick: () => go('/dinos/' + id + '/edit') }, uiIcon('pencil-simple'), el('span', { text: t('dino.edit') })) : null,
        kebabMenu([
          canEdit ? { label: t('dino.image_upload'), icon: 'image', onclick: () => fileInput.click() } : null,
          canDelete ? { label: t('common.delete'), icon: 'trash', danger: true, onclick: async () => {
            const ok = await confirmDialog({ title: t('dino.delete_confirm', { name: data.name }), danger: true });
            if (!ok) return;
            try { await api.deleteDino(id); toast(t('dino.deleted')); go('/dinos'); }
            catch (err) { toast(err.message, 'err'); }
          } } : null,
        ]),
      ],
    }),
    fileInput,
    el('div.task-detail-grid', {},
      el('div.task-detail-main', {},
        el('section.dino-hero', {}, artBox,
          el('div.dino-stat-grid', {}, ...(statEntries.length
            ? statEntries.map((k) => el('div.dino-stat', {}, el('span', { text: t('dino.stat.' + k) }), el('strong', { text: String(data.stats[k]) })))
            : [el('p.hint', { text: t('dino.stats') + ': —' })]))),
        (data.father || data.mother || data.children?.length) ? panel({ title: t('dino.breeding'), icon: 'egg' },
          el('dl.fact-list', {},
            ...[
              data.father ? fact(t('dino.father'), linkTo(data.father, go)) : null,
              data.mother ? fact(t('dino.mother'), linkTo(data.mother, go)) : null,
              data.children?.length ? fact(t('dino.children'), el('div.chips', {}, ...data.children.map((c) => el('button.btn.sm', { type: 'button', text: c.name, onclick: () => go('/dinos/' + c.id) })))) : null,
            ].filter(Boolean))) : el('span', { hidden: true }),
        data.notes ? panel({ title: t('dino.notes'), icon: 'clipboard-text' }, el('p', { text: data.notes })) : el('span', { hidden: true })),
      el('aside.task-detail-side', {},
        panel({ title: t('dino.title'), icon: 'info' },
          el('dl.fact-list', {},
            fact(t('dino.status_label'), statusBadge(data.status)),
            fact(t('dino.breeder'), data.ownerName || data.owner_name || '—'),
            fact(t('dino.sex_label'), t('dino.sex.' + data.sex)),
            fact(t('dino.server'), data.server || '—'),
            fact(t('dino.map'), data.map || '—'),
            fact(t('dino.location'), data.location || '—'),
            fact(t('dino.generation'), data.generation ?? '—'),
            fact(t('dino.mutations_male'), String(data.mutations_male || 0)),
            fact(t('dino.mutations_female'), String(data.mutations_female || 0))))))
  );
}

function statsSummary(dino) {
  const entries = Object.entries(dino.stats || {}).filter(([, value]) => value !== null && value !== '');
  return entries.slice(0, 3).map(([key, value]) => `${t('dino.stat.' + key)} ${value}`).join(' · ');
}

function linkTo(ref, go) {
  return el('button.btn.sm', { type: 'button', text: `${ref.name} (${ref.species})`, onclick: () => go('/dinos/' + ref.id) });
}
