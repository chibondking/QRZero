//! HamQTH XML callsign lookup (https://www.hamqth.com/developers.php).
//!
//! Free with a HamQTH account. Two calls on the same endpoint:
//!   auth   `?u=<user>&p=<pass>`              -> `<session><session_id>…`
//!   lookup `?id=<sid>&callsign=<c>&prg=<app>` -> `<search>…</search>`
//!
//! Both answer errors the same way, as `<session><error>…</error></session>`:
//!   "Wrong user name or password"       the login is wrong
//!   "Callsign not found"                not a failure: Ok(None)
//!   "Session does not exist or expired" log in again and retry once
//!
//! A session id lasts an hour; it is kept and refreshed a little early. Results
//! are mapped to ADIF field names, as in [`crate::qrz`], so either service can
//! fill the same QSO.

use std::collections::BTreeMap;

use quick_xml::events::Event;
use quick_xml::Reader;

use crate::adif::Fields;
use crate::error::{Error, Result};
use crate::qsl::net_reason;

pub const DEFAULT_ENDPOINT: &str = "https://www.hamqth.com/xml.php";

/// HamQTH expires a session after an hour; refresh a little before that.
const SESSION_TTL: std::time::Duration = std::time::Duration::from_secs(55 * 60);

/// How long a refused login is remembered, so a wrong password isn't retried on every call.
const LOGIN_BACKOFF: std::time::Duration = std::time::Duration::from_secs(60);

pub struct HamqthClient {
    http: reqwest::Client,
    endpoint: String,
    username: String,
    password: String,
    session: Option<(String, std::time::Instant)>,
    login_failure: Option<(std::time::Instant, String)>,
}

#[derive(Debug, Default)]
struct Response {
    session_id: Option<String>,
    error: Option<String>,
    search: BTreeMap<String, String>,
}

impl HamqthClient {
    pub fn new(endpoint: &str, username: &str, password: &str) -> Self {
        let http = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(8))
            .user_agent(concat!("QRZero/", env!("CARGO_PKG_VERSION")))
            .build()
            .expect("http client");
        HamqthClient {
            http,
            endpoint: endpoint.to_string(),
            username: username.to_string(),
            password: password.to_string(),
            session: None,
            login_failure: None,
        }
    }

    pub fn same_credentials(&self, username: &str, password: &str) -> bool {
        self.username == username && self.password == password
    }

    async fn login(&mut self) -> Result<String> {
        if let Some((at, msg)) = &self.login_failure {
            if at.elapsed() < LOGIN_BACKOFF {
                return Err(lookup_err(msg));
            }
        }
        let resp = self
            .get(&[("u", self.username.as_str()), ("p", self.password.as_str())])
            .await?;
        match resp.session_id {
            Some(id) => {
                self.session = Some((id.clone(), std::time::Instant::now()));
                self.login_failure = None;
                Ok(id)
            }
            None => {
                let msg = resp.error.unwrap_or_else(|| "login failed".into());
                self.login_failure = Some((std::time::Instant::now(), msg.clone()));
                Err(lookup_err(&msg))
            }
        }
    }

    /// The session id, logging in again when there is none or it is about to expire.
    async fn session_id(&mut self) -> Result<String> {
        match &self.session {
            Some((id, at)) if at.elapsed() < SESSION_TTL => Ok(id.clone()),
            _ => self.login().await,
        }
    }

    /// Checks the username and password by logging in.
    pub async fn test_login(&mut self) -> Result<()> {
        self.session = None;
        self.login_failure = None;
        self.login().await.map(|_| ())
    }

    /// Looks up a callsign. Returns Ok(None) when HamQTH has no record of it.
    pub async fn lookup(&mut self, call: &str) -> Result<Option<Fields>> {
        for attempt in 0..2 {
            let id = self.session_id().await?;
            let resp = self
                .get(&[("id", id.as_str()), ("callsign", call), ("prg", "QRZero")])
                .await?;
            if !resp.search.is_empty() {
                return Ok(Some(to_adif(&resp.search)));
            }
            let err = resp.error.unwrap_or_default();
            if err.to_lowercase().contains("not found") {
                return Ok(None);
            }
            // The session died inside the hour: log in again once.
            if err.to_lowercase().contains("session") {
                self.session = None;
                if attempt == 0 {
                    continue;
                }
            }
            return Err(lookup_err(if err.is_empty() { "no data returned" } else { &err }));
        }
        unreachable!()
    }

    async fn get(&self, query: &[(&str, &str)]) -> Result<Response> {
        let text = self
            .http
            .get(&self.endpoint)
            .query(query)
            .send()
            .await
            .and_then(|r| r.error_for_status())
            .map_err(|e| lookup_err(&format!("service unreachable ({})", net_reason(&e))))?
            .text()
            .await
            .map_err(|e| lookup_err(&format!("unreadable reply ({})", net_reason(&e))))?;
        parse_response(&text)
    }
}

/// A lookup error worded the same for every service, e.g. "HamQTH lookup failed: login failed".
fn lookup_err(reason: &str) -> Error {
    Error::Lookup(format!("HamQTH lookup failed: {reason}"))
}

fn parse_response(xml: &str) -> Result<Response> {
    let mut reader = Reader::from_str(xml);
    reader.config_mut().trim_text(true);
    let mut out = Response::default();
    let mut path: Vec<String> = Vec::new();
    loop {
        match reader.read_event() {
            Ok(Event::Start(e)) => path.push(String::from_utf8_lossy(e.local_name().as_ref()).to_lowercase()),
            Ok(Event::End(_)) => {
                path.pop();
            }
            Ok(Event::Text(t)) => {
                let text = t.decode().map(|c| c.into_owned()).unwrap_or_default();
                let text = quick_xml::escape::unescape(&text)
                    .map(|c| c.into_owned())
                    .unwrap_or(text);
                let n = path.len();
                if n >= 2 {
                    let (parent, name) = (&path[n - 2], &path[n - 1]);
                    match (parent.as_str(), name.as_str()) {
                        ("session", "session_id") => out.session_id = Some(text),
                        ("session", "error") => out.error = Some(text),
                        ("search", field) => {
                            out.search.insert(field.to_string(), text);
                        }
                        _ => {}
                    }
                }
            }
            Ok(Event::Eof) => break,
            Err(_) => return Err(lookup_err("unreadable reply")),
            _ => {}
        }
    }
    Ok(out)
}

/// Maps HamQTH's `<search>` field names to ADIF fields.
fn to_adif(q: &BTreeMap<String, String>) -> Fields {
    let mut f = Fields::new();
    let mut put = |k: &str, v: Option<&String>| {
        if let Some(v) = v.map(|s| s.trim()).filter(|s| !s.is_empty()) {
            f.insert(k.to_string(), v.to_string());
        }
    };
    put("CALL", q.get("callsign"));
    // `nick` is the name the operator goes by; `adr_name` is the one on the licence.
    put("NAME", q.get("nick").or(q.get("adr_name")));
    put("QTH", q.get("qth").or(q.get("adr_city")));
    put("STATE", q.get("us_state"));
    put("CNTY", q.get("us_county"));
    put("COUNTRY", q.get("country"));
    put("DXCC", q.get("adif"));
    put("CQZ", q.get("cq"));
    put("ITUZ", q.get("itu"));
    put("GRIDSQUARE", q.get("grid"));
    put("IOTA", q.get("iota"));
    put("EMAIL", q.get("email"));
    put("QSL_VIA", q.get("qsl_via"));
    // Extra details for display only; they start with "QRZ_" so the station panel shows them
    // whichever service they came from.
    put("QRZ_NICKNAME", q.get("nick"));
    put("QRZ_IMAGE", q.get("picture"));
    if let Some(lat) = q.get("latitude").and_then(|v| v.parse::<f64>().ok()) {
        f.insert("LAT".into(), adif_coord(lat, 'N', 'S'));
    }
    if let Some(lon) = q.get("longitude").and_then(|v| v.parse::<f64>().ok()) {
        f.insert("LON".into(), adif_coord(lon, 'E', 'W'));
    }
    f
}

/// ADIF location format: XDDD MM.MMM
fn adif_coord(v: f64, pos: char, neg: char) -> String {
    let hemi = if v < 0.0 { neg } else { pos };
    let v = v.abs();
    let deg = v.trunc();
    let min = (v - deg) * 60.0;
    format!("{hemi}{:03} {:06.3}", deg as i64, min)
}

#[cfg(test)]
mod tests {
    use super::*;

    const SAMPLE: &str = r#"<?xml version="1.0"?>
<HamQTH version="2.7" xmlns="https://www.hamqth.com">
  <search>
    <callsign>ok2cqr</callsign><nick>Petr</nick><qth>Neratovice</qth>
    <country>Czech Republic</country><adif>503</adif><itu>28</itu><cq>15</cq>
    <grid>jo70gg</grid><adr_name>Petr Hlozek</adr_name><adr_city>Neratovice</adr_city>
    <latitude>50.07</latitude><longitude>14.52</longitude><continent>EU</continent>
    <utc_offset>-1</utc_offset><picture>https://www.hamqth.com/userfiles/o/ok/ok2cqr/_profile/ok2cqr.jpg</picture>
  </search>
</HamQTH>"#;

    #[test]
    fn parses_search_record() {
        let r = parse_response(SAMPLE).unwrap();
        assert!(r.error.is_none());
        let f = to_adif(&r.search);
        assert_eq!(f["CALL"], "ok2cqr");
        assert_eq!(f["NAME"], "Petr");
        assert_eq!(f["QTH"], "Neratovice");
        assert_eq!(f["COUNTRY"], "Czech Republic");
        assert_eq!(f["DXCC"], "503");
        assert_eq!(f["CQZ"], "15");
        assert_eq!(f["ITUZ"], "28");
        assert_eq!(f["GRIDSQUARE"], "jo70gg");
        assert_eq!(f["LAT"], "N050 04.200");
        assert_eq!(f["LON"], "E014 31.200");
    }

    #[test]
    fn parses_session_id() {
        let r = parse_response(
            r#"<HamQTH><session><session_id>09b0ae90050be03c452ad235a1f2915ad684393c</session_id></session></HamQTH>"#,
        )
        .unwrap();
        assert_eq!(r.session_id.as_deref(), Some("09b0ae90050be03c452ad235a1f2915ad684393c"));
        assert!(r.search.is_empty());
    }

    #[test]
    fn parses_not_found() {
        let r = parse_response(r#"<HamQTH><session><error>Callsign not found</error></session></HamQTH>"#).unwrap();
        assert_eq!(r.error.as_deref(), Some("Callsign not found"));
        assert!(r.search.is_empty());
        assert!(r.error.unwrap().to_lowercase().contains("not found"));
    }

    #[test]
    fn parses_bad_login() {
        let r = parse_response(r#"<HamQTH><session><error>Wrong user name or password</error></session></HamQTH>"#).unwrap();
        assert_eq!(r.error.as_deref(), Some("Wrong user name or password"));
        assert!(r.session_id.is_none());
    }

    #[test]
    fn us_fields_fill_state_and_county() {
        let r = parse_response(
            r#"<HamQTH><search><callsign>w1aw</callsign><us_state>CT</us_state><us_county>Hartford</us_county><country>United States</country></search></HamQTH>"#,
        )
        .unwrap();
        let f = to_adif(&r.search);
        assert_eq!(f["STATE"], "CT");
        assert_eq!(f["CNTY"], "Hartford");
        assert!(!f.contains_key("GRIDSQUARE"));
    }

    #[tokio::test]
    async fn unreachable_error_hides_credentials() {
        // Nothing listens on port 1, so the request fails to connect.
        let mut c = HamqthClient::new("http://127.0.0.1:1/xml?key=SECRETKEY", "W1AW", "hunter2");
        let msg = c.lookup("K1ABC").await.unwrap_err().to_string();
        assert_eq!(msg, "HamQTH lookup failed: service unreachable (connection failed)");
        assert!(!msg.contains("hunter2") && !msg.contains("SECRETKEY") && !msg.contains("127.0.0.1"));
    }
}
