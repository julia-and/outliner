use tauri::menu::{AboutMetadataBuilder, MenuBuilder, MenuItemBuilder, SubmenuBuilder};
use tauri::Emitter;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_window_state::Builder::default().build())
    // Forward clicks on our custom menu items to the webview as a "menu"
    // event; the frontend bridge turns each into an app command. Predefined
    // items (copy/paste/quit/…) are handled natively and never reach here.
    .on_menu_event(|app, event| {
      let _ = app.emit("menu", event.id().as_ref());
    })
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }

      build_menu(app)?;

      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}

// Native menu mirroring the app's global actions. Node-level structure ops
// (indent/move/add) stay keyboard-driven for now — giving them menu
// accelerators would intercept the keystroke before the webview handler runs.
fn build_menu(app: &tauri::App) -> Result<(), Box<dyn std::error::Error>> {
  let about = AboutMetadataBuilder::new()
    .name(Some("ol"))
    .version(Some(env!("CARGO_PKG_VERSION")))
    .build();

  let app_menu = SubmenuBuilder::new(app, "ol")
    .about(Some(about))
    .separator()
    .hide()
    .hide_others()
    .show_all()
    .separator()
    .quit()
    .build()?;

  // File — outline lifecycle + import/export.
  let new_outline = MenuItemBuilder::with_id("new-outline", "New Outline")
    .accelerator("CmdOrCtrl+N")
    .build(app)?;
  let import_docx =
    MenuItemBuilder::with_id("import-docx", "Import from Word…").build(app)?;
  let import_olz =
    MenuItemBuilder::with_id("import-olz", "Import Outline (.olz)…").build(app)?;
  let export_outline = MenuItemBuilder::with_id("export-outline", "Export Outline…")
    .accelerator("CmdOrCtrl+E")
    .build(app)?;
  let file_menu = SubmenuBuilder::new(app, "File")
    .item(&new_outline)
    .separator()
    .item(&import_docx)
    .item(&import_olz)
    .separator()
    .item(&export_outline)
    .build()?;

  let edit_menu = SubmenuBuilder::new(app, "Edit")
    .undo()
    .redo()
    .separator()
    .cut()
    .copy()
    .paste()
    .select_all()
    .build()?;

  // View — layout, theme, help.
  let toggle_layout = MenuItemBuilder::with_id("toggle-layout", "Toggle Split Direction")
    .accelerator("CmdOrCtrl+\\")
    .build(app)?;
  let theme_system =
    MenuItemBuilder::with_id("theme-system", "Theme: System").build(app)?;
  let theme_light =
    MenuItemBuilder::with_id("theme-light", "Theme: Light").build(app)?;
  let theme_dark = MenuItemBuilder::with_id("theme-dark", "Theme: Dark").build(app)?;
  let theme_menu = SubmenuBuilder::new(app, "Theme")
    .item(&theme_system)
    .item(&theme_light)
    .item(&theme_dark)
    .build()?;
  let show_shortcuts = MenuItemBuilder::with_id("show-shortcuts", "Keyboard Shortcuts")
    .accelerator("CmdOrCtrl+/")
    .build(app)?;
  let view_menu = SubmenuBuilder::new(app, "View")
    .item(&toggle_layout)
    .separator()
    .item(&theme_menu)
    .separator()
    .item(&show_shortcuts)
    .build()?;

  let window_menu = SubmenuBuilder::new(app, "Window")
    .minimize()
    .separator()
    .close_window()
    .build()?;

  let menu = MenuBuilder::new(app)
    .items(&[
      &app_menu,
      &file_menu,
      &edit_menu,
      &view_menu,
      &window_menu,
    ])
    .build()?;

  app.set_menu(menu)?;

  Ok(())
}
