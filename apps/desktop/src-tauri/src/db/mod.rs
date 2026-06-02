mod migrations;

use rusqlite::{Connection, Result, functions::FunctionFlags};
use std::path::PathBuf;
use uuid::Uuid;

pub struct Database {
    pub conn: Connection,
}

impl Database {
    pub fn open_default() -> Result<Self> {
        let db_path = Self::default_path();
        if let Some(parent) = db_path.parent() {
            std::fs::create_dir_all(parent).ok();
        }
        Self::open(&db_path)
    }

    pub fn open(path: &std::path::Path) -> Result<Self> {
        let conn = Connection::open(path)?;
        conn.pragma_update(None, "journal_mode", "WAL")?;
        conn.pragma_update(None, "foreign_keys", "OFF")?;

        conn.create_scalar_function(
            "uuid_v4",
            0,
            FunctionFlags::SQLITE_UTF8 | FunctionFlags::SQLITE_DETERMINISTIC,
            |_ctx| Ok(Uuid::new_v4().to_string()),
        )?;

        conn.create_scalar_function(
            "uuid_is_valid_v4",
            1,
            FunctionFlags::SQLITE_UTF8 | FunctionFlags::SQLITE_DETERMINISTIC,
            |ctx| {
                let value: String = ctx.get(0)?;
                Ok(Uuid::parse_str(&value).is_ok())
            },
        )?;

        Ok(Self { conn })
    }

    pub fn run_migrations(&self) -> Result<()> {
        migrations::run(&self.conn)
    }

    fn default_path() -> PathBuf {
        dirs::home_dir()
            .expect("Could not determine home directory")
            .join(".superset")
            .join("local.db")
    }
}
