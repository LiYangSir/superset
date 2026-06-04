use rusqlite::{Connection, Result, params};
use std::time::{SystemTime, UNIX_EPOCH};

struct Migration {
    #[allow(dead_code)]
    idx: u32,
    tag: &'static str,
    sql: &'static str,
}

static MIGRATIONS: &[Migration] = &[
    Migration { idx: 0, tag: "0000_initial_schema", sql: include_str!("../../../packages/local-db/drizzle/0000_initial_schema.sql") },
    Migration { idx: 1, tag: "0001_add_synced_tables", sql: include_str!("../../../packages/local-db/drizzle/0001_add_synced_tables.sql") },
    Migration { idx: 2, tag: "0002_add_active_organization_id", sql: include_str!("../../../packages/local-db/drizzle/0002_add_active_organization_id.sql") },
    Migration { idx: 3, tag: "0003_add_confirm_on_quit_setting", sql: include_str!("../../../packages/local-db/drizzle/0003_add_confirm_on_quit_setting.sql") },
    Migration { idx: 4, tag: "0004_add_terminal_link_behavior_setting", sql: include_str!("../../../packages/local-db/drizzle/0004_add_terminal_link_behavior_setting.sql") },
    Migration { idx: 5, tag: "0005_add_navigation_style", sql: include_str!("../../../packages/local-db/drizzle/0005_add_navigation_style.sql") },
    Migration { idx: 6, tag: "0006_add_unique_branch_workspace_index", sql: include_str!("../../../packages/local-db/drizzle/0006_add_unique_branch_workspace_index.sql") },
    Migration { idx: 7, tag: "0007_add_workspace_is_unread", sql: include_str!("../../../packages/local-db/drizzle/0007_add_workspace_is_unread.sql") },
    Migration { idx: 8, tag: "0008_add_group_tabs_position", sql: include_str!("../../../packages/local-db/drizzle/0008_add_group_tabs_position.sql") },
    Migration { idx: 9, tag: "0009_add_github_owner_to_projects", sql: include_str!("../../../packages/local-db/drizzle/0009_add_github_owner_to_projects.sql") },
    Migration { idx: 10, tag: "0010_add_workspace_deleting_at", sql: include_str!("../../../packages/local-db/drizzle/0010_add_workspace_deleting_at.sql") },
    Migration { idx: 11, tag: "0011_add_terminal_persistence", sql: include_str!("../../../packages/local-db/drizzle/0011_add_terminal_persistence.sql") },
    Migration { idx: 12, tag: "0012_add_persist_terminal", sql: include_str!("../../../packages/local-db/drizzle/0012_add_persist_terminal.sql") },
    Migration { idx: 13, tag: "0013_add_auto_apply_default_preset", sql: include_str!("../../../packages/local-db/drizzle/0013_add_auto_apply_default_preset.sql") },
    Migration { idx: 14, tag: "0014_add_branch_prefix_config", sql: include_str!("../../../packages/local-db/drizzle/0014_add_branch_prefix_config.sql") },
    Migration { idx: 15, tag: "0015_add_notification_sounds_muted", sql: include_str!("../../../packages/local-db/drizzle/0015_add_notification_sounds_muted.sql") },
    Migration { idx: 16, tag: "0016_add_telemetry_enabled", sql: include_str!("../../../packages/local-db/drizzle/0016_add_telemetry_enabled.sql") },
    Migration { idx: 17, tag: "0017_add_is_unnamed_to_workspaces", sql: include_str!("../../../packages/local-db/drizzle/0017_add_is_unnamed_to_workspaces.sql") },
    Migration { idx: 18, tag: "0018_add_delete_local_branch_setting", sql: include_str!("../../../packages/local-db/drizzle/0018_add_delete_local_branch_setting.sql") },
    Migration { idx: 19, tag: "0019_add_hide_image_to_projects", sql: include_str!("../../../packages/local-db/drizzle/0019_add_hide_image_to_projects.sql") },
    Migration { idx: 20, tag: "0020_add_file_open_mode_setting", sql: include_str!("../../../packages/local-db/drizzle/0020_add_file_open_mode_setting.sql") },
    Migration { idx: 21, tag: "0021_add_image_project", sql: include_str!("../../../packages/local-db/drizzle/0021_add_image_project.sql") },
    Migration { idx: 22, tag: "0022_add_port_config", sql: include_str!("../../../packages/local-db/drizzle/0022_add_port_config.sql") },
    Migration { idx: 23, tag: "0023_add_show_presets_bar_setting", sql: include_str!("../../../packages/local-db/drizzle/0023_add_show_presets_bar_setting.sql") },
    Migration { idx: 24, tag: "0024_generate_migration", sql: include_str!("../../../packages/local-db/drizzle/0024_generate_migration.sql") },
    Migration { idx: 25, tag: "0025_add_neon_project_id", sql: include_str!("../../../packages/local-db/drizzle/0025_add_neon_project_id.sql") },
    Migration { idx: 26, tag: "0026_browser_history", sql: include_str!("../../../packages/local-db/drizzle/0026_browser_history.sql") },
    Migration { idx: 27, tag: "0027_per_project_default_app", sql: include_str!("../../../packages/local-db/drizzle/0027_per_project_default_app.sql") },
    Migration { idx: 28, tag: "0028_add_show_resource_monitor_setting", sql: include_str!("../../../packages/local-db/drizzle/0028_add_show_resource_monitor_setting.sql") },
    Migration { idx: 29, tag: "0029_add_workspace_base_branch", sql: include_str!("../../../packages/local-db/drizzle/0029_add_workspace_base_branch.sql") },
    Migration { idx: 30, tag: "0030_shallow_the_leader", sql: include_str!("../../../packages/local-db/drizzle/0030_shallow_the_leader.sql") },
    Migration { idx: 31, tag: "0031_add_open_links_in_app_setting", sql: include_str!("../../../packages/local-db/drizzle/0031_add_open_links_in_app_setting.sql") },
    Migration { idx: 32, tag: "0032_migrate_workspace_ids_to_uuid_v4", sql: include_str!("../../../packages/local-db/drizzle/0032_migrate_workspace_ids_to_uuid_v4.sql") },
    Migration { idx: 33, tag: "0033_nosy_overlord", sql: include_str!("../../../packages/local-db/drizzle/0033_nosy_overlord.sql") },
    Migration { idx: 34, tag: "0034_add_use_compact_terminal_add_button_setting", sql: include_str!("../../../packages/local-db/drizzle/0034_add_use_compact_terminal_add_button_setting.sql") },
    Migration { idx: 35, tag: "0035_add_workspace_sections", sql: include_str!("../../../packages/local-db/drizzle/0035_add_workspace_sections.sql") },
    Migration { idx: 36, tag: "0036_add_spaces", sql: include_str!("../../../packages/local-db/drizzle/0036_add_spaces.sql") },
    Migration { idx: 37, tag: "0037_add_anthropic_settings", sql: include_str!("../../../packages/local-db/drizzle/0037_add_anthropic_settings.sql") },
    Migration { idx: 38, tag: "0038_add_missing_tables", sql: include_str!("../../../packages/local-db/drizzle/0038_add_missing_tables.sql") },
];

pub fn run(conn: &Connection) -> Result<()> {
    // Drizzle uses a different schema (SERIAL vs INTEGER, numeric vs INTEGER)
    // but SQLite treats them the same. Create only if it doesn't exist.
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS \"__drizzle_migrations\" (
            id SERIAL PRIMARY KEY,
            hash text NOT NULL,
            created_at numeric
        );"
    )?;

    let applied_count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM \"__drizzle_migrations\"",
        [],
        |row| row.get(0),
    )?;

    for migration in MIGRATIONS.iter().skip(applied_count as usize) {
        log::info!("Running migration {}: {}", migration.idx, migration.tag);

        let statements: Vec<&str> = migration.sql
            .split("--> statement-breakpoint")
            .collect();

        for statement in &statements {
            let trimmed = statement.trim();
            if !trimmed.is_empty() {
                conn.execute_batch(trimmed)?;
            }
        }

        let hash = sha256_hex(migration.sql);
        let now = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_millis() as i64;
        conn.execute(
            "INSERT INTO \"__drizzle_migrations\" (hash, created_at) VALUES (?1, ?2)",
            params![hash, now],
        )?;
    }

    seed_defaults(conn)?;
    Ok(())
}

fn sha256_hex(input: &str) -> String {
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};
    // Simple hash for migration tracking — not cryptographic but sufficient
    // to maintain compatibility with drizzle's tracking by position
    let mut hasher = DefaultHasher::new();
    input.hash(&mut hasher);
    format!("{:016x}", hasher.finish())
}

fn seed_defaults(conn: &Connection) -> Result<()> {
    let has_spaces: bool = conn.query_row(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='spaces'",
        [],
        |_| Ok(true),
    ).unwrap_or(false);

    if !has_spaces {
        return Ok(());
    }

    let count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM spaces",
        [],
        |row| row.get(0),
    ).unwrap_or(0);

    if count == 0 {
        let now = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_millis() as i64;
        conn.execute(
            "INSERT INTO spaces (id, name, color, is_default, created_at) VALUES (uuid_v4(), 'Default', '#6366f1', 1, ?1)",
            params![now],
        )?;
    }

    let has_space_id: bool = conn.prepare("SELECT space_id FROM projects LIMIT 0")
        .is_ok();

    if has_space_id {
        conn.execute(
            "UPDATE projects SET space_id = (SELECT id FROM spaces WHERE is_default = 1 LIMIT 1)
             WHERE space_id IS NULL",
            [],
        )?;
    }

    Ok(())
}
