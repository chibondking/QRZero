//! Club Log's public Most Wanted list: DXCC entities ranked by how many Club Log users
//! still need them (1 is the most wanted). Used to rank the Needed now pane.
//!
//! Fetched at most once a day (one small request, never per spot) and kept in the log
//! database, so the ranks are there offline and after a restart. A failed fetch keeps the
//! old list and reports the error; without any list the ranks are just empty.

use std::collections::HashMap;
use std::sync::Mutex;
use std::time::{Duration, Instant};

use chrono::Utc;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use crate::station::Hub;

pub const DEFAULT_URL: &str = "https://clublog.org/mostwanted.php?api=1";
const CACHE_KEY: &str = "mostwanted.cache";
const REFRESH: Duration = Duration::from_secs(24 * 3600);
const RETRY: Duration = Duration::from_secs(30 * 60);

#[derive(Default, Serialize, Deserialize)]
struct Cache {
    fetched_at: i64,
    /// ADIF DXCC code to rank.
    ranks: HashMap<u32, u32>,
}

#[derive(Default)]
struct State {
    cache: Cache,
    error: Option<String>,
    last_attempt: Option<Instant>,
}

pub struct MostWanted {
    url: Mutex<String>,
    http: reqwest::Client,
    state: Mutex<State>,
    fetching: tokio::sync::Mutex<()>,
}

/// Reads Club Log's answer: a JSON object of rank to ADIF code, `{"1":"344","2":"123",...}`.
pub fn parse(text: &str) -> Result<HashMap<u32, u32>, String> {
    let v: HashMap<String, Value> = serde_json::from_str(text).map_err(|_| "Club Log's Most Wanted list was not in the expected form".to_string())?;
    let mut out = HashMap::new();
    for (rank, code) in v {
        let code = match &code {
            Value::String(s) => s.trim().parse::<u32>().ok(),
            Value::Number(n) => n.as_u64().map(|n| n as u32),
            _ => None,
        };
        if let (Ok(rank), Some(code)) = (rank.trim().parse::<u32>(), code) {
            out.insert(code, rank);
        }
    }
    if out.len() < 10 {
        return Err("Club Log's Most Wanted list had too few entries".into());
    }
    Ok(out)
}

impl MostWanted {
    pub fn new(cache: Option<String>) -> Self {
        MostWanted {
            url: Mutex::new(DEFAULT_URL.to_string()),
            http: reqwest::Client::builder()
                .timeout(Duration::from_secs(30))
                .user_agent(concat!("QRZero/", env!("CARGO_PKG_VERSION")))
                .build()
                .unwrap_or_default(),
            state: Mutex::new(State { cache: cache.and_then(|c| serde_json::from_str(&c).ok()).unwrap_or_default(), ..State::default() }),
            fetching: tokio::sync::Mutex::new(()),
        }
    }

    pub fn set_url(&self, url: String) {
        *self.url.lock().unwrap_or_else(|p| p.into_inner()) = url;
    }

    fn lock(&self) -> std::sync::MutexGuard<'_, State> {
        self.state.lock().unwrap_or_else(|p| p.into_inner())
    }

    /// How long until a fetch is due, or `None` when it is due now.
    fn due(&self) -> Option<Duration> {
        let st = self.lock();
        let wait = match st.last_attempt {
            Some(at) => {
                let w = if st.error.is_some() { RETRY } else { REFRESH };
                w.checked_sub(at.elapsed())
            }
            None if st.cache.ranks.is_empty() => None,
            None => {
                let age = Utc::now().timestamp() - st.cache.fetched_at;
                (age >= 0 && (age as u64) < REFRESH.as_secs()).then(|| REFRESH - Duration::from_secs(age as u64))
            }
        };
        wait.filter(|w| !w.is_zero())
    }

    pub fn view(&self) -> Value {
        let st = self.lock();
        let ranks: HashMap<String, u32> = st.cache.ranks.iter().map(|(k, v)| (k.to_string(), *v)).collect();
        json!({ "ranks": ranks, "fetched_at": (st.cache.fetched_at > 0).then_some(st.cache.fetched_at), "error": st.error })
    }
}

/// Reads the list if it is due and returns how long until the next background refresh.
pub async fn refresh(hub: &Hub) -> Duration {
    let m = &hub.mostwanted;
    if let Some(w) = m.due() {
        return w;
    }
    let _one = m.fetching.lock().await;
    if let Some(w) = m.due() {
        return w;
    }
    let url = m.url.lock().unwrap_or_else(|p| p.into_inner()).clone();
    let result = async {
        let resp = m.http.get(&url).send().await.map_err(|e| format!("could not reach Club Log's Most Wanted list: {e}"))?;
        if !resp.status().is_success() {
            return Err(format!("Club Log's Most Wanted list answered {}", resp.status()));
        }
        parse(&resp.text().await.map_err(|e| e.to_string())?)
    }
    .await;
    let save = {
        let mut st = m.lock();
        st.last_attempt = Some(Instant::now());
        match result {
            Ok(ranks) => {
                st.cache = Cache { fetched_at: Utc::now().timestamp(), ranks };
                st.error = None;
                serde_json::to_string(&st.cache).ok()
            }
            Err(e) => {
                // The error text never carries the URL.
                tracing::warn!("Most Wanted: {}", e.split(" (").next().unwrap_or(&e));
                st.error = Some(e.split(" (").next().unwrap_or(&e).to_string());
                None
            }
        }
    };
    if let Some(text) = save {
        if let Err(e) = hub.set_setting(CACHE_KEY, &text) {
            tracing::warn!("saving the Most Wanted list: {e}");
        }
    }
    if m.lock().error.is_some() {
        RETRY
    } else {
        REFRESH
    }
}

pub fn saved(get: impl Fn(&str) -> Option<String>) -> MostWanted {
    MostWanted::new(get(CACHE_KEY))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_the_list() {
        let text: String = format!("{{{}}}", (1..=12).map(|i| format!("\"{i}\":\"{}\"", 100 + i)).collect::<Vec<_>>().join(","));
        let r = parse(&text).unwrap();
        assert_eq!(r[&101], 1);
        assert_eq!(r[&112], 12);
    }

    #[test]
    fn rejects_junk() {
        assert!(parse("<html>").is_err());
        assert!(parse("{\"1\":\"344\"}").is_err());
    }
}
