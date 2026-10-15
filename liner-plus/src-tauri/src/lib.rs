mod proxy;
mod ytdlp;

use std::sync::Arc;

use tauri::{Manager, State};
use ytdlp::{valid_id, Resolver};

struct AppState {
    proxy_base: String,
    resolver: Arc<Resolver>,
}

/// Base URL of the local audio proxy; the UI appends `/stream/<videoId>`.
#[tauri::command]
fn proxy_base(state: State<'_, AppState>) -> String {
    state.proxy_base.clone()
}

/// Resolves a stream ahead of time so the next track starts instantly.
#[tauri::command]
fn prefetch_stream(id: String, state: State<'_, AppState>) {
    if !valid_id(&id) {
        return;
    }
    let resolver = state.resolver.clone();
    tauri::async_runtime::spawn(async move {
        if let Err(e) = resolver.resolve(&id).await {
            log::warn!("prefetch {id}: {e}");
        }
    });
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default().plugin(tauri_plugin_http::init());
    // VERSE_DEMO=1 runs on the offline demo catalogue; =proxy also routes it through the audio proxy.
    if let Ok(demo) = std::env::var("VERSE_DEMO") {
        let script = format!("window.__VERSE_DEMO__ = {};", serde_json::to_string(&demo).unwrap_or_default());
        builder = builder.plugin(tauri::plugin::Builder::<tauri::Wry>::new("demo").js_init_script(script).build());
    }
    builder
        .setup(|app| {
            let data_dir = app.path().app_data_dir()?;
            let resolver = Arc::new(Resolver::new(data_dir));
            let proxy_base = tauri::async_runtime::block_on(proxy::start(resolver.clone()))?;
            let updater = resolver.clone();
            tauri::async_runtime::spawn(async move { updater.self_update().await });
            app.manage(AppState { proxy_base, resolver });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![proxy_base, prefetch_stream])
        .run(tauri::generate_context!())
        .expect("error while running Verse");
}
