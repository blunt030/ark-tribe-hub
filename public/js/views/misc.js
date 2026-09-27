import { el, spinner, emptyState, toast, confirmDialog, fileToBase64, pageHead, pill, avatar, avatarSrc, kebabMenu, tabBar, panel as arkPanel, emptyBlock, visibleRoles } from '../ui.js';
import { t, timeAgo, fmtDate, LANGS, getLang, setLang } from '../i18n.js';
import { api } from '../api.js';
import { uiIcon } from '../ui-icons.js';

function notifIcon(type) {
  if (type.startsWith('task')) return 'check-square';
  if (type.startsWith('member')) return 'users';
  if (type.startsWith('item')) return 'package';
  if (type === 'new_comment') return 'chat-circle-dots';
  return 'clipboard-text';
}

/* ========================================================================== */
/* Mitteilungen                                                               */
/* ========================================================================== */

export async function renderNotifications(mount, ctx) {
  const { go, refreshBadges } = ctx;
  mount.classList.add('notifications-page');
  mount.append(spinner());

  const { notifications } = await api.notifications();
  const unread = notifications.filter((n) => !n.is_read).length;

  const target = (n) => n.payload?.orderId ? '/orders/' + n.payload.orderId : n.payload?.taskId ? '/tasks/' + n.payload.taskId : null;

  mount.replaceChildren(
    pageHead({
      title: t('notif.title'), sub: t('page.notifications.sub'), icon: 'bell',
      extra: unread ? el('div.banner-row', {}, pill(t('notif.unread_n', { n: unread }), 'open', 'bell')) : null,
      actions: [
        unread ? el('button.btn.sm', { type: 'button', onclick: async (e) => {
          e.currentTarget.disabled = true;
          await api.markAllRead();
          await refreshBadges();
          go('/notifications', true);
        } }, uiIcon('check-circle'), el('span', { text: t('notif.read_all') })) : null,
        notifications.some((n) => n.is_read) ? el('button.btn.sm.ghost', { type: 'button', onclick: async (e) => {
          e.currentTarget.disabled = true;
          await api.clearReadNotifications();
          await refreshBadges();
          go('/notifications', true);
        } }, uiIcon('trash'), el('span', { text: t('notif.clear_read') })) : null,
      ],
    }),
    notifications.length
      ? arkPanel({ title: t('notif.title'), icon: 'bell', count: notifications.length },
          el('div.notif-list', {},
            ...notifications.map((n) => {
              const path = target(n);
              return el('div.notif-row' + (n.is_read ? '' : '.is-unread'), {},
                el('span.notif-icon', {}, uiIcon(notifIcon(n.type))),
                el('div.notif-copy', {},
                  el('b', { text: t('n.' + n.type) }),
                  el('small', { text: [n.payload?.title, timeAgo(n.created_at)].filter(Boolean).join(' · ') })),
                el('div.notif-actions', {},
                  path ? el('button.btn.sm', { type: 'button', onclick: async () => {
                    if (!n.is_read) { await api.markRead(n.id); await refreshBadges(); }
                    go(path);
                  } }, el('span', { text: t('notif.open') }), uiIcon('arrow-right')) : null,
                  el('button.icon-btn.is-danger', { type: 'button', title: t('common.delete'), 'aria-label': t('common.delete'), onclick: async () => {
                    try {
                      await api.deleteNotification(n.id);
                      await refreshBadges();
                      go('/notifications', true);
                    } catch (err) { toast(err.message, 'err'); }
                  } }, uiIcon('x'))));
            })))
      : emptyBlock('bell', t('notif.none')),
    // Die Einstellungen, welche Mitteilungen man erhaelt, liegen im Profil.
    el('p.page-foot-note', {}, t('notif.settings_moved'), ' ', el('a', { href: '#/profile', text: t('nav.profile') }))
  );
}

/* ========================================================================== */
/* Profil                                                                     */
/* ========================================================================== */

export async function renderProfile(mount, ctx) {
  mount.classList.add('profile-page');
  const { user, onSignOut, reloadUser, go } = ctx;
  mount.append(spinner());

  // Kennzahlen einzeln abgesichert: Developer-Konten haben keinen Tribe,
  // Aufgaben und Bestand antworten dort mit Fehlern.
  const [{ user: me }, tribe, { preferences }, ordersRes, tasksRes, dinosRes, notifRes, vaultRes, pinRes, twoFaRes] = await Promise.all([
    api.profile(),
    api.myTribe().catch(() => null),
    api.notifPrefs(),
    api.orders('all').catch(() => ({ orders: [] })),
    api.tasks().catch(() => ({ tasks: [] })),
    api.dinos().catch(() => ({ dinos: [] })),
    api.notifications().catch(() => ({ notifications: [] })),
    user.tribeId ? api.vaults().catch(() => ({ vaults: [] })) : Promise.resolve({ vaults: [] }),
    api.accessPin().catch(() => ({ pinSet: false })),
    api.twoFactor().catch(() => ({ enabled: false, recommended: false })),
  ]);
  const isAdminUser = user.roles.includes('admin') || user.roles.includes('developer');
  const myVaults = vaultRes.vaults.filter((v) => Number(v.assigned_user_id) === Number(me.id));

  const meineBestellungen = ordersRes.orders.filter((o) => o.member_id === me.id).length;
  const meineAufgaben = tasksRes.tasks.filter((tk) => tk.assignee_id === me.id && !['done', 'cancelled'].includes(tk.status)).length;
  const tierStatEintraege = dinosRes.dinos.length;
  const mitteilungen = notifRes.notifications.length;

  /* ---------------------------------------------------- Profil bearbeiten */
  const server = el('input', { type: 'text', value: me.server || '', id: 'p-server', maxlength: 100 });
  const map = el('input', { type: 'text', value: me.map || '', id: 'p-map', maxlength: 100 });
  const saveBtn = el('button.btn.primary.lux.block', { type: 'button' }, uiIcon('floppy-disk'), el('span', { text: t('profile.save') }));
  saveBtn.addEventListener('click', async () => {
    saveBtn.disabled = true;
    try {
      await api.updateProfile({ server: server.value.trim(), map: map.value.trim() });
      toast(t('profile.saved'));
    } catch (err) { toast(err.message, 'err'); }
    finally { saveBtn.disabled = false; }
  });

  const avatarSlot = el('span.profile-avatar-slot', {}, avatar(me.username, { size: 'xl', src: avatarSrc(me) }));
  const fileInput = el('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp', hidden: true });
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files[0];
    if (!file) return;
    try {
      const base64 = await fileToBase64(file);
      const res = await api.uploadAvatar({ imageBase64: base64, mimeType: file.type });
      avatarSlot.replaceChildren(avatar(me.username, { size: 'xl', src: '/uploads/' + res.avatarPath + '?v=' + Date.now() }));
      toast(t('profile.saved'));
      await reloadUser();
    } catch (err) { toast(err.message, 'err'); }
  });

  const editPanel = el('div.profile-form', {},
    el('div.setting-row', {}, uiIcon('hard-drives'), el('label', { for: 'p-server', text: t('profile.server') }), server),
    el('div.setting-row', {}, uiIcon('map'), el('label', { for: 'p-map', text: t('profile.map') }), map),
    el('p.profile-form-note', { text: t('profile.visibility') }),
    saveBtn
  );

  /* ------------------------------------------------------ Passwort, E-Mail */
  const pwCurrentInput = el('input', { type: 'password', autocomplete: 'current-password', id: 'pw-cur' });
  const pwNewInput = el('input', { type: 'password', autocomplete: 'new-password', id: 'pw-new' });
  const pwRepeatInput = el('input', { type: 'password', autocomplete: 'new-password', id: 'pw-rep' });
  const pwSaveBtn = el('button.btn.primary', { type: 'button', text: t('pw.save') });
  pwSaveBtn.addEventListener('click', async () => {
    if (pwNewInput.value !== pwRepeatInput.value) { toast(t('pw.mismatch'), 'err'); return; }
    if (pwNewInput.value.length < 10) { toast(t('pw.too_short'), 'err'); return; }
    pwSaveBtn.disabled = true;
    try {
      await api.changePassword({ currentPassword: pwCurrentInput.value, newPassword: pwNewInput.value });
      pwCurrentInput.value = pwNewInput.value = pwRepeatInput.value = '';
      toast(t('pw.changed'));
    } catch (err) { toast(err.message, 'err'); }
    finally { pwSaveBtn.disabled = false; }
  });

  // E-Mail-Wechsel: Das Backend setzt den Bestaetigungsstatus zurueck und
  // verschickt eine neue Bestaetigungsmail.
  const emailInput = el('input', { type: 'email', value: me.email || '', id: 'p-email', autocomplete: 'email' });
  const emailPassword = el('input', { type: 'password', id: 'p-email-password', autocomplete: 'current-password' });
  const emailSaveBtn = el('button.btn.primary', { type: 'button', text: t('profile.save') });
  emailSaveBtn.addEventListener('click', async () => {
    emailSaveBtn.disabled = true;
    try {
      const res = await api.updateProfile({ email: emailInput.value.trim(), currentPassword: emailPassword.value });
      emailPassword.value = '';
      toast(t('profile.email_saved'));
      if (res?.user) setzeSicherheitszustand(res.user.emailVerified);
    } catch (err) { toast(err.message, 'err'); }
    finally { emailSaveBtn.disabled = false; }
  });

  const pwPanel = el('div.disclosure-body', {},
    el('p.hint', { style: 'margin:0 0 10px', text: t('pw.hint') }),
    el('div.field', {}, el('label', { for: 'pw-cur', text: t('pw.current') }), pwCurrentInput),
    el('div.field', {}, el('label', { for: 'pw-new', text: t('pw.new') }), pwNewInput),
    el('div.field', {}, el('label', { for: 'pw-rep', text: t('pw.repeat') }), pwRepeatInput),
    pwSaveBtn);
  const emailPanel = el('div.disclosure-body', {},
    el('div.field', {}, el('label', { for: 'p-email', text: t('profile.email') }), emailInput),
    el('div.field', {}, el('label', { for: 'p-email-password', text: t('pw.current') }), emailPassword),
    emailSaveBtn);
  const disclosure = (title, icon, content) => el('details.disclosure', {},
    el('summary', {}, uiIcon(icon), el('span', { text: title }), uiIcon('caret-right', 'caret')), content);

  const secState = el('span.sec-pill');
  const secLabel = el('span');
  function setzeSicherheitszustand(verified) {
    secLabel.textContent = verified ? t('profile.email_verified') : t('profile.email_unverified');
    secState.replaceChildren(pill(verified ? '✓' : '!', verified ? 'done' : 'high'));
  }
  setzeSicherheitszustand(Boolean(me.emailVerified));

  /* ------------------------------------------------------ Vault und PIN */
  // Den 4-stelligen PIN legt nur das Mitglied selbst fest. Anzeigen, Aendern
  // und Erzeugen verlangen jeweils das aktuelle Passwort - eine offene Sitzung
  // an einem fremden PC reicht dafuer nicht aus. Admins sehen den PIN nicht.
  let pinSet = Boolean(pinRes.pinSet);
  let pinVisible = false;
  const pinInput = el('input.pin-input', { type: 'password', id: 'vault-pin', inputmode: 'numeric', pattern: '[0-9]{4}', maxlength: '4', autocomplete: 'off', placeholder: pinSet ? '••••' : '----', 'aria-label': t('vault.pin') });
  pinInput.addEventListener('input', () => { pinInput.value = pinInput.value.replace(/\D/g, '').slice(0, 4); });
  const pinPassword = el('input', { type: 'password', id: 'vault-pin-pw', autocomplete: 'current-password', placeholder: t('vault.pw_placeholder'), 'aria-label': t('pw.current') });
  const needPassword = () => {
    if (pinPassword.value) return pinPassword.value;
    toast(t('vault.pw_required'), 'err');
    pinPassword.focus();
    return null;
  };
  const pinState = el('span.hint');
  const drawPinState = () => { pinState.textContent = pinSet ? t('vault.pin_set') : t('vault.pin_none'); };
  drawPinState();
  const eyeBtn = el('button.icon-btn', { type: 'button', title: t('vault.pin_show'), 'aria-label': t('vault.pin_show'), 'aria-pressed': 'false' }, uiIcon('eye'));
  eyeBtn.addEventListener('click', async () => {
    if (pinVisible) {
      pinVisible = false; pinInput.type = 'password'; pinInput.value = '';
      eyeBtn.setAttribute('aria-pressed', 'false'); eyeBtn.replaceChildren(uiIcon('eye'));
      return;
    }
    if (!pinSet) { toast(t('vault.pin_none'), 'err'); return; }
    const pw = needPassword(); if (!pw) return;
    eyeBtn.disabled = true;
    try {
      const { pin } = await api.revealAccessPin(pw);
      pinInput.value = pin || ''; pinInput.type = 'text'; pinVisible = true;
      eyeBtn.setAttribute('aria-pressed', 'true'); eyeBtn.replaceChildren(uiIcon('eye-slash'));
      pinPassword.value = '';
      // Nach 30 Sekunden automatisch wieder verbergen.
      setTimeout(() => { if (pinVisible) eyeBtn.click(); }, 30000);
    } catch (err) { toast(err.message, 'err'); }
    finally { eyeBtn.disabled = false; }
  });
  const pinStatus = el('span.hint', { role: 'status' });
  const pinSave = el('button.btn.primary.lux', { type: 'button' }, uiIcon('floppy-disk'), el('span', { text: t('vault.pin_save') }));
  pinSave.addEventListener('click', async () => {
    if (!/^\d{4}$/.test(pinInput.value)) { toast(t('vault.pin_invalid'), 'err'); return; }
    const pw = needPassword(); if (!pw) return;
    pinSave.disabled = true;
    try { await api.setAccessPin(pinInput.value, pw); pinSet = true; drawPinState(); pinPassword.value = ''; toast(t('vault.pin_saved')); pinStatus.textContent = ''; }
    catch (err) { toast(err.message, 'err'); }
    finally { pinSave.disabled = false; }
  });
  const pinGen = el('button.btn', { type: 'button' }, uiIcon('shuffle'), el('span', { text: t('vault.pin_generate') }));
  pinGen.addEventListener('click', async () => {
    const pw = needPassword(); if (!pw) return;
    pinGen.disabled = true;
    try {
      const result = await api.generateAccessPin(pw);
      pinSet = true; drawPinState(); pinPassword.value = '';
      pinInput.value = result.pin; pinInput.type = 'text'; pinVisible = true;
      eyeBtn.setAttribute('aria-pressed', 'true'); eyeBtn.replaceChildren(uiIcon('eye-slash'));
      pinStatus.textContent = t('vault.pin_generated', { pin: result.pin });
      toast(t('vault.pin_saved'));
    } catch (err) { toast(err.message, 'err'); }
    finally { pinGen.disabled = false; }
  });
  const vaultPanel = el('div.vault-profile', {},
    el('div.vault-chips', {}, ...(myVaults.length
      ? myVaults.map((v) => el('div.vault-chip', {}, uiIcon('duo-vault', 'vault-chip-icon'),
          el('span', {}, el('b', { text: v.name }), v.note ? el('small', { text: v.note }) : null)))
      : [el('p.chosen-empty', {}, uiIcon('vault'), el('span', { text: t('vault.none') }))])),
    el('label.setting-label', { for: 'vault-pin', text: t('vault.pin') }),
    el('div.pin-row', {}, pinInput, eyeBtn, pinState),
    el('label.setting-label', { for: 'vault-pin-pw', text: t('pw.current') }),
    el('div.pin-row', {}, pinPassword),
    el('div.pin-row-2', {}, pinSave, pinGen),
    pinStatus,
    el('p.profile-form-note', { text: t('vault.pin_hint') }),
    isAdminUser ? el('button.ark-panel-link', { type: 'button', onclick: () => { try { sessionStorage.setItem('ath_members_mode', 'access'); } catch { /* optional */ } go('/members'); } },
      el('span', { text: t('vault.title') + ' · ' + t('members.access') }), uiIcon('arrow-right')) : null);

  /* ------------------------------------------ Zwei-Faktor-Anmeldung */
  const twoFaBox = el('div.twofa');
  function drawTwoFa(enabled) {
    const pwField = el('input', { type: 'password', autocomplete: 'current-password', placeholder: t('pw.current'), 'aria-label': t('pw.current') });
    if (enabled) {
      const codeField = el('input', { type: 'text', inputmode: 'numeric', maxlength: '6', autocomplete: 'one-time-code', placeholder: t('mfa.code'), 'aria-label': t('mfa.code') });
      twoFaBox.replaceChildren(
        el('div.sec-status', {}, uiIcon('shield-check'), el('span', { text: t('mfa.active') }), pill('✓', 'done')),
        el('details.disclosure', {}, el('summary', {}, uiIcon('x-circle'), el('span', { text: t('mfa.disable') }), uiIcon('caret-right', 'caret')),
          el('div.disclosure-body', {}, el('div.field', {}, pwField), el('div.field', {}, codeField),
            el('button.btn.danger', { type: 'button', onclick: async (e) => {
              e.currentTarget.disabled = true;
              try { await api.twoFactorDisable(pwField.value, codeField.value.trim()); toast(t('mfa.disabled')); drawTwoFa(false); }
              catch (err) { toast(err.message, 'err'); e.currentTarget.disabled = false; }
            } }, el('span', { text: t('mfa.disable') })))));
      return;
    }
    const startBtn = el('button.btn.primary.lux', { type: 'button' }, uiIcon('shield-check'), el('span', { text: t('mfa.setup') }));
    startBtn.addEventListener('click', async () => {
      startBtn.disabled = true;
      try {
        const setup = await api.twoFactorSetup(pwField.value);
        const codeField = el('input', { type: 'text', inputmode: 'numeric', maxlength: '6', autocomplete: 'one-time-code', placeholder: '123456', 'aria-label': t('mfa.code'), style: 'max-width:180px;text-align:center;letter-spacing:.3em' });
        const qr = el('img.twofa-qr', { src: 'data:image/svg+xml;base64,' + btoa(setup.qrSvg), alt: t('mfa.qr_alt') });
        twoFaBox.replaceChildren(
          el('ol.twofa-steps', {},
            el('li', { text: t('mfa.step1') }),
            el('li', { text: t('mfa.step2') }),
            el('li', { text: t('mfa.step3') })),
          el('div.twofa-setup', {}, qr,
            el('div', {},
              el('p.hint', { text: t('mfa.manual') }),
              el('code.twofa-secret', { text: setup.secret.replace(/(.{4})/g, '$1 ').trim() }),
              el('a.btn.sm', { href: setup.otpauthUrl, style: 'margin-top:8px' }, el('span', { text: t('mfa.open_app') })))),
          el('div.pin-row', {}, codeField,
            el('button.btn.primary', { type: 'button', onclick: async (e) => {
              e.currentTarget.disabled = true;
              try { await api.twoFactorEnable(codeField.value.trim()); toast(t('mfa.enabled')); drawTwoFa(true); }
              catch (err) { toast(err.message, 'err'); e.currentTarget.disabled = false; }
            } }, el('span', { text: t('mfa.confirm') }))));
        codeField.focus();
      } catch (err) { toast(err.message, 'err'); startBtn.disabled = false; }
    });
    twoFaBox.replaceChildren(...[
      twoFaRes.recommended ? el('div.notice.note', { text: t('mfa.recommended') }) : null,
      el('p.profile-form-note', { text: t('mfa.intro') }),
      el('div.pin-row', {}, pwField, startBtn)].filter(Boolean));
  }
  drawTwoFa(Boolean(twoFaRes.enabled));

  /* ------------------------------------------------ Benachrichtigungen */
  const prefChanged = new Map();
  const prefSaveBtn = el('button.btn.primary.sm', { type: 'button', text: t('profile.save'), disabled: true });
  const prefBoxes = [];
  const prefPanel = el('div.pref-list', {},
    ...preferences.map((p) => {
      const box = el('input', { type: 'checkbox', id: 'p-' + p.type, role: 'switch' });
      box.checked = p.enabled;
      box.addEventListener('change', () => { prefChanged.set(p.type, box.checked); prefSaveBtn.disabled = false; });
      prefBoxes.push(box);
      return el('label.pref-row', { for: 'p-' + p.type },
        uiIcon(notifIcon(p.type)),
        el('span.pref-copy', {}, el('b', { text: t('n.' + p.type) })),
        el('span.switch', {}, box, el('span', { 'aria-hidden': 'true' })));
    }));
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

  const langSelect = el('select', { 'aria-label': t('profile.language'), onchange: (e) => { setLang(e.target.value); location.reload(); } },
    ...LANGS.map((l) => el('option', { value: l.code, text: l.label, selected: getLang() === l.code })));

  const letzteMeldungen = notifRes.notifications.slice(0, 5);
  const roleTone = (r) => r === 'admin' ? 'admin' : ['breeder', 'breeder_crafter'].includes(r) ? 'breeder' : r === 'crafter' ? 'crafter' : r === 'developer' ? 'dev' : 'role';

  mount.replaceChildren(
    el('section.profile-hero', {},
      el('div.profile-avatar-wrap', {}, avatarSlot,
        el('button.profile-avatar-edit', { type: 'button', title: t('profile.change_image'), 'aria-label': t('profile.change_image'), onclick: () => fileInput.click() }, uiIcon('pencil-simple'))),
      el('div.profile-id', {},
        el('h1', { text: me.username }),
        el('div.profile-id-meta', {}, ...visibleRoles(me.roles).map((r) => pill(t('role.' + r), roleTone(r)))),
        el('div.profile-id-meta', {}, uiIcon('users'), el('span', { text: tribe?.tribe?.name || t('nav.group.platform') }))),
      el('div.profile-hero-action', {},
        el('button.btn.primary.lux', { type: 'button', onclick: () => fileInput.click() }, uiIcon('image'), el('span', { text: t('profile.change_image') })),
        fileInput)),
    el('div.profile-grid', {},
      el('div.profile-col', {},
        profileSection(t('profile.settings'), 'user', editPanel),
        user.tribeId ? profileSection(t('vault.my'), 'vault', vaultPanel) : null,
        profileSection(t('profile.overview'), 'chart-bar', el('div.profile-tiles', {},
          uebersichtKachel(meineBestellungen, t('profile.cnt.orders')),
          uebersichtKachel(meineAufgaben, t('profile.cnt.tasks')),
          uebersichtKachel(tierStatEintraege, t('nav.animal_stats')),
          uebersichtKachel(mitteilungen, t('profile.cnt.notifications')))),
        profileSection(t('profile.notifications'), 'bell', el('div', {},
          letzteMeldungen.length
            ? el('div.feed-list', {}, ...letzteMeldungen.map((n) => el('div.feed-row' + (n.is_read ? '' : '.unread'), {},
                el('span.fi-dot'), el('span', { text: t('n.' + n.type) }), el('small', { text: timeAgo(n.created_at) }))))
            : el('p.hint', { text: t('profile.no_notifications') }),
          el('button.ark-panel-link', { type: 'button', onclick: () => go('/notifications'), style: 'margin-top:8px' }, el('span', { text: t('profile.show_all') }), uiIcon('arrow-right')))),
        adminLinks(user, go)),
      el('div.profile-col', {},
        profileSection(t('profile.security_settings'), 'shield-check', el('div', {},
          disclosure(t('pw.title'), 'key', pwPanel),
          disclosure(t('profile.email_change'), 'envelope', emailPanel),
          el('div.pref-head', {}, uiIcon('shield-check'), el('h3', { text: t('mfa.title') })),
          twoFaBox,
          el('div.sec-status', {}, uiIcon('envelope'), secLabel, secState),
          el('div.pref-head', {}, uiIcon('bell'), el('h3', { text: t('profile.notify_types') }),
            el('div.chips', {},
              el('button.chip', { type: 'button', text: t('notif.enable_all'), onclick: () => setAll(true) }),
              el('button.chip', { type: 'button', text: t('notif.disable_all'), onclick: () => setAll(false) }))),
          prefPanel,
          el('div.form-actions', {}, prefSaveBtn),
          el('div.lang-row', {}, uiIcon('globe'), el('span.setting-label', { text: t('profile.language') }), langSelect))),
        el('button.btn.danger.block', { type: 'button', onclick: onSignOut }, uiIcon('sign-out'), el('span', { text: t('auth.logout') }))))
  );
}

function profileSection(title, icon, content) {
  return arkPanel({ title, icon, className: 'profile-section' }, content);
}

function uebersichtKachel(n, label) {
  return el('div.profile-tile', {}, el('strong', { text: String(n) }), el('span', { text: label }));
}

/**
 * Verwaltungsbereiche als Links auf der Profilseite. Auf dem Desktop stehen sie
 * zusaetzlich in der Seitenleiste; auf dem Handy liegen sie im Mehr-Menue.
 */
function adminLinks(user, go) {
  const links = [];
  links.push(['/orders', t('nav.orders'), 'clipboard-text']);
  if (user.tribeId) {
    links.push(['/dinos', t('nav.animal_stats'), 'chart-bar'], ['/servers', t('nav.servers'), 'map'], ['/tasks', t('nav.tasks'), 'check-square'], ['/voice', t('nav.voice'), 'microphone']);
  }
  if (user.roles.includes('admin') || user.roles.includes('developer')) {
    links.push(['/members', t('nav.members'), 'users'], ['/news', t('nav.news'), 'newspaper'], ['/audit', t('nav.audit'), 'scroll']);
  }
  if (user.roles.includes('developer')) {
    links.push(['/tribes', t('nav.tribes'), 'users-three'], ['/users', t('nav.users'), 'users'], ['/catalog', t('nav.catalog'), 'squares-four']);
  }
  return profileSection(t('profile.more_areas'), 'squares-four', el('div.area-links', {},
    ...links.map(([path, label, icon]) => el('button.btn.sm', { type: 'button', onclick: () => go(path) }, uiIcon(icon), el('span', { text: label })))));
}

/* ========================================================================== */
/* Mitglieder                                                                 */
/* ========================================================================== */

const ROLE_TONE = { admin: 'admin', breeder: 'breeder', crafter: 'crafter', breeder_crafter: 'breeder', developer: 'dev', member: 'role' };
const ROLE_ICON = { admin: 'crown', breeder: 'leaf', crafter: 'wrench', breeder_crafter: 'leaf', developer: 'wrench' };
function rolePill(role) {
  return pill(t('role.' + role), ROLE_TONE[role] || 'role', ROLE_ICON[role] || null);
}

export async function renderMembers(mount, ctx) {
  const canManage = ctx.user.roles.includes('admin') || ctx.user.roles.includes('developer');
  let mode = 'overview';
  try { if (sessionStorage.getItem('ath_members_mode') === 'access' && canManage) mode = 'access'; sessionStorage.removeItem('ath_members_mode'); } catch { /* optional */ }
  mount.append(spinner());
  let members, vaults = [], presence = { online: [] };
  try {
    [members, vaults, presence] = await Promise.all([
      api.members().then((r) => r.members),
      canManage ? api.vaults().then((r) => r.vaults).catch(() => []) : Promise.resolve([]),
      api.presence().catch(() => ({ online: [] })),
    ]);
  } catch (err) {
    mount.replaceChildren(pageHead({ title: t('admin.members'), icon: 'users' }), emptyState(err.message));
    return;
  }
  let query = '';
  const online = () => new Set((presence.online || []).map(Number));

  function draw() {
    const pending = members.filter((m) => m.status === 'pending_approval');
    const active = members.filter((m) => m.status !== 'pending_approval');
    const on = online();
    const head = pageHead({
      title: t('admin.members'), sub: t('page.members.sub'), icon: 'users',
      extra: el('div.banner-row', {},
        pill(t('members.count', { n: active.length }), 'role', 'users'),
        pill(t('chat.online_n', { n: active.filter((m) => on.has(Number(m.id))).length }), 'done')),
    });
    const modeSwitch = canManage ? tabBar([
      { key: 'overview', label: t('members.overview') },
      { key: 'access', label: t('members.access'), count: vaults.length },
      ctx.user.tribeId ? { key: 'discord', label: 'Discord' } : null,
    ].filter(Boolean), mode, (key) => { mode = key; draw(); }) : null;

    if (mode === 'access') {
      mount.replaceChildren(head, el('div.task-toolbar', {}, modeSwitch), vaultManager(active));
      return;
    }
    if (mode === 'discord') {
      const box = el('div.discord-settings', {}, spinner());
      mount.replaceChildren(head, el('div.task-toolbar', {}, modeSwitch), box);
      discordSettings(box);
      return;
    }

    const groupsBox = el('div.member-groups');
    const noMatches = el('p.hint', { text: t('common.no_results'), hidden: true, role: 'status' });
    const drawGroups = () => {
      const q = query.trim().toLocaleLowerCase();
      const rows = active.filter((m) => !q || m.username.toLocaleLowerCase().includes(q)
        || visibleRoles(m.roles || []).some((r) => t('role.' + r).toLocaleLowerCase().includes(q)));
      // Jede Person steht in genau einer Gruppe: der hoechsten Rolle.
      const groupOf = (m) => {
        const r = m.roles || [];
        if (r.includes('admin') || r.includes('developer')) return 'admins';
        if (r.includes('breeder') || (r.includes('breeder_crafter') && !r.includes('crafter'))) return 'breeders';
        if (r.includes('crafter')) return 'crafters';
        return 'members_group';
      };
      const GROUPS = [['admins', 'crown', 'admin'], ['breeders', 'leaf', 'breeder'], ['crafters', 'wrench', 'crafter'], ['members_group', 'users', 'member']];
      groupsBox.replaceChildren(...GROUPS.map(([key, icon, tone]) => {
        const list = rows.filter((m) => groupOf(m) === key)
          .sort((a, b) => (on.has(Number(b.id)) - on.has(Number(a.id))) || a.username.localeCompare(b.username));
        if (!list.length) return null;
        return el('section.ark-panel.member-group.g-' + tone, {},
          el('header.ark-panel-head', {}, uiIcon(icon, 'ark-panel-icon'), el('h2', { text: t('members.' + key) }),
            el('span.member-group-online', { text: t('chat.online_n', { n: list.filter((m) => on.has(Number(m.id))).length }) }),
            el('span.ark-count', { text: String(list.length) })),
          el('div.member-list', {}, ...list.map(memberRow)));
      }).filter(Boolean));
      noMatches.hidden = rows.length !== 0;
    };
    const search = el('input', { type: 'search', value: query, placeholder: t('common.search'), 'aria-label': t('common.search'),
      oninput: (e) => { query = e.target.value; drawGroups(); } });

    mount.replaceChildren(...[
      head,
      el('div.task-toolbar', {}, modeSwitch || el('span'), el('div.search-field', {}, uiIcon('magnifying-glass'), search)),
      canManage && pending.length ? arkPanel({ title: t('admin.pending'), icon: 'warning', count: pending.length, className: 'pending-panel' },
        ...pending.map(pendingRow)) : null,
      groupsBox, noMatches,
    ].filter(Boolean));
    drawGroups();
  }

  async function reload() {
    [members, vaults] = await Promise.all([
      api.members().then((r) => r.members),
      canManage ? api.vaults().then((r) => r.vaults).catch(() => []) : Promise.resolve([]),
    ]);
    draw();
  }

  function pendingRow(m) {
    return el('div.pending-line', {},
      avatar(m.username, { src: avatarSrc(m) }),
      el('div.member-name', {}, el('strong', { text: m.username }), el('small', { text: timeAgo(m.created_at) })),
      el('div.chips', {},
        el('button.btn.sm.primary', {
          type: 'button',
          onclick: async (e) => {
            e.currentTarget.disabled = true;
            try { await api.approve(m.id); toast(t('admin.approved')); await reload(); }
            catch (err) { toast(err.message, 'err'); e.currentTarget.disabled = false; }
          },
        }, uiIcon('check-circle'), el('span', { text: t('admin.approve') })),
        el('button.btn.sm.danger', {
          type: 'button',
          onclick: async () => {
            const ok = await confirmDialog({ title: t('admin.reject') + ' – ' + m.username, danger: true });
            if (!ok) return;
            try { await api.reject(m.id); toast(t('admin.rejected')); await reload(); }
            catch (err) { toast(err.message, 'err'); }
          },
        }, uiIcon('x'), el('span', { text: t('admin.reject') }))));
  }

  function memberRow(m) {
    const roles = m.roles || [];
    const legacy = roles.includes('breeder_crafter') && !roles.includes('breeder') && !roles.includes('crafter');
    const isBreeder = roles.includes('breeder') || legacy;
    const isCrafter = roles.includes('crafter') || legacy;
    const istAdmin = roles.includes('admin');
    const isSelf = Number(m.id) === Number(ctx.user.id);
    const isOnline = online().has(Number(m.id));
    const memberVaults = vaults.filter((v) => Number(v.assigned_user_id) === Number(m.id));
    const run = (fn, ok) => async () => {
      try { await fn(); toast(ok); await reload(); }
      catch (err) { toast(err.message, 'err'); }
    };
    // Rollenaenderungen prueft der Server zusaetzlich (z. B. letzter Admin).
    const menu = canManage ? kebabMenu([
      { label: isBreeder && !legacy ? t('members.revoke_breeder') : t('members.grant_breeder'), icon: 'leaf', onclick: run(() => api.setRole(m.id, 'breeder', legacy ? true : !isBreeder), t('admin.role_saved')) },
      { label: isCrafter && !legacy ? t('members.revoke_crafter') : t('members.grant_crafter'), icon: 'wrench', onclick: run(() => api.setRole(m.id, 'crafter', legacy ? true : !isCrafter), t('admin.role_saved')) },
      { label: istAdmin ? t('members.revoke_admin') : t('members.grant_admin'), icon: 'crown', onclick: run(() => api.setTribeAdmin(m.id, !istAdmin), t('admin.role_saved')) },
      m.status === 'active' && !isSelf ? { label: t('admin.disable'), icon: 'x-circle', danger: true, onclick: async () => {
        const ok = await confirmDialog({ title: t('admin.disable') + ' – ' + m.username, danger: true });
        if (!ok) return;
        try { await api.disableMember(m.id); toast(t('admin.disabled')); await reload(); }
        catch (err) { toast(err.message, 'err'); }
      } } : null,
    ], t('members.more')) : null;
    return el('article.member-line' + (isSelf ? '.is-self' : '') + (isOnline ? '.is-online' : ''), {},
      avatar(m.username, { src: avatarSrc(m), online: isOnline }),
      el('div.member-name', {}, el('strong', { text: m.username }),
        el('small', {}, el('span.presence-label' + (isOnline ? '.on' : ''), { text: isOnline ? t('members.online') : t('members.offline') }),
          isSelf ? ' · ' + t('members.you') : canManage && m.created_at ? ' · ' + t('members.joined', { date: fmtDate(m.created_at) }) : '')),
      el('div.member-roles', {},
        ...visibleRoles(roles).filter((r) => r !== 'member' || roles.length === 1).map(rolePill),
        legacy && canManage ? el('span.legacy-hint', { title: t('members.legacy_role') }, uiIcon('info')) : null),
      el('span.member-meta', {}, canManage && memberVaults.length
        ? el('span.vault-tag', {}, uiIcon('vault'), el('span', { text: memberVaults.map((v) => v.name).join(', ') })) : null,
        canManage && m.status && m.status !== 'active' ? pill(t('ustatus.' + m.status), 'muted') : null),
      menu || el('span'));
  }

  // Discord: je ein Webhook fuer Breeder- und Crafter-Bestellungen. Die
  // gespeicherte Adresse wird nie wieder angezeigt, nur ob sie gesetzt ist.
  async function discordSettings(box) {
    let info;
    try { info = await api.discordSettings(); }
    catch (err) { box.replaceChildren(emptyState(err.message)); return; }
    const card = (target, icon, tone) => {
      const input = el('input', { type: 'url', placeholder: 'https://discord.com/api/webhooks/…', 'aria-label': t('discord.webhook_' + target), autocomplete: 'off' });
      const state = info[target].configured
        ? pill(t('discord.connected') + ' ' + info[target].hint, 'done', 'check-circle')
        : pill(t('discord.not_connected'), 'muted');
      const save = el('button.btn.primary', { type: 'button' }, uiIcon('floppy-disk'), el('span', { text: t('profile.save') }));
      save.addEventListener('click', async () => {
        if (!input.value.trim()) { toast(t('discord.enter_url'), 'err'); return; }
        save.disabled = true;
        try { info = await api.saveDiscord({ [target + 'Webhook']: input.value.trim() }); toast(t('discord.saved')); discordSettingsRender(); }
        catch (err) { toast(err.message, 'err'); save.disabled = false; }
      });
      return arkPanel({ title: t('discord.channel_' + target), icon, className: 'discord-card g-' + tone },
        el('p.profile-form-note', { text: t('discord.hint_' + target) }),
        el('div.sec-status', {}, uiIcon('chat-circle-dots'), el('span', { text: t('discord.status') }), state),
        el('div.pin-row', {}, input, save),
        info[target].configured ? el('div.pin-row-2', {},
          el('button.btn.sm', { type: 'button', onclick: async (e) => {
            e.currentTarget.disabled = true;
            try { const r = await api.testDiscord(target); toast(r.ok ? t('discord.test_ok') : t('discord.test_fail'), r.ok ? 'ok' : 'err'); }
            catch (err) { toast(err.message, 'err'); }
            finally { e.currentTarget.disabled = false; }
          } }, uiIcon('paper-plane-tilt'), el('span', { text: t('discord.test') })),
          el('button.btn.sm.danger', { type: 'button', onclick: async () => {
            if (!await confirmDialog({ title: t('discord.remove_confirm'), danger: true })) return;
            try { info = await api.saveDiscord({ [target + 'Webhook']: '' }); toast(t('discord.saved')); discordSettingsRender(); }
            catch (err) { toast(err.message, 'err'); }
          } }, uiIcon('trash'), el('span', { text: t('discord.remove') }))) : null);
    };
    function discordSettingsRender() {
      box.replaceChildren(
        el('div.notice.note', { text: t('discord.howto') }),
        el('div.member-groups', {}, card('breeder', 'leaf', 'breeder'), card('crafter', 'wrench', 'crafter')));
    }
    discordSettingsRender();
  }

  // Vault-Verwaltung: Admins legen Vaults an und vergeben sie. Den PIN setzt
  // jedes Mitglied selbst; hier ist er nur maskiert einsehbar.
  function vaultManager(active) {
    const name = el('input', { type: 'text', maxlength: 50, placeholder: 'PV-015', id: 'vault-name', required: true });
    const note = el('input', { type: 'text', maxlength: 200, id: 'vault-note' });
    const assign = el('select', { id: 'vault-assign' }, el('option', { value: '', text: t('vault.unassigned') }),
      ...active.map((m) => el('option', { value: m.id, text: m.username })));
    const createBtn = el('button.btn.primary.lux', { type: 'submit' }, uiIcon('plus'), el('span', { text: t('vault.create') }));
    const form = el('form.ark-panel.vault-form', { onsubmit: async (e) => {
      e.preventDefault();
      if (!name.value.trim()) return;
      createBtn.disabled = true;
      try {
        await api.createVault({ name: name.value.trim(), note: note.value.trim() || undefined, assignedUserId: assign.value || null });
        toast(t('vault.created'));
        await reload();
      } catch (err) { toast(err.message, 'err'); createBtn.disabled = false; }
    } },
      el('header.ark-panel-head', {}, uiIcon('plus-circle', 'ark-panel-icon'), el('h2', { text: t('vault.new') })),
      el('p.profile-form-note', { text: t('vault.admin_hint') }),
      el('div.vault-form-grid', {},
        el('div.field', {}, el('label', { for: 'vault-name', text: t('vault.name') }), name),
        el('div.field', {}, el('label', { for: 'vault-note', text: t('vault.note') }), note),
        el('div.field', {}, el('label', { for: 'vault-assign', text: t('vault.assign') }), assign),
        el('div.field.vault-form-submit', {}, createBtn)));

    const assigned = vaults.filter((v) => v.assigned_user_id).length;
    const rows = vaults.map((v) => {
      const select = el('select', { 'aria-label': t('vault.assign') + ' ' + v.name },
        el('option', { value: '', text: t('vault.unassigned') }),
        ...active.map((m) => el('option', { value: m.id, text: m.username, selected: Number(v.assigned_user_id) === Number(m.id) })));
      select.addEventListener('change', async () => {
        select.disabled = true;
        try { await api.updateVault(v.id, { assignedUserId: select.value || null }); toast(t('vault.saved')); await reload(); }
        catch (err) { toast(err.message, 'err'); select.disabled = false; }
      });
      // Den PIN sieht nur das Mitglied selbst; hier nur, ob einer gesetzt ist.
      const pinState = v.assigned_user_id ? pill(v.pinSet ? t('vault.pin_set') : t('vault.pin_missing'), v.pinSet ? 'done' : 'high') : null;
      return el('div.vault-row' + (v.assigned_user_id ? '' : '.is-free'), {},
        el('span.vault-icon', {}, uiIcon('duo-vault')),
        el('div.vault-copy', {}, el('strong', { text: v.name }), v.note ? el('small', { text: v.note }) : null),
        el('div.vault-assign', {}, v.assigned_username ? avatar(v.assigned_username, { size: 'sm' }) : el('span.ark-avatar.av-sm.av-tone-0', { text: '–', 'aria-hidden': 'true' }), select),
        el('div.vault-pin', {}, uiIcon('key'), pinState),
        kebabMenu([{ label: t('common.delete'), icon: 'trash', danger: true, onclick: async () => {
          if (!await confirmDialog({ title: t('vault.delete_confirm', { name: v.name }), danger: true })) return;
          try { await api.deleteVault(v.id); toast(t('vault.deleted')); await reload(); }
          catch (err) { toast(err.message, 'err'); }
        } }]));
    });
    return el('div.vault-manager', {},
      el('div.vault-summary', {},
        el('div.vault-stat', {}, uiIcon('duo-vault'), el('span', {}, el('strong', { text: String(vaults.length) }), el('small', { text: t('vault.title') }))),
        el('div.vault-stat.is-ok', {}, uiIcon('check-circle'), el('span', {}, el('strong', { text: String(assigned) }), el('small', { text: t('vault.assigned', { n: '' }).trim() }))),
        el('div.vault-stat.is-free', {}, uiIcon('lock-simple'), el('span', {}, el('strong', { text: String(vaults.length - assigned) }), el('small', { text: t('vault.free', { n: '' }).trim() })))),
      form,
      arkPanel({ title: t('vault.title'), icon: 'vault', count: vaults.length },
        vaults.length ? el('div.vault-list', {}, ...rows) : emptyBlock('vault', t('vault.empty'))));
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

const ASSIGNABLE_ROLES = ['member', 'breeder', 'crafter', 'admin', 'developer'];

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
              // breeder_crafter ist nur die abgeleitete Berechtigung - nie zurueckschreiben.
              const own = u.roles.filter((x) => x !== 'breeder_crafter');
              const next = own.includes(r) ? own.filter((x) => x !== r) : [...own, r];
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
            Number(u.totp_enabled) ? el('button.btn.sm', {
              text: t('mfa.reset'),
              onclick: async () => {
                const ok = await confirmDialog({ title: t('mfa.reset_confirm', { name: u.username }), danger: true });
                if (!ok) return;
                try { await api.resetTwoFactor(u.id); toast(t('mfa.disabled')); users = (await api.allUsers()).users; draw(); }
                catch (err) { toast(err.message, 'err'); }
              },
            }) : null,
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
