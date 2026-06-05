use tauri::menu::{AboutMetadataBuilder, MenuBuilder, SubmenuBuilder};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_window_state::Builder::default().build())
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

// Native menu so standard shortcuts (⌘Z/⌘C/⌘V/⌘A, ⌘Q/⌘W/⌘M) work and the
// macOS menu bar shows the app name instead of the binary name. Without an
// explicit menu the webview has no menu-driven Edit shortcuts.
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

  let edit_menu = SubmenuBuilder::new(app, "Edit")
    .undo()
    .redo()
    .separator()
    .cut()
    .copy()
    .paste()
    .select_all()
    .build()?;

  let window_menu = SubmenuBuilder::new(app, "Window")
    .minimize()
    .separator()
    .close_window()
    .build()?;

  let menu = MenuBuilder::new(app)
    .items(&[&app_menu, &edit_menu, &window_menu])
    .build()?;

  app.set_menu(menu)?;

  Ok(())
}
