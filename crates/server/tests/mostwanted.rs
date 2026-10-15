//! The Most Wanted list: fetched from a stand-in for Club Log, served as entity code to rank.

use axum::{routing::get, Router};
use qrzero_server::{start, Config};
use serde_json::Value;
use tokio::net::TcpListener;

#[tokio::test]
async fn ranks_come_from_the_list() {
    let list = format!("{{{}}}", (1..=12).map(|i| format!("\"{i}\":\"{}\"", 300 + i)).collect::<Vec<_>>().join(","));
    let app = Router::new().route("/mw", get(move || async move { list.clone() })).route("/bad", get(|| async { "not json" }));
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();
    tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });

    let dir = tempfile::tempdir().unwrap();
    let mut cfg = Config::local(dir.path().to_path_buf());
    cfg.secret_service = format!("QRZero-test-{}", std::process::id());
    cfg.update_cty = false;
    cfg.mostwanted_url = format!("http://{addr}/mw");
    let running = start(cfg).await.unwrap();
    let base = format!("http://{}/api", running.addr);
    let http = reqwest::Client::new();
    let call = |m: reqwest::Method, path: &str| {
        let req = http.request(m, format!("{base}{path}")).header("x-qrzero-token", &running.token);
        async move { req.send().await.unwrap().json::<Value>().await.unwrap() }
    };

    let before = call(reqwest::Method::GET, "/mostwanted").await;
    assert_eq!(before["ranks"].as_object().unwrap().len(), 0, "nothing fetched yet");
    let after = call(reqwest::Method::POST, "/mostwanted/refresh").await;
    assert_eq!(after["ranks"]["301"], 1);
    assert_eq!(after["ranks"]["312"], 12);
    assert!(after["error"].is_null());
    assert!(after["fetched_at"].is_i64());
}
