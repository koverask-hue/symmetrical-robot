//! Local audio proxy on 127.0.0.1.
//!
//! The webview plays `http://127.0.0.1:<port>/<token>/stream/<id>`; this server
//! resolves the id lazily, forwards Range requests to googlevideo with the headers
//! yt-dlp says are required, and adds CORS headers so Web Audio can analyse the
//! stream for the visuals. Expired URLs are re-resolved transparently.

use std::future::Future;
use std::net::SocketAddr;
use std::sync::Arc;

use axum::body::Body;
use axum::extract::{Path, Query, State};
use axum::http::{header, HeaderMap, HeaderValue, Method, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::routing::get;
use axum::Router;
use futures_util::TryStreamExt;
use serde::Deserialize;

use crate::ytdlp::{Resolved, Resolver};

pub trait Resolve: Send + Sync + 'static {
    fn resolve(&self, id: &str) -> impl Future<Output = Result<Resolved, String>> + Send;
    fn invalidate(&self, id: &str) -> impl Future<Output = ()> + Send;
}

impl Resolve for Resolver {
    fn resolve(&self, id: &str) -> impl Future<Output = Result<Resolved, String>> + Send {
        Resolver::resolve(self, id)
    }
    fn invalidate(&self, id: &str) -> impl Future<Output = ()> + Send {
        Resolver::invalidate(self, id)
    }
}

struct Ctx<R> {
    token: String,
    resolver: Arc<R>,
    http: reqwest::Client,
}

#[derive(Deserialize)]
struct Params {
    fresh: Option<String>,
}

/// Response headers passed through from upstream.
const PASS: [header::HeaderName; 5] =
    [header::CONTENT_TYPE, header::CONTENT_LENGTH, header::CONTENT_RANGE, header::ACCEPT_RANGES, header::LAST_MODIFIED];

/// Starts the proxy and returns its base URL (`http://127.0.0.1:<port>/<token>`).
pub async fn start<R: Resolve>(resolver: Arc<R>) -> std::io::Result<String> {
    let token = uuid::Uuid::new_v4().simple().to_string();
    let ctx = Arc::new(Ctx {
        token: token.clone(),
        resolver,
        http: reqwest::Client::builder().build().expect("http client"),
    });
    let app = Router::new()
        .route("/{token}/stream/{id}", get(stream::<R>).head(stream::<R>))
        .with_state(ctx);
    let listener = tokio::net::TcpListener::bind(SocketAddr::from(([127, 0, 0, 1], 0))).await?;
    let port = listener.local_addr()?.port();
    tokio::spawn(async move {
        if let Err(e) = axum::serve(listener, app).await {
            log::error!("audio proxy stopped: {e}");
        }
    });
    Ok(format!("http://127.0.0.1:{port}/{token}"))
}

fn cors(mut res: Response) -> Response {
    let h = res.headers_mut();
    h.insert(header::ACCESS_CONTROL_ALLOW_ORIGIN, HeaderValue::from_static("*"));
    h.insert(header::ACCESS_CONTROL_EXPOSE_HEADERS, HeaderValue::from_static("content-length, content-range, accept-ranges"));
    h.insert(header::CACHE_CONTROL, HeaderValue::from_static("no-store"));
    res
}

fn error(status: StatusCode, msg: impl Into<String>) -> Response {
    cors((status, msg.into()).into_response())
}

async fn stream<R: Resolve>(
    State(ctx): State<Arc<Ctx<R>>>,
    Path((token, id)): Path<(String, String)>,
    Query(params): Query<Params>,
    method: Method,
    headers: HeaderMap,
) -> Response {
    // The random token keeps other local software from using the proxy.
    if token != ctx.token {
        return error(StatusCode::NOT_FOUND, "not found");
    }
    if params.fresh.is_some() {
        ctx.resolver.invalidate(&id).await;
    }
    let range = headers.get(header::RANGE).cloned();

    for attempt in 0..2 {
        let resolved = match ctx.resolver.resolve(&id).await {
            Ok(r) => r,
            Err(e) => return error(StatusCode::BAD_GATEWAY, e),
        };
        let mut req = ctx.http.request(method.clone(), &resolved.url);
        for (k, v) in &resolved.headers {
            req = req.header(k.as_str(), v.as_str());
        }
        if let Some(r) = &range {
            req = req.header(header::RANGE, r.clone());
        }
        let upstream = match req.send().await {
            Ok(r) => r,
            Err(e) => return error(StatusCode::BAD_GATEWAY, format!("upstream: {e}")),
        };
        let status = upstream.status();
        // 403/410: the signed URL expired or was bound to another session. Re-resolve once.
        if attempt == 0 && (status == StatusCode::FORBIDDEN || status == StatusCode::GONE) {
            ctx.resolver.invalidate(&id).await;
            continue;
        }
        let mut res = Response::builder().status(status);
        for name in PASS {
            if let Some(v) = upstream.headers().get(&name) {
                res = res.header(name, v);
            }
        }
        let body = if method == Method::HEAD {
            Body::empty()
        } else {
            Body::from_stream(upstream.bytes_stream().map_err(std::io::Error::other))
        };
        return cors(res.body(body).unwrap_or_else(|_| StatusCode::INTERNAL_SERVER_ERROR.into_response()));
    }
    error(StatusCode::BAD_GATEWAY, "stream unavailable")
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ytdlp::parse_info;
    use std::sync::atomic::{AtomicUsize, Ordering};

    /// Upstream that serves 0..=255 with Range support, requires a header, and
    /// rejects the "/old" path with 403 to simulate an expired URL.
    async fn fake_upstream() -> String {
        async fn serve(Path(p): Path<String>, headers: HeaderMap) -> Response {
            if p == "old" {
                return StatusCode::FORBIDDEN.into_response();
            }
            if headers.get("x-required").is_none() {
                return StatusCode::UNAUTHORIZED.into_response();
            }
            let data: Vec<u8> = (0..=255u8).collect();
            if let Some(r) = headers.get(header::RANGE).and_then(|v| v.to_str().ok()) {
                let spec = r.trim_start_matches("bytes=");
                let (a, b) = spec.split_once('-').unwrap();
                let a: usize = a.parse().unwrap();
                let b: usize = if b.is_empty() { 255 } else { b.parse().unwrap() };
                return Response::builder()
                    .status(StatusCode::PARTIAL_CONTENT)
                    .header(header::CONTENT_TYPE, "audio/webm")
                    .header(header::CONTENT_RANGE, format!("bytes {a}-{b}/256"))
                    .header(header::ACCEPT_RANGES, "bytes")
                    .body(Body::from(data[a..=b].to_vec()))
                    .unwrap();
            }
            Response::builder().header(header::CONTENT_TYPE, "audio/webm").body(Body::from(data)).unwrap()
        }
        let app = Router::new().route("/{p}", get(serve));
        let l = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let port = l.local_addr().unwrap().port();
        tokio::spawn(async move { axum::serve(l, app).await.unwrap() });
        format!("http://127.0.0.1:{port}")
    }

    struct Fake {
        base: String,
        calls: AtomicUsize,
        /// First resolution returns an expired URL.
        stale_first: bool,
    }

    impl Resolve for Fake {
        fn resolve(&self, id: &str) -> impl Future<Output = Result<Resolved, String>> + Send {
            let n = self.calls.fetch_add(1, Ordering::SeqCst);
            let path = if self.stale_first && n == 0 { "old" } else { "new" };
            let out = if id == "missing0000" {
                Err("Video unavailable".to_string())
            } else {
                let json = serde_json::json!({ "url": format!("{}/{path}", self.base), "http_headers": { "x-required": "1" } });
                parse_info(json.to_string().as_bytes())
            };
            async move { out }
        }
        async fn invalidate(&self, _: &str) {}
    }

    async fn setup(stale_first: bool) -> (String, Arc<Fake>) {
        let base = fake_upstream().await;
        let fake = Arc::new(Fake { base, calls: AtomicUsize::new(0), stale_first });
        (start(fake.clone()).await.unwrap(), fake)
    }

    #[tokio::test]
    async fn forwards_ranges_with_cors_and_required_headers() {
        let (proxy, _) = setup(false).await;
        let c = reqwest::Client::new();
        let r = c.get(format!("{proxy}/stream/abcdefghijk")).header("range", "bytes=10-19").send().await.unwrap();
        assert_eq!(r.status(), 206);
        assert_eq!(r.headers()["access-control-allow-origin"], "*");
        assert_eq!(r.headers()["content-range"], "bytes 10-19/256");
        assert_eq!(r.headers()["content-type"], "audio/webm");
        assert_eq!(r.bytes().await.unwrap().to_vec(), (10..=19u8).collect::<Vec<_>>());

        let full = c.get(format!("{proxy}/stream/abcdefghijk")).send().await.unwrap();
        assert_eq!(full.status(), 200);
        assert_eq!(full.bytes().await.unwrap().len(), 256);
    }

    #[tokio::test]
    async fn rejects_wrong_token() {
        let (proxy, _) = setup(false).await;
        let wrong = format!("{}/nottoken/stream/abcdefghijk", proxy.rsplit_once('/').unwrap().0);
        assert_eq!(reqwest::get(wrong).await.unwrap().status(), 404);
    }

    #[tokio::test]
    async fn re_resolves_expired_urls_once() {
        let (proxy, fake) = setup(true).await;
        let r = reqwest::get(format!("{proxy}/stream/abcdefghijk")).await.unwrap();
        assert_eq!(r.status(), 200);
        assert_eq!(fake.calls.load(Ordering::SeqCst), 2);
    }

    #[tokio::test]
    async fn reports_resolver_errors() {
        let (proxy, _) = setup(false).await;
        let r = reqwest::get(format!("{proxy}/stream/missing0000")).await.unwrap();
        assert_eq!(r.status(), 502);
        assert_eq!(r.text().await.unwrap(), "Video unavailable");
    }
}
