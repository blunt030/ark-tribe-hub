import { el, spinner, emptyState, toast, confirmDialog, fileToBase64 } from '../ui.js';
import { t } from '../i18n.js';
import { api } from '../api.js';

const STAT_KEYS = ['health', 'stamina', 'oxygen', 'food', 'weight', 'melee', 'movement_speed', 'torpor'];

function statusBadge(status) {
  return el('span.badge.b-' + (status === 'active' ? 'completed' : status === 'dead' ? 'cancelled' : 'pending'), { text: t('dino.status.' + status) });
}

/* ========================================================================== */
/* Liste                                                                      */
/* ========================================================================== */

export async function renderDinos(mount, ctx) {
  const { go } = ctx;
  mount.append(spinner());
  let dinos = (await api.dinos()).dinos;

  let query = '';
  let statusFilter = null;
  const listBox = el('div.list');
  const search = el('input', { type: 'search', placeholder: t('dino.search_ph') });

  function draw() {
    const filtered = dinos.filter(
      (d) =>
        (!statusFilter || d.status === statusFilter) &&
        (!query || d.name.toLowerCase().includes(query.toLowerCase()) || d.species.toLowerCase().includes(query.toLowerCase()))
    );
    listBox.replaceChildren(
      ...(filtered.length
        ? filtered.map((d) =>
            el('div.row', {
              style: 'cursor:pointer',
              onclick: () => go('/dinos/' + d.id),
              role: 'button',
              tabindex: '0',
              onkeydown: (e) => { if (e.key === 'Enter') go('/dinos/' + d.id); },
            },
              d.image_path
                ? el('img', { src: '/uploads/' + d.image_path, alt: '', style: 'width:40px;height:40px;object-fit:cover;border-radius:8px;flex:0 0 40px' })
                : el('span', { style: 'width:40px;height:40px;display:flex;align-items:center;justify-content:center;font-size:1.4rem;flex:0 0 40px;background:var(--raised);border-radius:8px', text: '🦖' }),
              el('div.grow', {},
                el('div.rt', { text: `${d.name} (${d.species})` }),
                el('div.rs', { text: [d.level ? 'Lvl ' + d.level : null, d.sex !== 'unknown' ? t('dino.sex.' + d.sex) : null, d.server].filter(Boolean).join(' · ') })
              ),
              statusBadge(d.status)
            )
          )
        : [emptyState(t('dino.none'))])
    );
  }

  search.addEventListener('input', () => { query = search.value.trim(); draw(); });

  mount.replaceChildren();
  mount.append(
    el('div.page-head', {},
      el('div', {}, el('h1', { text: t('dino.title') }), el('p', { text: t('dino.sub', { n: dinos.length }) })),
      el('button.btn.primary', { text: '+ ' + t('dino.new'), onclick: () => go('/dinos/new') })
    ),
    el('div.card', {}, search,
      el('div.chips', { style: 'margin-top:12px' },
        el('button.btn.sm.primary', { text: t('common.all'), onclick: (e) => { statusFilter = null; setActive(e); draw(); } }),
        ...['active', 'dead', 'traded', 'lost'].map((s) =>
          el('button.btn.sm', { text: t('dino.status.' + s), onclick: (e) => { statusFilter = s; setActive(e); draw(); } })
        )
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
/* Anlegen / Bearbeiten                                                       */
/* ========================================================================== */

export async function renderDinoForm(mount, ctx, idParam) {
  const { go } = ctx;
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
  const owner = el('select', {}, el('option', { value: '', text: '—' }), ...members.map((m) => el('option', { value: m.id, text: m.username, selected: d.owner_id === m.id })));
  const server = el('input', { type: 'text', value: d.server || '' });
  const map = el('input', { type: 'text', value: d.map || '' });
  const location = el('input', { type: 'text', value: d.location || '', placeholder: t('dino.location_ph') });
  const generation = el('input', { type: 'number', min: '0', value: d.generation ?? '' });
  const mutM = el('input', { type: 'number', min: '0', value: d.mutations_male ?? 0 });
  const mutF = el('input', { type: 'number', min: '0', value: d.mutations_female ?? 0 });
  const status = el('select', {}, ...['active', 'dead', 'traded', 'lost'].map((s) => el('option', { value: s, text: t('dino.status.' + s), selected: (d.status || 'active') === s })));
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

  const submit = el('button.btn.primary.block', { text: editingId ? t('dino.save') : t('dino.create') });

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

  mount.append(
    el('div.page-head', {}, el('button.btn.sm', { text: '← ' + t('common.back'), onclick: () => go(editingId ? '/dinos/' + editingId : '/dinos') })),
    el('h1', { text: editingId ? t('dino.edit') : t('dino.new') }),
    speciesList,
    el('div.card', {},
      el('div.field', {}, el('label', { text: t('dino.name') }), name),
      el('div.field', {}, el('label', { text: t('dino.species') }), species),
      el('div.field', {}, el('label', { text: t('dino.sex_label') }), sex),
      el('div.field', {}, el('label', { text: t('dino.level') }), level),
      el('div.field', {}, el('label', { text: t('dino.owner') }), owner),
      el('div.field', {}, el('label', { text: t('dino.server') }), server),
      el('div.field', {}, el('label', { text: t('dino.map') }), map),
      el('div.field', {}, el('label', { text: t('dino.location') }), location),
      el('div.field', {}, el('label', { text: t('dino.status_label') }), status)
    ),
    el('div.section-title', { style: 'margin-top:18px' }, t('dino.breeding')),
    el('div.card', {},
      el('div.field', {}, el('label', { text: t('dino.generation') }), generation),
      el('div.field', {}, el('label', { text: t('dino.mutations_male') }), mutM),
      el('div.field', {}, el('label', { text: t('dino.mutations_female') }), mutF),
      el('div.field', {}, el('label', { text: t('dino.father') }), father),
      el('div.field', {}, el('label', { text: t('dino.mother') }), mother)
    ),
    el('div.section-title', { style: 'margin-top:18px' }, t('dino.stats')),
    el('div.card', {}, ...statFields),
    el('div.section-title', { style: 'margin-top:18px' }, t('dino.notes')),
    el('div.card', {}, notes),
    el('div', { style: 'margin-top:18px' }, submit)
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

  const avatarImg = el('img', {
    src: data.image_path ? '/uploads/' + data.image_path : '',
    alt: '',
    style: `width:88px;height:88px;border-radius:12px;object-fit:cover;background:var(--raised);border:1px solid var(--line);${data.image_path ? '' : 'display:none'}`,
  });
  const placeholderIcon = el('div', { style: `width:88px;height:88px;border-radius:12px;background:var(--raised);border:1px solid var(--line);display:${data.image_path ? 'none' : 'flex'};align-items:center;justify-content:center;font-size:2.2rem`, text: '🦖' });
  const fileInput = el('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp', style: 'display:none' });
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files[0];
    if (!file) return;
    try {
      const base64 = await fileToBase64(file);
      const res = await api.uploadDinoImage(id, { imageBase64: base64, mimeType: file.type });
      avatarImg.src = '/uploads/' + res.imagePath + '?v=' + Date.now();
      avatarImg.style.display = '';
      placeholderIcon.style.display = 'none';
      toast(t('dino.image_saved'));
    } catch (err) { toast(err.message, 'err'); }
  });

  const canDelete = user.roles.includes('admin') || user.roles.includes('developer');

  mount.append(
    el('div.page-head', {}, el('button.btn.sm', { text: '← ' + t('common.back'), onclick: () => go('/dinos') })),
    el('div.card', {},
      el('div', { style: 'display:flex;gap:16px;align-items:center;flex-wrap:wrap' },
        avatarImg, placeholderIcon,
        el('div', { style: 'flex:1' },
          el('div', { style: 'font-family:var(--ff-display);font-size:1.3rem;font-weight:700', text: data.name }),
          el('div', { style: 'color:var(--muted)', text: data.species }),
          el('div.chips', { style: 'margin-top:8px' }, statusBadge(data.status), data.level ? el('span.badge', { text: 'Lvl ' + data.level }) : null)
        ),
        el('button.btn.sm', { text: t('dino.image_upload'), onclick: () => fileInput.click() }),
        fileInput
      )
    ),
    el('div.card', { style: 'margin-top:14px' },
      infoRow(t('dino.owner'), data.ownerName || '—'),
      infoRow(t('dino.sex_label'), t('dino.sex.' + data.sex)),
      infoRow(t('dino.server'), data.server || '—'),
      infoRow(t('dino.map'), data.map || '—'),
      infoRow(t('dino.location'), data.location || '—'),
      infoRow(t('dino.generation'), data.generation ?? '—'),
      infoRow(t('dino.mutations_male'), String(data.mutations_male || 0)),
      infoRow(t('dino.mutations_female'), String(data.mutations_female || 0))
    ),
    // Bedingte Karten: NIE ein rohes null direkt an mount.append() übergeben - das
    // native DOM-append() wandelt null/undefined-Argumente in den sichtbaren Text
    // "null" um (anders als der eigene el()-Helfer, der Kinder korrekt filtert).
    // Deshalb hier erst sammeln und mit .filter(Boolean) bereinigen.
    ...[
      (data.father || data.mother || data.children?.length)
        ? el('div.card', { style: 'margin-top:14px' },
            el('div.section-title', {}, t('dino.breeding')),
            ...[
              data.father ? infoRow(t('dino.father'), linkTo(data.father, go)) : null,
              data.mother ? infoRow(t('dino.mother'), linkTo(data.mother, go)) : null,
              data.children?.length
                ? infoRow(t('dino.children'), el('div.chips', {}, ...data.children.map((c) => el('button.btn.sm', { text: c.name, onclick: () => go('/dinos/' + c.id) }))))
                : null,
            ].filter(Boolean)
          )
        : null,
      data.stats
        ? el('div.card', { style: 'margin-top:14px' },
            el('div.section-title', {}, t('dino.stats')),
            ...STAT_KEYS.filter((k) => data.stats[k] != null).map((k) => infoRow(t('dino.stat.' + k), String(data.stats[k])))
          )
        : null,
      data.notes ? el('div.card', { style: 'margin-top:14px' }, el('div.section-title', {}, t('dino.notes')), el('p', { text: data.notes })) : null,
    ].filter(Boolean),
    el('div.chips', { style: 'margin-top:18px' },
      el('button.btn', { text: t('dino.edit'), onclick: () => go('/dinos/' + id + '/edit') }),
      canDelete
        ? el('button.btn.danger', {
            text: t('common.delete'),
            onclick: async () => {
              const ok = await confirmDialog({ title: t('dino.delete_confirm', { name: data.name }), danger: true });
              if (!ok) return;
              try { await api.deleteDino(id); toast(t('dino.deleted')); go('/dinos'); }
              catch (err) { toast(err.message, 'err'); }
            },
          })
        : null
    )
  );
}

function infoRow(label, value) {
  const valueNode = value instanceof Node ? value : el('div.rt', { text: String(value) });
  return el('div.row', {}, el('div.grow', {}, el('div.rs', { text: label }), value instanceof Node ? null : valueNode), value instanceof Node ? value : null);
}

function linkTo(ref, go) {
  return el('button.btn.sm', { text: `${ref.name} (${ref.species})`, onclick: () => go('/dinos/' + ref.id) });
}
