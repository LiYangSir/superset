mod browser;
mod browser_history;
mod changes;
mod config;
mod external;
mod filesystem;
mod hotkeys;
mod memory;
mod menu;
mod notifications;
mod permissions;
mod ports;
mod projects;
mod resource_metrics;
mod ringtone;
mod settings;
mod spaces;
mod tasks;
pub(crate) mod terminal;
mod ui_state;
mod window;
mod workspaces;

use tauri::Manager;

use crate::AppState;

#[tauri::command]
pub async fn trpc_call(
    path: String,
    #[allow(unused)] r#type: String,
    input: serde_json::Value,
    state: tauri::State<'_, AppState>,
    webview_window: tauri::WebviewWindow,
) -> Result<serde_json::Value, String> {
    // Routes that don't need db — return early
    match path.as_str() {
        // window
        "window.minimize" => return window::minimize(&webview_window),
        "window.maximize" => return window::maximize(&webview_window),
        "window.close" => return window::close(&webview_window),
        "window.isMaximized" => return window::is_maximized(&webview_window),
        "window.getPlatform" => return window::get_platform(),
        "window.getHomeDir" => return window::get_home_dir(),
        "window.selectDirectory" => return window::select_directory(),
        "window.selectImageFile" => return window::select_image_file(),

        // external
        "external.openUrl" => return external::open_url(input),
        "external.openInFinder" => return external::open_in_finder(input),
        "external.copyPath" => return external::copy_path(input),
        "external.openFileInEditor" => return external::open_file_in_editor(input),

        // permissions
        "permissions.getStatus" => return permissions::get_status(),
        "permissions.requestFullDiskAccess" => return permissions::request_full_disk_access(),
        "permissions.requestAccessibility" => return permissions::request_accessibility(),
        "permissions.requestMicrophone" => return permissions::request_microphone(),
        "permissions.requestAppleEvents" => return permissions::request_apple_events(),
        "permissions.requestLocalNetwork" => return permissions::request_local_network(),

        // resourceMetrics
        "resourceMetrics.getSnapshot" => return resource_metrics::get_snapshot(&state),

        // terminal
        "terminal.createOrAttach" => return terminal::create_or_attach(input, &state, webview_window.app_handle().clone()),
        "terminal.write" => return terminal::write(input, &state),
        "terminal.ackColdRestore" => return terminal::ack_cold_restore(input),
        "terminal.resize" => return terminal::resize(input, &state),
        "terminal.signal" => return terminal::signal(input, &state),
        "terminal.kill" => return terminal::kill(input, &state),
        "terminal.detach" => return terminal::detach(input, &state),
        "terminal.clearScrollback" => return terminal::clear_scrollback(input, &state),
        "terminal.listDaemonSessions" => return terminal::list_daemon_sessions(),
        "terminal.killAllDaemonSessions" => return terminal::kill_all_daemon_sessions(),
        "terminal.killDaemonSessionsForWorkspace" => return terminal::kill_daemon_sessions_for_workspace(input),
        "terminal.clearTerminalHistory" => return terminal::clear_terminal_history(),
        "terminal.restartDaemon" => return terminal::restart_daemon(),
        "terminal.getSession" => return terminal::get_session(input, &state),
        "terminal.getWorkspaceCwd" => return terminal::get_workspace_cwd(input, &state),

        // native GPU terminal
        "nativeTerminal.open" => return crate::native_terminal::open(input, webview_window.app_handle()),

        // filesystem
        "filesystem.getServiceInfo" => return filesystem::get_service_info(input),
        "filesystem.readDirectory" => return filesystem::read_directory(input),
        "filesystem.searchFiles" => {} // needs db — handled below
        "filesystem.searchFilesMulti" => {} // needs db — handled below
        "filesystem.searchKeyword" => {} // needs db — handled below
        "filesystem.createFile" => return filesystem::create_file(input),
        "filesystem.createDirectory" => return filesystem::create_directory(input),
        "filesystem.rename" => return filesystem::rename(input),
        "filesystem.delete" => return filesystem::delete_path(input),
        "filesystem.move" => return filesystem::move_path(input),
        "filesystem.copy" => return filesystem::copy_path(input),
        "filesystem.exists" => return filesystem::exists(input),
        "filesystem.stat" => return filesystem::stat(input),

        // browser
        "browser.register" => return browser::register(input),
        "browser.unregister" => return browser::unregister(input),
        "browser.navigate" => return browser::navigate(input),
        "browser.goBack" => return browser::go_back(input),
        "browser.goForward" => return browser::go_forward(input),
        "browser.reload" => return browser::reload(input),
        "browser.screenshot" => return browser::screenshot(input),
        "browser.evaluateJS" => return browser::evaluate_js(input),
        "browser.getConsoleLogs" => return browser::get_console_logs(input),
        "browser.openDevTools" => return browser::open_dev_tools(input),
        "browser.getDevToolsUrl" => return browser::get_dev_tools_url(input),
        "browser.getPageInfo" => return browser::get_page_info(input),
        "browser.clearBrowsingData" => return browser::clear_browsing_data(input),

        // changes (git operations — no db needed)
        "changes.getBranches" => return changes::get_branches(input),
        "changes.switchBranch" => return changes::switch_branch(input),
        "changes.updateBaseBranch" => return changes::update_base_branch(input),
        "changes.getStatus" => return changes::get_status(input),
        "changes.getCommitFiles" => return changes::get_commit_files(input),
        "changes.getFileContents" => return changes::get_file_contents(input),
        "changes.saveFile" => return changes::save_file(input),
        "changes.readWorkingFile" => return changes::read_working_file(input),
        "changes.readWorkingFileImage" => return changes::read_working_file_image(input),
        "changes.stageFile" => return changes::stage_file(input),
        "changes.unstageFile" => return changes::unstage_file(input),
        "changes.discardChanges" => return changes::discard_changes(input),
        "changes.stageFiles" => return changes::stage_files(input),
        "changes.unstageFiles" => return changes::unstage_files(input),
        "changes.stageAll" => return changes::stage_all(input),
        "changes.unstageAll" => return changes::unstage_all(input),
        "changes.deleteUntracked" => return changes::delete_untracked(input),
        "changes.discardAllUnstaged" => return changes::discard_all_unstaged(input),
        "changes.discardAllStaged" => return changes::discard_all_staged(input),
        "changes.stash" => return changes::stash(input),
        "changes.stashIncludeUntracked" => return changes::stash_include_untracked(input),
        "changes.stashPop" => return changes::stash_pop(input),
        "changes.commit" => return changes::commit(input),
        "changes.push" => return changes::push(input),
        "changes.pull" => return changes::pull(input),
        "changes.sync" => return changes::sync(input),
        "changes.fetch" => return changes::fetch(input),
        "changes.createPR" => return changes::create_pr(input),
        "changes.mergePR" => return changes::merge_pr(input),

        // ports
        "ports.getAll" => return ports::get_all(),
        "ports.kill" => return ports::kill(input),

        // hotkeys
        "hotkeys.export" => return hotkeys::export_hotkeys(input),
        "hotkeys.import" => return hotkeys::import_hotkeys(input),

        // ringtone
        "ringtone.preview" => return ringtone::preview(input),
        "ringtone.stop" => return ringtone::stop(),
        "ringtone.getCustom" => return ringtone::get_custom(),
        "ringtone.importCustom" => return ringtone::import_custom(input),

        _ => {}
    }

    // Routes that need db
    let db = state.db.lock().map_err(|e| e.to_string())?;

    match path.as_str() {
        // external (needs db for persisting default app)
        "external.openInApp" => return external::open_in_app(&db, input),

        // filesystem (needs db to resolve workspace root)
        "filesystem.searchFiles" => return filesystem::search_files(&db, input).map_err(|e| e.to_string()),
        "filesystem.searchFilesMulti" => return filesystem::search_files_multi(&db, input).map_err(|e| e.to_string()),
        "filesystem.searchKeyword" => return filesystem::search_keyword(&db, input).map_err(|e| e.to_string()),

        // browserHistory
        "browserHistory.getAll" => browser_history::get_all(&db).map_err(|e| e.to_string()),
        "browserHistory.search" => browser_history::search(&db, input).map_err(|e| e.to_string()),
        "browserHistory.upsert" => browser_history::upsert(&db, input).map_err(|e| e.to_string()),
        "browserHistory.clear" => browser_history::clear(&db).map_err(|e| e.to_string()),

        // spaces
        "spaces.list" => spaces::list(&db).map_err(|e| e.to_string()),
        "spaces.create" => spaces::create(&db, input).map_err(|e| e.to_string()),
        "spaces.update" => spaces::update(&db, input).map_err(|e| e.to_string()),
        "spaces.delete" => spaces::delete(&db, input).map_err(|e| e.to_string()),
        "spaces.getProjectCounts" => spaces::get_project_counts(&db).map_err(|e| e.to_string()),

        // config
        "config.shouldShowSetupCard" => config::should_show_setup_card(&db).map_err(|e| e.to_string()),
        "config.dismissSetupCard" => config::dismiss_setup_card(&db).map_err(|e| e.to_string()),
        "config.getConfigFilePath" => config::get_config_file_path().map_err(|e| e.to_string()),
        "config.getConfigContent" => config::get_config_content().map_err(|e| e.to_string()),
        "config.getSetupOnboardingDefaults" => config::get_setup_onboarding_defaults().map_err(|e| e.to_string()),
        "config.updateConfig" => config::update_config(input).map_err(|e| e.to_string()),

        // uiState
        "uiState.tabs.get" => ui_state::tabs_get().map_err(|e| e.to_string()),
        "uiState.tabs.set" => ui_state::tabs_set(input).map_err(|e| e.to_string()),
        "uiState.theme.get" => ui_state::theme_get().map_err(|e| e.to_string()),
        "uiState.theme.set" => ui_state::theme_set(input).map_err(|e| e.to_string()),
        "uiState.hotkeys.get" => ui_state::hotkeys_get().map_err(|e| e.to_string()),
        "uiState.hotkeys.set" => ui_state::hotkeys_set(input).map_err(|e| e.to_string()),

        // settings — getters
        "settings.getConfirmOnQuit" => settings::get_confirm_on_quit(&db).map_err(|e| e.to_string()),
        "settings.getTerminalLinkBehavior" => settings::get_terminal_link_behavior(&db).map_err(|e| e.to_string()),
        "settings.getFileOpenMode" => settings::get_file_open_mode(&db).map_err(|e| e.to_string()),
        "settings.getAutoApplyDefaultPreset" => settings::get_auto_apply_default_preset(&db).map_err(|e| e.to_string()),
        "settings.getShowPresetsBar" => settings::get_show_presets_bar(&db).map_err(|e| e.to_string()),
        "settings.getUseCompactTerminalAddButton" => settings::get_use_compact_terminal_add_button(&db).map_err(|e| e.to_string()),
        "settings.getShowResourceMonitor" => settings::get_show_resource_monitor(&db).map_err(|e| e.to_string()),
        "settings.getOpenLinksInApp" => settings::get_open_links_in_app(&db).map_err(|e| e.to_string()),
        "settings.getDeleteLocalBranch" => settings::get_delete_local_branch(&db).map_err(|e| e.to_string()),
        "settings.getNotificationSoundsMuted" => settings::get_notification_sounds_muted(&db).map_err(|e| e.to_string()),
        "settings.getPersistTerminal" => settings::get_persist_terminal(&db).map_err(|e| e.to_string()),
        "settings.getBranchPrefix" => settings::get_branch_prefix(&db).map_err(|e| e.to_string()),
        "settings.getWorktreeBaseDir" => settings::get_worktree_base_dir(&db).map_err(|e| e.to_string()),
        "settings.getDefaultEditor" => settings::get_default_editor(&db).map_err(|e| e.to_string()),
        "settings.getSelectedRingtoneId" => settings::get_selected_ringtone_id(&db).map_err(|e| e.to_string()),
        "settings.getFontSettings" => settings::get_font_settings(&db).map_err(|e| e.to_string()),
        "settings.getTelemetryEnabled" => settings::get_telemetry_enabled(&db).map_err(|e| e.to_string()),
        "settings.getAnthropicApiKey" => settings::get_anthropic_api_key(&db).map_err(|e| e.to_string()),
        "settings.getAnthropicBaseUrl" => settings::get_anthropic_base_url(&db).map_err(|e| e.to_string()),
        "settings.getAnthropicModel" => settings::get_anthropic_model(&db).map_err(|e| e.to_string()),
        "settings.getDefaultPreset" => settings::get_default_preset(&db).map_err(|e| e.to_string()),
        "settings.getTerminalPresets" => settings::get_terminal_presets(&db).map_err(|e| e.to_string()),
        "settings.getWorkspaceCreationPresets" => settings::get_workspace_creation_presets(&db).map_err(|e| e.to_string()),
        "settings.getNewTabPresets" => settings::get_new_tab_presets(&db).map_err(|e| e.to_string()),
        "settings.getGitInfo" => settings::get_git_info(&db).map_err(|e| e.to_string()),

        // settings — setters
        "settings.setConfirmOnQuit" => settings::set_confirm_on_quit(&db, input).map_err(|e| e.to_string()),
        "settings.setTerminalLinkBehavior" => settings::set_terminal_link_behavior(&db, input).map_err(|e| e.to_string()),
        "settings.setFileOpenMode" => settings::set_file_open_mode(&db, input).map_err(|e| e.to_string()),
        "settings.setAutoApplyDefaultPreset" => settings::set_auto_apply_default_preset(&db, input).map_err(|e| e.to_string()),
        "settings.setShowPresetsBar" => settings::set_show_presets_bar(&db, input).map_err(|e| e.to_string()),
        "settings.setUseCompactTerminalAddButton" => settings::set_use_compact_terminal_add_button(&db, input).map_err(|e| e.to_string()),
        "settings.setShowResourceMonitor" => settings::set_show_resource_monitor(&db, input).map_err(|e| e.to_string()),
        "settings.setOpenLinksInApp" => settings::set_open_links_in_app(&db, input).map_err(|e| e.to_string()),
        "settings.setDeleteLocalBranch" => settings::set_delete_local_branch(&db, input).map_err(|e| e.to_string()),
        "settings.setNotificationSoundsMuted" => settings::set_notification_sounds_muted(&db, input).map_err(|e| e.to_string()),
        "settings.setPersistTerminal" => settings::set_persist_terminal(&db, input).map_err(|e| e.to_string()),
        "settings.setBranchPrefix" => settings::set_branch_prefix(&db, input).map_err(|e| e.to_string()),
        "settings.setWorktreeBaseDir" => settings::set_worktree_base_dir(&db, input).map_err(|e| e.to_string()),
        "settings.setDefaultEditor" => settings::set_default_editor(&db, input).map_err(|e| e.to_string()),
        "settings.setSelectedRingtoneId" => settings::set_selected_ringtone_id(&db, input).map_err(|e| e.to_string()),
        "settings.setFontSettings" => settings::set_font_settings(&db, input).map_err(|e| e.to_string()),
        "settings.setTelemetryEnabled" => settings::set_telemetry_enabled(&db, input).map_err(|e| e.to_string()),
        "settings.setAnthropicApiKey" => settings::set_anthropic_api_key(&db, input).map_err(|e| e.to_string()),
        "settings.setAnthropicBaseUrl" => settings::set_anthropic_base_url(&db, input).map_err(|e| e.to_string()),
        "settings.setAnthropicModel" => settings::set_anthropic_model(&db, input).map_err(|e| e.to_string()),
        "settings.createTerminalPreset" => settings::create_terminal_preset(&db, input).map_err(|e| e.to_string()),
        "settings.updateTerminalPreset" => settings::update_terminal_preset(&db, input).map_err(|e| e.to_string()),
        "settings.deleteTerminalPreset" => settings::delete_terminal_preset(&db, input).map_err(|e| e.to_string()),
        "settings.setDefaultPreset" => settings::set_default_preset(&db, input).map_err(|e| e.to_string()),
        "settings.setPresetAutoApply" => settings::set_preset_auto_apply(&db, input).map_err(|e| e.to_string()),
        "settings.reorderTerminalPresets" => settings::reorder_terminal_presets(&db, input).map_err(|e| e.to_string()),
        "settings.setPresetIcon" => settings::set_preset_icon(&db, input).map_err(|e| e.to_string()),
        "settings.restartApp" => settings::restart_app(&db).map_err(|e| e.to_string()),

        // tasks
        "tasks.list" => tasks::list(&db, input).map_err(|e| e.to_string()),
        "tasks.subtaskCounts" => tasks::subtask_counts(&db, input).map_err(|e| e.to_string()),
        "tasks.get" => tasks::get(&db, input).map_err(|e| e.to_string()),
        "tasks.create" => tasks::create(&db, input).map_err(|e| e.to_string()),
        "tasks.update" => tasks::update(&db, input).map_err(|e| e.to_string()),
        "tasks.delete" => tasks::delete(&db, input).map_err(|e| e.to_string()),
        "tasks.archive" => tasks::archive(&db, input).map_err(|e| e.to_string()),
        "tasks.unarchive" => tasks::unarchive(&db, input).map_err(|e| e.to_string()),
        "tasks.listArchived" => tasks::list_archived(&db, input).map_err(|e| e.to_string()),
        "tasks.reorder" => tasks::reorder(&db, input).map_err(|e| e.to_string()),
        "tasks.subtasks.create" => tasks::subtask_create(&db, input).map_err(|e| e.to_string()),
        "tasks.subtasks.toggle" => tasks::subtask_toggle(&db, input).map_err(|e| e.to_string()),
        "tasks.subtasks.update" => tasks::subtask_update(&db, input).map_err(|e| e.to_string()),
        "tasks.subtasks.delete" => tasks::subtask_delete(&db, input).map_err(|e| e.to_string()),
        "tasks.comments.create" => tasks::comment_create(&db, input).map_err(|e| e.to_string()),
        "tasks.labels.list" => tasks::label_list(&db, input).map_err(|e| e.to_string()),
        "tasks.labels.create" => tasks::label_create(&db, input).map_err(|e| e.to_string()),
        "tasks.labels.update" => tasks::label_update(&db, input).map_err(|e| e.to_string()),
        "tasks.labels.delete" => tasks::label_delete(&db, input).map_err(|e| e.to_string()),

        // memory
        "memory.list" => memory::list(&db, input).map_err(|e| e.to_string()),
        "memory.get" => memory::get(&db, input).map_err(|e| e.to_string()),
        "memory.create" => memory::create(&db, input).map_err(|e| e.to_string()),
        "memory.update" => memory::update(&db, input).map_err(|e| e.to_string()),
        "memory.delete" => memory::delete(&db, input).map_err(|e| e.to_string()),
        "memory.getForSession" => memory::get_for_session(&db, input).map_err(|e| e.to_string()),
        "memory.regenerateFiles" => memory::regenerate_files(&db).map_err(|e| e.to_string()),
        "memory.consolidate" => memory::consolidate(&db, input).map_err(|e| e.to_string()),
        "memory.summarizeSession" => memory::summarize_session(&db, input).map_err(|e| e.to_string()),

        // projects
        "projects.get" => projects::get(&db, input).map_err(|e| e.to_string()),
        "projects.getDefaultApp" => projects::get_default_app(&db, input).map_err(|e| e.to_string()),
        "projects.getRecents" => projects::get_recents(&db).map_err(|e| e.to_string()),
        "projects.selectDirectory" => projects::select_directory().map_err(|e| e.to_string()),
        "projects.getBranchesLocal" => projects::get_branches_local(&db, input).map_err(|e| e.to_string()),
        "projects.getBranches" => projects::get_branches(&db, input).map_err(|e| e.to_string()),
        "projects.openNew" => projects::open_new(&db, input).map_err(|e| e.to_string()),
        "projects.openFromPath" => projects::open_from_path(&db, input).map_err(|e| e.to_string()),
        "projects.initGitAndOpen" => projects::init_git_and_open(&db, input).map_err(|e| e.to_string()),
        "projects.cloneRepo" => projects::clone_repo(&db, input).map_err(|e| e.to_string()),
        "projects.createEmptyRepo" => projects::create_empty_repo(&db, input).map_err(|e| e.to_string()),
        "projects.update" => projects::update(&db, input).map_err(|e| e.to_string()),
        "projects.reorder" => projects::reorder(&db, input).map_err(|e| e.to_string()),
        "projects.refreshDefaultBranch" => projects::refresh_default_branch(&db, input).map_err(|e| e.to_string()),
        "projects.close" => projects::close(&db, input).map_err(|e| e.to_string()),
        "projects.linkToNeon" => projects::link_to_neon(&db, input).map_err(|e| e.to_string()),
        "projects.getGitAuthor" => projects::get_git_author(input).map_err(|e| e.to_string()),
        "projects.triggerFaviconDiscovery" => projects::trigger_favicon_discovery(&db, input).map_err(|e| e.to_string()),
        "projects.setProjectIcon" => projects::set_project_icon(&db, input).map_err(|e| e.to_string()),

        // workspaces
        "workspaces.get" => workspaces::get(&db, input).map_err(|e| e.to_string()),
        "workspaces.getAll" => workspaces::get_all(&db, input).map_err(|e| e.to_string()),
        "workspaces.getAllGrouped" => workspaces::get_all_grouped(&db, input).map_err(|e| e.to_string()),
        "workspaces.getPreviousWorkspace" => workspaces::get_previous_workspace(&db, input).map_err(|e| e.to_string()),
        "workspaces.getNextWorkspace" => workspaces::get_next_workspace(&db, input).map_err(|e| e.to_string()),
        "workspaces.create" => workspaces::create(&db, input).map_err(|e| e.to_string()),
        "workspaces.openMainRepoWorkspace" => workspaces::open_main_repo_workspace(&db, input).map_err(|e| e.to_string()),
        "workspaces.openWorktree" => workspaces::open_worktree(&db, input).map_err(|e| e.to_string()),
        "workspaces.openExternalWorktree" => workspaces::open_external_worktree(&db, input).map_err(|e| e.to_string()),
        "workspaces.createFromPr" => workspaces::create_from_pr(&db, input).map_err(|e| e.to_string()),
        "workspaces.importAllWorktrees" => workspaces::import_all_worktrees(&db, input).map_err(|e| e.to_string()),
        "workspaces.canDelete" => workspaces::can_delete(&db, input).map_err(|e| e.to_string()),
        "workspaces.delete" => workspaces::delete(&db, input).map_err(|e| e.to_string()),
        "workspaces.close" => workspaces::close(&db, input).map_err(|e| e.to_string()),
        "workspaces.canDeleteWorktree" => workspaces::can_delete_worktree(&db, input).map_err(|e| e.to_string()),
        "workspaces.deleteWorktree" => workspaces::delete_worktree(&db, input).map_err(|e| e.to_string()),
        "workspaces.refreshGitStatus" => workspaces::refresh_git_status(&db, input).map_err(|e| e.to_string()),
        "workspaces.getAheadBehind" => workspaces::get_ahead_behind(&db, input).map_err(|e| e.to_string()),
        "workspaces.getGitHubStatus" => workspaces::get_github_status(&db, input).map_err(|e| e.to_string()),
        "workspaces.getWorktreeInfo" => workspaces::get_worktree_info(&db, input).map_err(|e| e.to_string()),
        "workspaces.getWorktreesByProject" => workspaces::get_worktrees_by_project(&db, input).map_err(|e| e.to_string()),
        "workspaces.getExternalWorktrees" => workspaces::get_external_worktrees(&db, input).map_err(|e| e.to_string()),
        "workspaces.reorder" => workspaces::reorder(&db, input).map_err(|e| e.to_string()),
        "workspaces.reorderProjectChildren" => workspaces::reorder_project_children(&db, input).map_err(|e| e.to_string()),
        "workspaces.update" => workspaces::update(&db, input).map_err(|e| e.to_string()),
        "workspaces.setUnread" => workspaces::set_unread(&db, input).map_err(|e| e.to_string()),
        "workspaces.setActive" => workspaces::set_active(&db, input).map_err(|e| e.to_string()),
        "workspaces.syncBranch" => workspaces::sync_branch(&db, input).map_err(|e| e.to_string()),
        "workspaces.retryInit" => workspaces::retry_init(&db, input).map_err(|e| e.to_string()),
        "workspaces.getInitProgress" => workspaces::get_init_progress(&db, input).map_err(|e| e.to_string()),
        "workspaces.getSetupCommands" => workspaces::get_setup_commands(&db, input).map_err(|e| e.to_string()),
        "workspaces.createSection" => workspaces::create_section(&db, input).map_err(|e| e.to_string()),
        "workspaces.setSectionColor" => workspaces::set_section_color(&db, input).map_err(|e| e.to_string()),
        "workspaces.renameSection" => workspaces::rename_section(&db, input).map_err(|e| e.to_string()),
        "workspaces.deleteSection" => workspaces::delete_section(&db, input).map_err(|e| e.to_string()),
        "workspaces.reorderSections" => workspaces::reorder_sections(&db, input).map_err(|e| e.to_string()),
        "workspaces.toggleSectionCollapsed" => workspaces::toggle_section_collapsed(&db, input).map_err(|e| e.to_string()),
        "workspaces.reorderWorkspacesInSection" => workspaces::reorder_workspaces_in_section(&db, input).map_err(|e| e.to_string()),
        "workspaces.moveWorkspacesToSection" => workspaces::move_workspaces_to_section(&db, input).map_err(|e| e.to_string()),
        "workspaces.moveWorkspaceToSection" => workspaces::move_workspace_to_section(&db, input).map_err(|e| e.to_string()),

        _ => Err(format!("Not implemented: {}", path)),
    }
}

#[tauri::command]
pub async fn trpc_subscribe(
    path: String,
    #[allow(unused)] input: serde_json::Value,
    #[allow(unused)] app: tauri::AppHandle,
) -> Result<(), String> {
    log::info!("Subscription requested: {}", path);
    match path.as_str() {
        // Subscriptions return Ok to acknowledge — events are pushed via app.emit()
        "terminal.stream"
        | "filesystem.subscribe"
        | "notifications.subscribe"
        | "ports.subscribe"
        | "menu.subscribe"
        | "workspaces.onInitProgress"
        | "uiState.hotkeys.subscribe"
        | "browser.consoleStream"
        | "browser.onNewWindow"
        | "browser.onContextMenuAction" => Ok(()),

        _ => Err(format!("Subscription not implemented: {}", path)),
    }
}
