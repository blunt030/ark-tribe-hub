-- ARK Tribe Hub – Datenbankschema (SQLite)
-- Alle tribe-gebundenen Tabellen tragen tribe_id als Mandanten-Schlüssel.
-- Der Katalog (categories/items) ist bewusst global (plattformweit gepflegt durch den Developer).

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS tribes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS roles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key TEXT UNIQUE NOT NULL -- 'developer' | 'admin' | 'breeder_crafter' | 'member'
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tribe_id INTEGER REFERENCES tribes(id),
  username TEXT NOT NULL,               -- entspricht dem ARK-Charakternamen
  email TEXT,
  email_verified INTEGER NOT NULL DEFAULT 0,
  email_verify_token TEXT,
  password_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending_approval', -- pending_approval | active | rejected | disabled
  avatar_path TEXT,
  personal_vault_number TEXT,
  server TEXT,
  map TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(tribe_id, username)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email) WHERE email IS NOT NULL;

CREATE TABLE IF NOT EXISTS user_roles (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id INTEGER NOT NULL REFERENCES roles(id),
  PRIMARY KEY (user_id, role_id)
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,             -- zufällige Session-ID
  token_hash TEXT NOT NULL,        -- SHA-256 des eigentlichen Cookie-Werts (Klartext-Token verlässt nie die DB)
  csrf_token_hash TEXT NOT NULL,   -- SHA-256 des CSRF-Tokens
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_agent TEXT,
  ip TEXT,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  last_seen_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

CREATE TABLE IF NOT EXISTS login_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  identifier TEXT NOT NULL,   -- normalisierter Benutzername/E-Mail
  ip TEXT NOT NULL,
  success INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_login_attempts_lookup ON login_attempts(identifier, created_at);

CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key TEXT UNIQUE NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS category_translations (
  category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  lang TEXT NOT NULL,
  name TEXT NOT NULL,
  PRIMARY KEY (category_id, lang)
);

CREATE TABLE IF NOT EXISTS items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category_id INTEGER NOT NULL REFERENCES categories(id),
  product_type TEXT NOT NULL,  -- creature | egg | embryo | saddle | ... (erweiterbar)
  key TEXT UNIQUE NOT NULL,
  emoji TEXT,
  image_path TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS item_translations (
  item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  lang TEXT NOT NULL,
  name TEXT NOT NULL,
  PRIMARY KEY (item_id, lang)
);

CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tribe_id INTEGER NOT NULL REFERENCES tribes(id),
  member_id INTEGER NOT NULL REFERENCES users(id),
  priority TEXT NOT NULL DEFAULT 'normal', -- normal | high | urgent
  note TEXT,
  status TEXT NOT NULL DEFAULT 'open',     -- open | partially_prepared | partially_issued | completed | cancelled
  assigned_to INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  cancelled_at TEXT,
  completed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_orders_tribe ON orders(tribe_id);
CREATE INDEX IF NOT EXISTS idx_orders_member ON orders(member_id);
CREATE INDEX IF NOT EXISTS idx_orders_assigned ON orders(assigned_to);

CREATE TABLE IF NOT EXISTS order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  item_id INTEGER NOT NULL REFERENCES items(id),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  status TEXT NOT NULL DEFAULT 'open', -- open | not_available | prepared | issued
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);

CREATE TABLE IF NOT EXISTS order_comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  author_id INTEGER NOT NULL REFERENCES users(id),
  body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_order_comments_order ON order_comments(order_id);

CREATE TABLE IF NOT EXISTS notification_types (
  key TEXT PRIMARY KEY
);

CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tribe_id INTEGER NOT NULL REFERENCES tribes(id),
  type TEXT NOT NULL REFERENCES notification_types(key),
  payload TEXT,
  is_read INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, is_read);

CREATE TABLE IF NOT EXISTS notification_preferences (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL REFERENCES notification_types(key),
  enabled INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (user_id, type)
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tribe_id INTEGER REFERENCES tribes(id),
  actor_id INTEGER REFERENCES users(id),
  action TEXT NOT NULL,
  target_type TEXT,
  target_id INTEGER,
  meta TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_audit_tribe ON audit_logs(tribe_id, created_at);

CREATE TABLE IF NOT EXISTS ui_strings (
  key TEXT NOT NULL,
  lang TEXT NOT NULL,
  value TEXT NOT NULL,
  PRIMARY KEY (key, lang)
);

CREATE TABLE IF NOT EXISTS news (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tribe_id INTEGER NOT NULL REFERENCES tribes(id),
  body TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'normal',
  is_active INTEGER NOT NULL DEFAULT 1,
  starts_at TEXT,
  ends_at TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_news_tribe ON news(tribe_id, is_active);

CREATE TABLE IF NOT EXISTS dinos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tribe_id INTEGER NOT NULL REFERENCES tribes(id),
  name TEXT NOT NULL,
  species TEXT NOT NULL,
  sex TEXT NOT NULL DEFAULT 'unknown',
  level INTEGER,
  owner_id INTEGER REFERENCES users(id),
  server TEXT,
  map TEXT,
  location TEXT,
  generation INTEGER,
  mutations_male INTEGER NOT NULL DEFAULT 0,
  mutations_female INTEGER NOT NULL DEFAULT 0,
  parent_male_id INTEGER REFERENCES dinos(id),
  parent_female_id INTEGER REFERENCES dinos(id),
  image_path TEXT,
  image_data BLOB,
  image_mime TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  stats TEXT,
  notes TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_dinos_tribe ON dinos(tribe_id, status);
CREATE INDEX IF NOT EXISTS idx_dinos_species ON dinos(tribe_id, species);

CREATE TABLE IF NOT EXISTS game_servers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tribe_id INTEGER NOT NULL REFERENCES tribes(id),
  name TEXT NOT NULL,
  map_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  notes TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_servers_tribe ON game_servers(tribe_id);

CREATE TABLE IF NOT EXISTS map_markers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  server_id INTEGER NOT NULL REFERENCES game_servers(id) ON DELETE CASCADE,
  tribe_id INTEGER NOT NULL REFERENCES tribes(id),
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'other',
  coord_x REAL,
  coord_y REAL,
  description TEXT,
  image_path TEXT,
  image_data BLOB,
  image_mime TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_markers_server ON map_markers(server_id);
CREATE INDEX IF NOT EXISTS idx_markers_tribe ON map_markers(tribe_id);

CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tribe_id INTEGER NOT NULL REFERENCES tribes(id),
  title TEXT NOT NULL,
  description TEXT,
  assignee_id INTEGER REFERENCES users(id),
  priority TEXT NOT NULL DEFAULT 'normal',
  status TEXT NOT NULL DEFAULT 'open',
  due_date TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_tasks_tribe ON tasks(tribe_id, status);

CREATE TABLE IF NOT EXISTS task_comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  author_id INTEGER NOT NULL REFERENCES users(id),
  body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_task_comments_task ON task_comments(task_id);
