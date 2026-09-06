import { el, spinner, emptyState, toast, confirmDialog, fileToBase64 } from '../ui.js';
import { iconFuerItem } from '../icons.js';
import { t, timeAgo, LANGS, getLang, setLang } from '../i18n.js';
import { api } from '../api.js';

/* ========================================================================== */
/* Mitteilungen                                                               */
/* ========================================================================== */

export async function renderNotifications(mount, ctx) {
  const { go, refreshBadges } = ctx;
  mount.append(spinner());

  const { notifications } = await api.notifications();

  mount.replaceChildren();
  mount.append(
    el('div.page-head', {},
      el('div', {}, el('h1', { text: t('notif.title') })),
      el('div.chips', {},
      notifications.some((n) => n.is_read)
        ? el('button.btn', {
            text: t('notif.clear_read'),
            onclick: async (e) => {
              e.target.disabled = true;
              await api.clearReadNotifications();
              await refreshBadges();
              go('/notifications', true);
            },
          })
        : null,
      notifications.some((n) => !n.is_read)
        ? el('button.btn', {
            text: t('notif.read_all'),
            onclick: async (e) => {
              e.target.disabled = true;
              await api.markAllRead();
              await refreshBadges();
              go('/notifications', true);
            },
          })
        : null
      )
    )
  );

  mount.append(
    notifications.length
      ? el('div.list', {},
          ...notifications.map((n) =>
            el('div.notif' + (n.is_read ? '' : '.unread'), {},
              el('div', { style: 'flex:1' },
                el('div.nt', { text: t('n.' + n.type) }),
                el('div.nd', { text: timeAgo(n.created_at) })
              ),
              n.payload?.orderId
                ? el('button.btn.sm', {
                    text: t('order.detail'),
                    onclick: async () => {
                      if (!n.is_read) { await api.markRead(n.id); await refreshBadges(); }
                      go('/orders/' + n.payload.orderId);
                    },
                  })
                : null,
              el('button.btn.sm.ghost', {
                text: '✕',
                title: t('common.delete'),
                onclick: async () => {
                  try {
                    await api.deleteNotification(n.id);
                    await refreshBadges();
                    go('/notifications', true);
                  } catch (err) { toast(err.message, 'err'); }
                },
              })
            )
          )
        )
      : emptyState(t('notif.none'))
  );

  // Die Einstellungen (welche Art von Benachrichtigung man erhält) leben jetzt im
  // Profil unter "Einstellungen" - hier auf dieser Seite geht es nur noch um den
  // eigentlichen Posteingang, das war vorher vermischt.
  mount.append(
    el('p.hint', { style: 'margin-top:16px;text-align:center' },
      t('notif.settings_moved'), ' ',
      el('a', { href: '#/profile', text: t('nav.profile') })
    )
  );
}

/* ========================================================================== */
/* Profil                                                                     */
/* ========================================================================== */

export async function renderProfile(mount, ctx) {
  const { user, onSignOut, reloadUser, go } = ctx;
  mount.append(spinner());

  const [{ user: me }, tribe, { preferences }] = await Promise.all([
    api.profile(),
    api.myTribe().catch(() => null),
    api.notifPrefs(),
  ]);

  mount.replaceChildren();

  const server = el('input', { type: 'text', value: me.server || '', id: 'p-server' });
  const map = el('input', { type: 'text', value: me.map || '', id: 'p-map' });
  const vault = el('input', { type: 'text', value: me.personalVaultNumber || '', id: 'p-vault' });
  const saveBtn = el('button.btn.primary', { text: t('profile.save') });

  saveBtn.addEventListener('click', async () => {
    saveBtn.disabled = true;
    try {
      await api.updateProfile({
        server: server.value.trim(),
        map: map.value.trim(),
        personalVaultNumber: vault.value.trim(),
      });
      toast(t('profile.saved'));
    } catch (err) { toast(err.message, 'err'); }
    finally { saveBtn.disabled = false; }
  });

  const avatarImg = el('img', {
    src: me.avatarPath ? '/uploads/' + me.avatarPath : '/assets/logo.png',
    alt: '',
    style: 'width:76px;height:76px;border-radius:50%;object-fit:cover;border:1px solid var(--line);background:var(--raised)',
  });
  const fileInput = el('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp', style: 'display:none' });
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files[0];
    if (!file) return;
    try {
      const base64 = await fileToBase64(file);
      const res = await api.uploadAvatar({ imageBase64: base64, mimeType: file.type });
      avatarImg.src = '/uploads/' + res.avatarPath + '?v=' + Date.now();
      toast(t('profile.saved'));
      await reloadUser();
    } catch (err) { toast(err.message, 'err'); }
  });

  // Passwortwechsel - vorher gab es GAR KEINE Möglichkeit, das Passwort zu ändern.
  const pwCurrentInput = el('input', { type: 'password', autocomplete: 'current-password', id: 'pw-cur' });
  const pwNewInput = el('input', { type: 'password', autocomplete: 'new-password', id: 'pw-new' });
  const pwRepeatInput = el('input', { type: 'password', autocomplete: 'new-password', id: 'pw-rep' });
  const pwCurrent = el('div.field', {}, el('label', { for: 'pw-cur', text: t('pw.current') }), pwCurrentInput);
  const pwNew = el('div.field', {}, el('label', { for: 'pw-new', text: t('pw.new') }), pwNewInput);
  const pwRepeat = el('div.field', {}, el('label', { for: 'pw-rep', text: t('pw.repeat') }), pwRepeatInput);
  const pwSaveBtn = el('button.btn.primary', { text: t('pw.save') });
  pwSaveBtn.addEventListener('click', async () => {
    if (pwNewInput.value !== pwRepeatInput.value) { toast(t('pw.mismatch'), 'err'); return; }
    if (pwNewInput.value.length < 8) { toast(t('pw.too_short'), 'err'); return; }
    pwSaveBtn.disabled = true;
    try {
      await api.changePassword({ currentPassword: pwCurrentInput.value, newPassword: pwNewInput.value });
      pwCurrentInput.value = pwNewInput.value = pwRepeatInput.value = '';
      toast(t('pw.changed'));
    } catch (err) { toast(err.message, 'err'); }
    finally { pwSaveBtn.disabled = false; }
  });

  // Einstellungen -> Benachrichtigungen: jede Art einzeln schaltbar, plus
  // "Alle an/aus" für den schnellen Fall.
  const prefChanged = new Map();
  const prefSaveBtn = el('button.btn.primary', { text: t('profile.save'), disabled: true });
  const prefBoxes = [];

  function markChanged() { prefSaveBtn.disabled = false; }

  const prefList = el('div.list', {},
    ...preferences.map((p) => {
      const box = el('input', { type: 'checkbox', style: 'width:auto', id: 'p-' + p.type });
      box.checked = p.enabled;
      box.addEventListener('change', () => { prefChanged.set(p.type, box.checked); markChanged(); });
      prefBoxes.push(box);
      return el('label.row', { for: 'p-' + p.type, style: 'cursor:pointer' },
        box,
        el('div.grow', {}, el('div.rt', { text: t('n.' + p.type) }))
      );
    })
  );

  prefSaveBtn.addEventListener('click', async () => {
    prefSaveBtn.disabled = true;
    try {
      await api.saveNotifPrefs([...prefChanged].map(([type, enabled]) => ({ type, enabled })));
      toast(t('notif.saved'));
      prefChanged.clear();
    } catch (err) { toast(err.message, 'err'); prefSaveBtn.disabled = false; }
  });

  const setAll = (enabled) => {
    for (const box of prefBoxes) {
      if (box.checked !== enabled) { box.checked = enabled; box.dispatchEvent(new Event('change')); }
    }
  };

  mount.append(
    el('div.page-head', {}, el('div', {}, el('h1', { text: t('profile.title') }))),
    el('div.card', {},
      el('div', { style: 'display:flex;gap:16px;align-items:center;margin-bottom:18px' },
        avatarImg,
        el('div', {},
          el('div', { style: 'font-family:var(--ff-display);font-size:1.3rem;font-weight:700', text: me.username }),
          el('div', { style: 'color:var(--muted);font-size:.86rem', text: tribe?.tribe?.name || '—' }),
          el('div.chips', { style: 'margin-top:7px' },
            ...me.roles.map((r) => el('span.badge.b-role', { text: t('role.' + r) }))
          )
        )
      ),
      el('button.btn.sm', { text: t('profile.upload'), onclick: () => fileInput.click() }),
      fileInput
    ),
    el('div.card', { style: 'margin-top:14px' },
      el('div.field', {}, el('label', { for: 'p-server', text: t('profile.server') }), server),
      el('div.field', {}, el('label', { for: 'p-map', text: t('profile.map') }), map),
      el('div.field', {}, el('label', { for: 'p-vault', text: t('profile.vault') }), vault),
      el('p.hint', { text: t('profile.visibility'), style: 'margin:-6px 0 14px' }),
      saveBtn
    ),
    el('div.card', { style: 'margin-top:14px' },
      el('div.field', {}, el('label', { text: t('profile.language') }),
        el('div.chips', {},
          ...LANGS.map((l) =>
            el('button.btn.sm' + (getLang() === l.code ? '.primary' : ''), {
              text: `${l.code.toUpperCase()} · ${l.label}`,
              onclick: () => { setLang(l.code); location.reload(); },
            })
          )
        )
      )
    ),
    el('div.section-title', { style: 'margin-top:22px' }, '⚙️ ' + t('profile.settings')),
    el('div.card', {},
      el('div', { style: 'font-weight:600;margin-bottom:4px', text: '🔑 ' + t('pw.title') }),
      el('p', { style: 'color:var(--muted);font-size:.86rem;margin:0 0 12px', text: t('pw.hint') }),
      pwCurrent, pwNew, pwRepeat, pwSaveBtn
    ),
    el('div.card', { style: 'margin-top:14px' },
      el('div', { style: 'font-weight:600;margin-bottom:4px', text: '🔔 ' + t('notif.settings') }),
      el('p', { style: 'color:var(--muted);font-size:.86rem;margin:0 0 12px', text: t('notif.settings_hint') }),
      el('div.chips', { style: 'margin-bottom:12px' },
        el('button.btn.sm', { text: t('notif.enable_all'), onclick: () => setAll(true) }),
        el('button.btn.sm', { text: t('notif.disable_all'), onclick: () => setAll(false) })
      ),
      prefList,
      el('div', { style: 'margin-top:14px' }, prefSaveBtn)
    ),
    adminLinks(user, go),
    el('div', { style: 'margin-top:18px' },
      el('button.btn.danger', { text: t('auth.logout'), onclick: onSignOut })
    )
  );
}

/**
 * Verwaltungsbereiche als Kacheln auf der Profilseite. Auf dem Desktop stehen sie
 * zusaetzlich in der Seitenleiste; auf dem Handy ist das hier der Weg dorthin,
 * weil die untere Leiste bewusst bei fuenf festen Eintraegen bleibt.
 */
function adminLinks(user, go) {
  const links = [];
  // "Offene Bestellungen" ist aus der Hauptnavigation entfernt (Punkt 18), die
  // Funktion bleibt aber vollstaendig erhalten und ist hier erreichbar.
  links.push(['/orders', t('nav.orders')]);
  if (!user.roles.includes('developer') && user.tribeId) {
    links.push(['/dinos', t('nav.dinos')], ['/servers', t('nav.servers')], ['/tasks', t('nav.tasks')], ['/inventory', t('nav.inventory')], ['/voice', t('nav.voice')]);
  }
  if (user.roles.includes('admin') || user.roles.includes('developer')) {
    links.push(['/members', t('nav.members')], ['/news', t('nav.news')], ['/audit', t('nav.audit')]);
  }
  if (user.roles.includes('developer')) {
    links.push(['/tribes', t('nav.tribes')], ['/users', t('nav.users')], ['/catalog', t('nav.catalog')]);
  }
  if (!links.length) return null;

  const group = user.roles.includes('developer') ? t('nav.group.platform') : t('nav.group.tribe');
  return el('div', {},
    el('div.section-title', {}, group),
    el('div.chips', {},
      ...links.map(([path, label]) => el('button.btn.sm', { text: label, onclick: () => go(path) }))
    )
  );
}

/* ========================================================================== */
/* Admin – Mitglieder                                                         */
/* ========================================================================== */

export async function renderMembers(mount, ctx) {
  mount.append(spinner());
  let members;
  try {
    members = (await api.members()).members;
  } catch (err) {
    mount.replaceChildren(emptyState(err.message));
    return;
  }

  function draw() {
    mount.replaceChildren();
    mount.append(el('div.page-head', {}, el('div', {}, el('h1', { text: t('admin.members') }))));

    const pending = members.filter((m) => m.status === 'pending_approval');
    const active = members.filter((m) => m.status !== 'pending_approval');

    mount.append(el('div.section-title', {}, t('admin.pending'), el('span.c', { text: pending.length })));
    mount.append(
      pending.length
        ? el('div.list', {}, ...pending.map(pendingRow))
        : emptyState(t('admin.no_pending'))
    );

    mount.append(el('div.section-title', {}, t('admin.members'), el('span.c', { text: active.length })));
    mount.append(el('div.list', {}, ...active.map(memberRow)));
  }

  async function reload() {
    members = (await api.members()).members;
    draw();
  }

  function pendingRow(m) {
    return el('div.row', {},
      el('div.grow', {},
        el('div.rt', { text: m.username }),
        el('div.rs', { text: timeAgo(m.created_at) })
      ),
      el('button.btn.sm.primary', {
        text: t('admin.approve'),
        onclick: async (e) => {
          e.target.disabled = true;
          try { await api.approve(m.id); toast(t('admin.approved')); await reload(); }
          catch (err) { toast(err.message, 'err'); e.target.disabled = false; }
        },
      }),
      el('button.btn.sm.danger', {
        text: t('admin.reject'),
        onclick: async () => {
          const ok = await confirmDialog({ title: t('admin.reject') + ' – ' + m.username, danger: true });
          if (!ok) return;
          try { await api.reject(m.id); toast(t('admin.rejected')); await reload(); }
          catch (err) { toast(err.message, 'err'); }
        },
      })
    );
  }

  function memberRow(m) {
    const isBreeder = m.roles.includes('breeder_crafter');
  const istAdmin = (m.roles || []).includes('admin');
    return el('div.row', {},
      el('div.grow', {},
        el('div.rt', { text: m.username }),
        el('div.rs', {}, ...m.roles.map((r) => el('span.badge.b-role', { text: t('role.' + r), style: 'margin-right:4px' })))
      ),
      m.status !== 'active' ? el('span.badge.b-pending', { text: t('ustatus.' + m.status) }) : null,
      el('button.btn.sm' + (isBreeder ? '.primary' : ''), {
        text: t('admin.make_breeder'),
        onclick: async (e) => {
          e.target.disabled = true;
          try { await api.setBreeder(m.id, !isBreeder); toast(t('admin.role_saved')); await reload(); }
          catch (err) { toast(err.message, 'err'); e.target.disabled = false; }
        },
      }),
      // Adminrechte vergeben/entziehen. Der Server prüft zusätzlich, dass der
      // letzte Admin sich die Rolle nicht selbst entziehen kann.
      el('button.btn.sm' + (istAdmin ? '.primary' : ''), {
        text: t('admin.make_admin'),
        onclick: async (e) => {
          e.target.disabled = true;
          try { await api.setTribeAdmin(m.id, !istAdmin); toast(t('admin.role_saved')); await reload(); }
          catch (err) { toast(err.message, 'err'); e.target.disabled = false; }
        },
      }),
      m.status === 'active'
        ? el('button.btn.sm.danger', {
            text: t('admin.disable'),
            onclick: async () => {
              const ok = await confirmDialog({ title: t('admin.disable') + ' – ' + m.username, danger: true });
              if (!ok) return;
              try { await api.disableMember(m.id); toast(t('admin.disabled')); await reload(); }
              catch (err) { toast(err.message, 'err'); }
            },
          })
        : null
    );
  }

  draw();
}

/* ========================================================================== */
/* Protokoll                                                                  */
/* ========================================================================== */

export async function renderAudit(mount, ctx) {
  mount.append(spinner());
  const isDev = ctx.user.roles.includes('developer');
  let logs;
  try {
    logs = (isDev ? await api.devAuditLogs() : await api.auditLogs()).logs;
  } catch (err) {
    mount.replaceChildren(emptyState(err.message));
    return;
  }

  mount.replaceChildren();
  mount.append(
    el('div.page-head', {}, el('div', {},
      el('h1', { text: t('admin.audit') }),
      el('p', { text: t('admin.audit_sub') })
    ))
  );
  mount.append(
    logs.length
      ? el('div.list', {},
          ...logs.map((l) =>
            el('div.row', {},
              el('div.grow', {},
                el('div.rt', { text: l.action.replaceAll('_', ' ') }),
                el('div.rs', { text: `${l.target_type || ''} ${l.target_id || ''} · ${timeAgo(l.created_at)}` })
              )
            )
          )
        )
      : emptyState(t('notif.none'))
  );
}

/* ========================================================================== */
/* Developer                                                                  */
/* ========================================================================== */

export async function renderTribes(mount, ctx) {
  mount.append(spinner());
  let tribes = (await api.tribes()).tribes;

  function draw() {
    mount.replaceChildren();
    const name = el('input', { type: 'text', id: 'nt-name', placeholder: 'OaO' });
    const slug = el('input', { type: 'text', id: 'nt-slug', placeholder: 'oao' });
    const create = el('button.btn.primary', { text: t('dev.new_tribe') });

    create.addEventListener('click', async () => {
      create.disabled = true;
      try {
        await api.createTribe({ name: name.value.trim(), slug: slug.value.trim().toLowerCase() });
        toast(t('dev.created'));
        tribes = (await api.tribes()).tribes;
        draw();
      } catch (err) { toast(err.message, 'err'); create.disabled = false; }
    });

    mount.append(
      el('div.page-head', {}, el('div', {}, el('h1', { text: t('dev.tribes') }))),
      el('div.card', {},
        el('div.field', {}, el('label', { for: 'nt-name', text: t('dev.tribe_name') }), name),
        el('div.field', {},
          el('label', { for: 'nt-slug', text: t('dev.tribe_slug') }),
          slug,
          el('span.hint', { text: 'a–z, 0–9, -' })
        ),
        create
      ),
      el('div.section-title', {}, t('dev.tribes'), el('span.c', { text: tribes.length })),
      el('div.list', {},
        ...tribes.map((tr) =>
          el('div.row', {},
            el('div.grow', {},
              el('div.rt', { text: tr.name }),
              el('div.rs', { text: tr.slug })
            ),
            el('span.badge.' + (tr.is_active ? 'b-completed' : 'b-cancelled'), {
              text: tr.is_active ? t('dev.active') : t('dev.inactive'),
            }),
            el('button.btn.sm', {
              text: tr.is_active ? t('dev.deactivate') : t('dev.activate'),
              onclick: async () => {
                try {
                  await api.updateTribe(tr.id, { isActive: !tr.is_active });
                  tribes = (await api.tribes()).tribes;
                  draw();
                } catch (err) { toast(err.message, 'err'); }
              },
            })
          )
        )
      )
    );
  }

  draw();
}

const ASSIGNABLE_ROLES = ['member', 'breeder_crafter', 'admin', 'developer'];

export async function renderUsers(mount, ctx) {
  mount.append(spinner());
  let users = (await api.allUsers()).users;
  const tribes = (await api.tribes()).tribes;
  const tribeName = (id) => tribes.find((tr) => tr.id === id)?.name || '—';

  const mailResultBox = el('div', { style: 'margin-bottom:16px' });
  const testMailBtn = el('button.btn', {
    text: t('dev.test_mail'),
    onclick: async () => {
      testMailBtn.disabled = true;
      mailResultBox.replaceChildren(spinner());
      try {
        const { result, configured, durationMs } = await api.testMail();
        const ok = result.sent;
        mailResultBox.replaceChildren(
          el('div.card', { style: `border-color:${ok ? 'var(--st-issued)' : 'var(--st-unavailable)'}` },
            el('div', { style: 'font-weight:700;margin-bottom:6px', text: ok ? '✅ ' + t('dev.test_mail_ok') : '❌ ' + t('dev.test_mail_fail') }),
            el('div.hint', { text: `SMTP_HOST: ${configured.smtpHost || '(nicht gesetzt)'} · Port: ${configured.smtpPort} · An: ${configured.adminNotificationEmail || '(nicht gesetzt)'} · ${durationMs}ms` }),
            !ok ? el('div', { style: 'margin-top:6px;color:var(--st-unavailable);font-size:.88rem', text: result.reason }) : null
          )
        );
      } catch (err) {
        mailResultBox.replaceChildren(el('div.card', {}, el('div', { text: '❌ ' + err.message })));
      } finally {
        testMailBtn.disabled = false;
      }
    },
  });

  function draw() {
    mount.replaceChildren();
    mount.append(el('div.page-head', {}, el('div', {},
      el('h1', { text: t('dev.users') }),
      el('p', { text: `${users.length}` })
    )));
    mount.append(el('div.card', {}, el('div', { style: 'margin-bottom:10px', text: t('dev.test_mail_hint') }), testMailBtn));
    mount.append(mailResultBox);

    mount.append(el('div.list', {},
      ...users.map((u) => {
        const roleButtons = ASSIGNABLE_ROLES.map((r) =>
          el('button.btn.sm' + (u.roles.includes(r) ? '.primary' : ''), {
            text: t('role.' + r),
            onclick: async (e) => {
              e.target.disabled = true;
              const next = u.roles.includes(r) ? u.roles.filter((x) => x !== r) : [...u.roles, r];
              if (next.length === 0) next.push('member');
              try {
                await api.setRoles(u.id, next);
                toast(t('dev.roles_saved'));
                users = (await api.allUsers()).users;
                draw();
              } catch (err) { toast(err.message, 'err'); e.target.disabled = false; }
            },
          })
        );

        return el('div.card', {},
          el('div', { style: 'display:flex;gap:10px;align-items:baseline;flex-wrap:wrap;margin-bottom:9px' },
            el('div', { style: 'font-family:var(--ff-display);font-weight:700;font-size:1.05rem', text: u.username }),
            el('span', { style: 'color:var(--muted);font-size:.84rem', text: tribeName(u.tribe_id) }),
            el('span.badge.' + (u.status === 'active' ? 'b-completed' : 'b-pending'), { text: t('ustatus.' + u.status) })
          ),
          el('div.chips', {}, ...roleButtons,
            el('button.btn.sm.danger', {
              text: t('dev.delete_user'),
              onclick: async () => {
                const ok = await confirmDialog({ title: t('dev.delete_user_confirm', { name: u.username }), danger: true });
                if (!ok) return;
                try {
                  await api.deleteUser(u.id);
                  toast(t('dev.user_deleted'));
                  users = (await api.allUsers()).users;
                  draw();
                } catch (err) { toast(err.message, 'err'); }
              },
            })
          )
        );
      })
    ));
  }

  draw();
}

export async function renderCatalog(mount) {
  mount.append(spinner());
  const [{ items }, { categories }] = await Promise.all([api.items(), api.categories()]);

  let filterCat = null;
  let query = '';
  let onlyMissingImage = false;

  const listBox = el('div.list');
  const search = el('input', { type: 'search', placeholder: t('common.search') });

  function drawList() {
    const filtered = items.filter(
      (i) =>
        (!filterCat || i.category_id === filterCat) &&
        (!query || i.name.toLowerCase().includes(query.toLowerCase())) &&
        (!onlyMissingImage || !i.image_path)
    );
    const LIMIT = 60;
    listBox.replaceChildren(
      ...filtered.slice(0, LIMIT).map((i) => {
        const thumb = i.image_path
          ? el('img', { src: '/uploads/' + i.image_path + '?v=' + (i._v || 0), alt: '', style: 'width:34px;height:34px;object-fit:cover;border-radius:6px;flex:0 0 34px' })
          : el('span.icon-box', { style: 'width:34px;height:34px;flex:0 0 34px' }, iconFuerItem(i));

        const fileInput = el('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp', style: 'display:none' });
        fileInput.addEventListener('change', async () => {
          const file = fileInput.files[0];
          if (!file) return;
          try {
            const base64 = await fileToBase64(file);
            const res = await api.uploadItemImage(i.id, { imageBase64: base64, mimeType: file.type });
            i.image_path = res.imagePath;
            i._v = Date.now();
            toast(t('dev.image_saved'));
            drawList();
          } catch (err) { toast(err.message, 'err'); }
        });

        return el('div.row', {},
          thumb,
          el('div.grow', {}, el('div.rt', { text: i.name }), el('div.rs', { text: i.key })),
          el('span.type-tag.t-' + i.product_type, { text: t('type.' + i.product_type) }),
          el('button.btn.sm', { text: i.image_path ? t('dev.image_replace') : t('dev.image_add'), onclick: () => fileInput.click() }),
          fileInput
        );
      }),
      filtered.length > LIMIT
        ? el('p.hint', { style: 'padding:10px 2px', text: `${LIMIT} / ${filtered.length} – ${t('common.search')} nutzen, um einzugrenzen.` })
        : null
    );
  }

  search.addEventListener('input', () => { query = search.value.trim(); drawList(); });

  mount.replaceChildren();
  mount.append(
    el('div.page-head', {}, el('div', {},
      el('h1', { text: t('dev.catalog') }),
      el('p', { text: t('dev.catalog_sub', { n: items.length }) })
    )),
    el('div.card', {}, search,
      el('div.chips', { style: 'margin-top:12px' },
        el('button.btn.sm', {
          text: t('dev.only_missing_image'),
          onclick: (e) => {
            onlyMissingImage = !onlyMissingImage;
            e.target.classList.toggle('primary', onlyMissingImage);
            drawList();
          },
        }),
        el('button.btn.sm.primary', {
          text: t('filter.all'),
          onclick: (e) => {
            filterCat = null;
            [...e.target.parentElement.children].forEach((b) => b.classList.remove('primary'));
            e.target.classList.add('primary');
            onlyMissingImage = false;
            drawList();
          },
        }),
        ...categories.map((c) =>
          el('button.btn.sm', {
            text: c.name,
            onclick: (e) => {
              filterCat = c.id;
              [...e.target.parentElement.children].forEach((b) => b.classList.remove('primary'));
              e.target.classList.add('primary');
              drawList();
            },
          })
        )
      )
    ),
    el('div', { style: 'margin-top:16px' }, listBox)
  );
  drawList();
}

/* ========================================================================== */
/* News-Verwaltung (Admin)                                                    */
/* ========================================================================== */

export async function renderNews(mount) {
  mount.append(spinner());
  let news;
  try {
    news = (await api.adminNews()).news;
  } catch (err) {
    mount.replaceChildren(emptyState(err.message));
    return;
  }

  const bodyInput = el('textarea', { maxlength: '280', placeholder: t('news.body_ph') });
  const bodyCount = el('span.hint', { text: '0 / 280' });
  bodyInput.addEventListener('input', () => { bodyCount.textContent = `${bodyInput.value.length} / 280`; });
  let priority = 'normal';
  const prioSeg = el('div.seg', {},
    ...['normal', 'high', 'urgent'].map((p) =>
      el('button' + (p === 'normal' ? '.on' : ''), {
        type: 'button',
        text: t('prio.' + p),
        onclick: (e) => { priority = p; [...prioSeg.children].forEach((b) => b.classList.remove('on')); e.target.classList.add('on'); },
      })
    )
  );
  const createBtn = el('button.btn.primary', { text: t('news.create') });

  async function reload() {
    news = (await api.adminNews()).news;
    draw();
  }

  createBtn.addEventListener('click', async () => {
    if (!bodyInput.value.trim()) return;
    createBtn.disabled = true;
    try {
      await api.createNews({ body: bodyInput.value.trim(), priority });
      toast(t('news.created'));
      bodyInput.value = '';
      bodyCount.textContent = '0 / 280';
      priority = 'normal';
      [...prioSeg.children].forEach((b, i) => b.classList.toggle('on', i === 0));
      await reload();
    } catch (err) { toast(err.message, 'err'); }
    finally { createBtn.disabled = false; }
  });

  function draw() {
    mount.replaceChildren();
    mount.append(
      el('div.page-head', {}, el('div', {}, el('h1', { text: t('news.title') }))),
      el('div.card', {},
        bodyInput, bodyCount,
        el('div', { style: 'margin:12px 0' }, el('div.hint', { text: t('news.priority') }), prioSeg),
        createBtn
      ),
      el('div.section-title', {}, t('news.title'), el('span.c', { text: news.length }))
    );

    if (!news.length) {
      mount.append(emptyState(t('news.none')));
      return;
    }

    mount.append(
      el('div.list', {},
        ...news.map((n) =>
          el('div.row', {},
            el('div.grow', {},
              el('div.rt', { text: n.body }),
              el('div.rs', {}, priorityBadgeFor(n.priority), ' · ', timeAgo(n.created_at))
            ),
            el('span.badge.' + (n.is_active ? 'b-completed' : 'b-cancelled'), { text: n.is_active ? t('news.active') : t('news.inactive') }),
            el('button.btn.sm', {
              text: n.is_active ? t('news.deactivate') : t('news.activate'),
              onclick: async () => {
                try { await api.updateNews(n.id, { isActive: !n.is_active }); toast(t('news.updated')); await reload(); }
                catch (err) { toast(err.message, 'err'); }
              },
            }),
            el('button.btn.sm.danger', {
              text: '✕',
              'aria-label': t('common.cancel'),
              onclick: async () => {
                const ok = await confirmDialog({ title: t('news.delete_confirm'), danger: true });
                if (!ok) return;
                try { await api.deleteNews(n.id); toast(t('news.deleted')); await reload(); }
                catch (err) { toast(err.message, 'err'); }
              },
            })
          )
        )
      )
    );
  }

  function priorityBadgeFor(p) {
    if (p === 'normal') return el('span', { text: t('prio.normal') });
    return el('span.badge.b-' + p, { text: t('prio.' + p) });
  }

  draw();
}
