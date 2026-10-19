//! The desktop app: the web app (../src) in a window of its own, drawn by WebView2 on Windows. See README.md,
//! "The Windows app", and DESIGN.md §11, "Built in M12".

use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;
use tauri::webview::{NewWindowResponse, WebviewWindowBuilder};
use tauri::{Manager, Url};

/// The longest the window waits to close for the page to finish what it must.
const CLOSING_WAIT: Duration = Duration::from_secs(10);

/// Asks the page what it must finish before the window closes (src/app/desktop.ts), waits for it, then closes.
const CLOSING: &str = r#"(async () => {
  const work = []
  window.dispatchEvent(new CustomEvent("bookbookbook:closing", { detail: work }))
  await Promise.allSettled(work)
  await window.__TAURI_INTERNALS__.invoke("close_now")
})()"#;

pub fn run() {
  tauri::Builder::default()
    // Opening bookbookbook again brings its window to the front, rather than open a second one on the same books,
    // which wouldn't see each other's changes. First, as the plugin asks.
    .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
      if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
      }
    }))
    // The window opens where it was, and as large as it was, when last closed. It's made hidden
    // (tauri.conf.json), and shown once it's there.
    .plugin(tauri_plugin_window_state::Builder::default().build())
    .on_window_event(|window, event| match event {
      // wry tells WebView2 when the window is hidden, but not when it's minimized, so the page would carry on as if
      // in view, and miss the backups made as the writer leaves it (src/backup/scheduler.ts).
      tauri::WindowEvent::Resized(_) => tell_webview_if_seen(window),
      tauri::WindowEvent::CloseRequested { api, .. } if finish_before_closing(window) => api.prevent_close(),
      _ => {}
    })
    .invoke_handler(tauri::generate_handler![close_now])
    .setup(|app| {
      let config = app
        .config()
        .app
        .windows
        .first()
        .cloned()
        .expect("a window in tauri.conf.json");
      let window = WebviewWindowBuilder::from_config(app, &config)?
        // A link out of the app opens in the browser, and the app stays put: the window has no Back button. A file
        // dropped where nothing takes it would otherwise replace the app with the file.
        .on_navigation(|url| {
          if in_app(url) {
            return true;
          }
          open_in_browser(url);
          false
        })
        // "Get a key", and any other link that asks for a new tab.
        .on_new_window(|url, _features| {
          open_in_browser(&url);
          NewWindowResponse::Deny
        })
        .build()?;
      #[cfg(windows)]
      window.with_webview(allow_what_the_writer_chose)?;
      #[cfg(not(windows))]
      let _ = window;
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running bookbookbook");
}

/// The app's own pages, served by Tauri from http://tauri.localhost on Windows (or by Vite, under `tauri dev`), and
/// the things it makes for itself, like the files it saves.
fn in_app(url: &Url) -> bool {
  match url.scheme() {
    "http" | "https" => url.host_str() == Some("tauri.localhost") || (cfg!(dev) && url.host_str() == Some("localhost")),
    "tauri" | "about" | "blob" | "data" => true,
    _ => false,
  }
}

/// The microphone, once the writer has set dictation up, and the folder they chose for backups. WebView2 would ask
/// again in a prompt of its own, from "tauri.localhost", and keep a Block for good, as the window has no settings to
/// undo it in. Windows' own privacy settings for the microphone still apply.
#[cfg(windows)]
fn allow_what_the_writer_chose(webview: tauri::webview::PlatformWebview) {
  use webview2_com::Microsoft::Web::WebView2::Win32::{
    COREWEBVIEW2_PERMISSION_KIND, COREWEBVIEW2_PERMISSION_KIND_FILE_READ_WRITE,
    COREWEBVIEW2_PERMISSION_KIND_MICROPHONE, COREWEBVIEW2_PERMISSION_STATE_ALLOW,
  };
  use webview2_com::PermissionRequestedEventHandler;

  let handler = PermissionRequestedEventHandler::create(Box::new(|_, args| {
    let Some(args) = args else { return Ok(()) };
    let mut kind = COREWEBVIEW2_PERMISSION_KIND::default();
    unsafe { args.PermissionKind(&mut kind)? };
    if kind == COREWEBVIEW2_PERMISSION_KIND_MICROPHONE || kind == COREWEBVIEW2_PERMISSION_KIND_FILE_READ_WRITE {
      unsafe { args.SetState(COREWEBVIEW2_PERMISSION_STATE_ALLOW)? };
    }
    Ok(())
  }));
  let mut token = 0i64;
  let added = unsafe {
    webview
      .controller()
      .CoreWebView2()
      .and_then(|core| core.add_PermissionRequested(&handler, &mut token))
  };
  if let Err(error) = added {
    eprintln!("[bookbookbook] couldn't handle WebView2's permission requests: {error}");
  }
}

/// Tells WebView2 whether the window can be seen, minimized or not, so the page knows when the writer has left it.
#[cfg(windows)]
fn tell_webview_if_seen(window: &tauri::Window) {
  let Some(webview) = window.get_webview_window(window.label()) else {
    return;
  };
  let seen = window.is_visible().unwrap_or(true) && !window.is_minimized().unwrap_or(false);
  let _ = webview.with_webview(move |webview| {
    let controller = webview.controller();
    let mut visible = Default::default();
    unsafe {
      if controller.IsVisible(&mut visible).is_ok() && visible.as_bool() != seen {
        let _ = controller.SetIsVisible(seen);
      }
    }
  });
}

#[cfg(not(windows))]
fn tell_webview_if_seen(_window: &tauri::Window) {}

/// Closing is how a writer leaves a desktop app, so the window waits for the page to back up what they did
/// (src/backup/scheduler.ts), up to CLOSING_WAIT. Asked again meanwhile, it closes at once. False if it mustn't wait.
fn finish_before_closing(window: &tauri::Window) -> bool {
  static ASKED: AtomicBool = AtomicBool::new(false);
  if ASKED.swap(true, Ordering::SeqCst) {
    return false;
  }
  let Some(webview) = window.get_webview_window(window.label()) else {
    return false;
  };
  if webview.eval(CLOSING).is_err() {
    return false;
  }
  let window = window.clone();
  std::thread::spawn(move || {
    std::thread::sleep(CLOSING_WAIT);
    let _ = window.destroy();
  });
  true
}

/// The page has finished what it had to (CLOSING). Async, so the window goes once WebView2 is done with the request.
#[tauri::command]
async fn close_now(window: tauri::Window) {
  let _ = window.destroy();
}

/// Web pages and email addresses only: anything else, a file above all, could run a program.
fn open_in_browser(url: &Url) {
  if matches!(url.scheme(), "http" | "https" | "mailto") {
    let _ = tauri_plugin_opener::open_url(url.as_str(), None::<&str>);
  }
}
