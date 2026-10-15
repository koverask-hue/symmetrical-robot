//! InnerTube requests made from Rust with browser-accurate headers.
//!
//! youtubei.js's browser build leaves Origin and User-Agent to the browser. Sent
//! through a generic HTTP bridge those become `tauri://localhost` and a library UA,
//! and YouTube answers 403. Here the headers are set exactly as a desktop browser
//! on youtube.com would send them, and only YouTube hosts are reachable.

use serde::{Deserialize, Serialize};

const UA: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";

const ALLOWED_HOSTS: [&str; 4] = ["www.youtube.com", "music.youtube.com", "youtube.com", "youtubei.googleapis.com"];

/// Headers the webview side may not set; they're derived from the URL instead.
const STRIPPED: [&str; 7] = ["origin", "referer", "user-agent", "cookie", "host", "content-length", "connection"];

#[derive(Deserialize)]
pub struct YtRequest {
    pub method: String,
    pub url: String,
    #[serde(default)]
    pub headers: Vec<(String, String)>,
    pub body: Option<String>,
    /// Binary bodies (protobuf) arrive base64-encoded.
    pub body_b64: Option<String>,
}

#[derive(Serialize)]
pub struct YtResponse {
    pub status: u16,
    pub headers: Vec<(String, String)>,
    pub body: String,
}

pub fn origin_of(url: &url::Url) -> Result<String, String> {
    let host = url.host_str().ok_or("no host")?;
    if url.scheme() != "https" || !ALLOWED_HOSTS.contains(&host) {
        return Err(format!("host not allowed: {host}"));
    }
    // InnerTube on the googleapis host is still called from youtube.com pages.
    Ok(if host == "youtubei.googleapis.com" { "https://www.youtube.com".into() } else { format!("https://{host}") })
}

pub fn build(client: &reqwest::Client, req: YtRequest) -> Result<reqwest::RequestBuilder, String> {
    let url = url::Url::parse(&req.url).map_err(|e| e.to_string())?;
    let origin = origin_of(&url)?;
    let method = reqwest::Method::from_bytes(req.method.to_uppercase().as_bytes()).map_err(|e| e.to_string())?;
    let mut rb = client
        .request(method, url)
        .header("User-Agent", UA)
        .header("Origin", &origin)
        .header("Referer", format!("{origin}/"));
    for (k, v) in &req.headers {
        if !STRIPPED.contains(&k.to_ascii_lowercase().as_str()) {
            rb = rb.header(k.as_str(), v.as_str());
        }
    }
    if let Some(b) = req.body {
        rb = rb.body(b);
    } else if let Some(b) = req.body_b64 {
        rb = rb.body(decode_b64(&b)?);
    }
    Ok(rb)
}

pub async fn send(client: &reqwest::Client, req: YtRequest) -> Result<YtResponse, String> {
    let res = build(client, req)?.send().await.map_err(|e| format!("network: {e}"))?;
    let status = res.status().as_u16();
    let headers = res
        .headers()
        .iter()
        .filter(|(k, _)| k.as_str() != "set-cookie")
        .filter_map(|(k, v)| Some((k.to_string(), v.to_str().ok()?.to_string())))
        .collect();
    let body = res.text().await.map_err(|e| e.to_string())?;
    Ok(YtResponse { status, headers, body })
}

fn decode_b64(s: &str) -> Result<Vec<u8>, String> {
    const T: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = Vec::with_capacity(s.len() * 3 / 4);
    let (mut buf, mut bits) = (0u32, 0u8);
    for c in s.bytes().filter(|c| !c.is_ascii_whitespace() && *c != b'=') {
        let v = T.iter().position(|&t| t == c).ok_or("bad base64")? as u32;
        buf = (buf << 6) | v;
        bits += 6;
        if bits >= 8 {
            bits -= 8;
            out.push((buf >> bits) as u8);
            buf &= (1 << bits) - 1;
        }
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn req(url: &str, headers: Vec<(&str, &str)>) -> YtRequest {
        YtRequest {
            method: "post".into(),
            url: url.into(),
            headers: headers.into_iter().map(|(a, b)| (a.into(), b.into())).collect(),
            body: Some("{}".into()),
            body_b64: None,
        }
    }

    #[test]
    fn sets_browser_headers_and_strips_webview_ones() {
        let c = reqwest::Client::new();
        let r = build(
            &c,
            req(
                "https://www.youtube.com/youtubei/v1/browse?alt=json",
                vec![("Origin", "tauri://localhost"), ("User-Agent", "tauri-plugin-http"), ("X-Goog-Visitor-Id", "abc"), ("Cookie", "x")],
            ),
        )
        .unwrap()
        .build()
        .unwrap();
        let h = r.headers();
        assert_eq!(h["origin"], "https://www.youtube.com");
        assert_eq!(h["referer"], "https://www.youtube.com/");
        assert!(h["user-agent"].to_str().unwrap().contains("Chrome/"));
        assert_eq!(h["x-goog-visitor-id"], "abc");
        assert!(h.get("cookie").is_none());
        assert_eq!(h.get_all("origin").iter().count(), 1);
        assert_eq!(r.method(), "POST");
    }

    #[test]
    fn music_host_uses_music_origin() {
        let c = reqwest::Client::new();
        let r = build(&c, req("https://music.youtube.com/youtubei/v1/search", vec![])).unwrap().build().unwrap();
        assert_eq!(r.headers()["origin"], "https://music.youtube.com");
    }

    #[test]
    fn refuses_other_hosts() {
        let c = reqwest::Client::new();
        for u in ["https://evil.com/x", "http://www.youtube.com/x", "https://www.youtube.com.evil.com/x", "file:///etc/passwd"] {
            assert!(build(&c, req(u, vec![])).is_err(), "{u}");
        }
    }

    #[test]
    fn decodes_base64() {
        assert_eq!(decode_b64("aGVsbG8=").unwrap(), b"hello");
        assert_eq!(decode_b64("AAEC").unwrap(), vec![0, 1, 2]);
        assert!(decode_b64("@@").is_err());
    }
}
