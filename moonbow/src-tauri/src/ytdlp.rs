//! Resolves a YouTube video id to a direct audio stream URL with yt-dlp.
//!
//! yt-dlp is the most actively maintained YouTube extractor; using it means the
//! app keeps working through YouTube's frequent signature/PO-token changes by
//! updating one binary instead of shipping a new app. If no yt-dlp is found, the
//! official standalone build is downloaded into the app's data directory.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use serde::Deserialize;
use tokio::process::Command;
use tokio::sync::Mutex;

/// Safety margin before the URL's own `expire=` timestamp.
const EXPIRY_MARGIN: Duration = Duration::from_secs(10 * 60);
/// Used when the URL carries no expiry.
const DEFAULT_TTL: Duration = Duration::from_secs(4 * 60 * 60);
const RESOLVE_TIMEOUT: Duration = Duration::from_secs(45);

#[derive(Clone, Debug)]
pub struct Resolved {
    pub url: String,
    pub headers: HashMap<String, String>,
    expires: Instant,
}

#[derive(Deserialize)]
struct Info {
    url: Option<String>,
    #[serde(default)]
    http_headers: HashMap<String, String>,
}

pub struct Resolver {
    data_dir: PathBuf,
    cache: Mutex<HashMap<String, Resolved>>,
    /// One lock per id so concurrent requests (audio element + prefetch) share one yt-dlp run.
    locks: Mutex<HashMap<String, Arc<Mutex<()>>>>,
    binary: Mutex<Option<PathBuf>>,
    http: reqwest::Client,
}

/// Audio format preference per platform: the webview has to be able to decode it.
/// WKWebView (macOS) is reliable with AAC/m4a; Chromium (Windows) and GStreamer
/// (Linux) handle Opus, which is higher quality at the same bitrate.
fn format_selector() -> &'static str {
    if cfg!(target_os = "macos") {
        "bestaudio[ext=m4a]/bestaudio[acodec^=mp4a]/bestaudio"
    } else {
        "bestaudio[acodec=opus]/bestaudio[ext=m4a]/bestaudio"
    }
}

fn exe_name() -> &'static str {
    if cfg!(windows) {
        "yt-dlp.exe"
    } else {
        "yt-dlp"
    }
}

fn release_asset() -> &'static str {
    if cfg!(windows) {
        "yt-dlp.exe"
    } else if cfg!(target_os = "macos") {
        "yt-dlp_macos"
    } else if cfg!(target_arch = "aarch64") {
        "yt-dlp_linux_aarch64"
    } else {
        "yt-dlp_linux"
    }
}

/// Reads the `expire` query parameter googlevideo URLs carry.
pub fn expiry_of(url: &str) -> Option<SystemTime> {
    let parsed = url::Url::parse(url).ok()?;
    let secs: u64 = parsed.query_pairs().find(|(k, _)| k == "expire")?.1.parse().ok()?;
    Some(UNIX_EPOCH + Duration::from_secs(secs))
}

fn ttl_for(url: &str) -> Duration {
    let Some(expiry) = expiry_of(url) else { return DEFAULT_TTL };
    match expiry.duration_since(SystemTime::now()) {
        Ok(left) if left > EXPIRY_MARGIN * 2 => left - EXPIRY_MARGIN,
        Ok(left) => left / 2,
        Err(_) => Duration::ZERO,
    }
}

/// Video ids are 11 chars of [A-Za-z0-9_-]. Anything else is rejected before it reaches a command line.
pub fn valid_id(id: &str) -> bool {
    (6..=64).contains(&id.len()) && id.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
}

fn on_path(name: &str) -> Option<PathBuf> {
    let path = std::env::var_os("PATH")?;
    std::env::split_paths(&path).map(|d| d.join(name)).find(|p| p.is_file())
}

fn js_runtimes() -> Vec<&'static str> {
    // Recent yt-dlp needs a JavaScript runtime to solve YouTube's player challenges.
    ["deno", "node", "bun"]
        .into_iter()
        .filter(|r| on_path(&if cfg!(windows) { format!("{r}.exe") } else { r.to_string() }).is_some())
        .collect()
}

impl Resolver {
    pub fn new(data_dir: PathBuf) -> Self {
        Self {
            data_dir,
            cache: Mutex::default(),
            locks: Mutex::default(),
            binary: Mutex::default(),
            http: reqwest::Client::builder().user_agent("Moonbow").build().expect("http client"),
        }
    }

    fn managed_path(&self) -> PathBuf {
        self.data_dir.join("bin").join(exe_name())
    }

    /// Finds yt-dlp: $MOONBOW_YTDLP, then the app-managed copy, then PATH; downloads one if none exist.
    async fn binary(&self) -> Result<PathBuf, String> {
        let mut slot = self.binary.lock().await;
        if let Some(p) = slot.as_ref() {
            return Ok(p.clone());
        }
        let found = std::env::var_os("MOONBOW_YTDLP")
            .map(PathBuf::from)
            .filter(|p| p.is_file())
            .or_else(|| Some(self.managed_path()).filter(|p| p.is_file()))
            .or_else(|| on_path(exe_name()));
        let path = match found {
            Some(p) => p,
            None => self.download().await?,
        };
        *slot = Some(path.clone());
        Ok(path)
    }

    async fn download(&self) -> Result<PathBuf, String> {
        let url = format!("https://github.com/yt-dlp/yt-dlp/releases/latest/download/{}", release_asset());
        log::info!("downloading yt-dlp from {url}");
        let bytes = self
            .http
            .get(&url)
            .send()
            .await
            .and_then(|r| r.error_for_status())
            .map_err(|e| format!("couldn't download yt-dlp: {e}"))?
            .bytes()
            .await
            .map_err(|e| format!("couldn't download yt-dlp: {e}"))?;
        let dest = self.managed_path();
        tokio::fs::create_dir_all(dest.parent().unwrap()).await.map_err(|e| e.to_string())?;
        let tmp = dest.with_extension("part");
        tokio::fs::write(&tmp, &bytes).await.map_err(|e| e.to_string())?;
        make_executable(&tmp)?;
        tokio::fs::rename(&tmp, &dest).await.map_err(|e| e.to_string())?;
        Ok(dest)
    }

    /// Keeps the app-managed yt-dlp current (YouTube breaks extractors often). No-op for a user-installed one.
    pub async fn self_update(&self) {
        let managed = self.managed_path();
        if !managed.is_file() {
            return;
        }
        let _ = Command::new(&managed).arg("-U").arg("--quiet").kill_on_drop(true).output().await;
    }

    pub async fn invalidate(&self, id: &str) {
        self.cache.lock().await.remove(id);
    }

    pub async fn resolve(&self, id: &str) -> Result<Resolved, String> {
        if !valid_id(id) {
            return Err("invalid id".into());
        }
        if let Some(r) = self.cached(id).await {
            return Ok(r);
        }
        let lock = self.locks.lock().await.entry(id.to_string()).or_default().clone();
        let _guard = lock.lock().await;
        // Another task may have resolved it while we waited.
        if let Some(r) = self.cached(id).await {
            return Ok(r);
        }
        let resolved = self.run(id).await?;
        self.cache.lock().await.insert(id.to_string(), resolved.clone());
        Ok(resolved)
    }

    async fn cached(&self, id: &str) -> Option<Resolved> {
        let cache = self.cache.lock().await;
        cache.get(id).filter(|r| r.expires > Instant::now()).cloned()
    }

    async fn run(&self, id: &str) -> Result<Resolved, String> {
        let bin = self.binary().await?;
        let runtimes = js_runtimes();
        match self.exec(&bin, id, &runtimes).await {
            // Older yt-dlp builds don't know --js-runtimes; retry plain.
            Err(e) if !runtimes.is_empty() && e.contains("no such option") => self.exec(&bin, id, &[]).await,
            other => other,
        }
    }

    async fn exec(&self, bin: &Path, id: &str, runtimes: &[&str]) -> Result<Resolved, String> {
        let mut cmd = Command::new(bin);
        cmd.args(["-J", "--no-playlist", "--no-warnings", "--no-progress", "-f", format_selector()]);
        for r in runtimes {
            cmd.args(["--js-runtimes", r]);
        }
        cmd.arg(format!("https://music.youtube.com/watch?v={id}"));
        cmd.kill_on_drop(true);
        #[cfg(windows)]
        {
            // Don't flash a console window for every song.
            cmd.creation_flags(0x0800_0000);
        }
        let out = tokio::time::timeout(RESOLVE_TIMEOUT, cmd.output())
            .await
            .map_err(|_| "yt-dlp timed out".to_string())?
            .map_err(|e| format!("couldn't run yt-dlp: {e}"))?;
        if !out.status.success() {
            let err = String::from_utf8_lossy(&out.stderr);
            let line = err.lines().rev().find(|l| l.contains("ERROR")).or_else(|| err.lines().last()).unwrap_or("yt-dlp failed");
            return Err(line.trim().to_string());
        }
        parse_info(&out.stdout)
    }
}

pub fn parse_info(json: &[u8]) -> Result<Resolved, String> {
    let info: Info = serde_json::from_slice(json).map_err(|e| format!("bad yt-dlp output: {e}"))?;
    let url = info.url.ok_or("no playable audio format")?;
    Ok(Resolved { expires: Instant::now() + ttl_for(&url), url, headers: info.http_headers })
}

#[cfg(unix)]
fn make_executable(p: &Path) -> Result<(), String> {
    use std::os::unix::fs::PermissionsExt;
    std::fs::set_permissions(p, std::fs::Permissions::from_mode(0o755)).map_err(|e| e.to_string())
}

#[cfg(not(unix))]
fn make_executable(_: &Path) -> Result<(), String> {
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validates_ids() {
        assert!(valid_id("dQw4w9WgXcQ"));
        assert!(valid_id("a_b-C1234567"));
        assert!(!valid_id("abc"));
        assert!(!valid_id("dQw4w9WgXcQ;rm -rf"));
        assert!(!valid_id("--exec=evil"));
        assert!(!valid_id("../../etc/passwd"));
    }

    #[test]
    fn reads_expiry() {
        let u = "https://rr1.googlevideo.com/videoplayback?expire=1900000000&ei=x&itag=251";
        assert_eq!(expiry_of(u), Some(UNIX_EPOCH + Duration::from_secs(1_900_000_000)));
        assert_eq!(expiry_of("https://example.com/a"), None);
        assert_eq!(expiry_of("not a url"), None);
    }

    #[test]
    fn ttl_respects_expiry() {
        let soon = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs() + 3600;
        let ttl = ttl_for(&format!("https://x.googlevideo.com/v?expire={soon}"));
        assert!(ttl <= Duration::from_secs(3600 - 600 + 1) && ttl > Duration::from_secs(2900), "{ttl:?}");
        assert_eq!(ttl_for("https://x.googlevideo.com/v?expire=1"), Duration::ZERO);
        assert_eq!(ttl_for("https://x/y"), DEFAULT_TTL);
    }

    #[test]
    fn parses_ytdlp_json() {
        let r = parse_info(br#"{"id":"x","url":"https://a.googlevideo.com/v?expire=1","http_headers":{"User-Agent":"UA"},"ext":"webm"}"#).unwrap();
        assert_eq!(r.url, "https://a.googlevideo.com/v?expire=1");
        assert_eq!(r.headers.get("User-Agent").map(String::as_str), Some("UA"));
        assert!(parse_info(br#"{"id":"x"}"#).is_err());
        assert!(parse_info(b"garbage").is_err());
    }
}
