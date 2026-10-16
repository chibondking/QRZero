//! Log statistics: DXCC progress by year, confirmation rates by service and the most-worked
//! entities and callsigns. Pure logic, no database; the store feeds one [`StatsQso`] per QSO.

use std::collections::{BTreeMap, HashMap};

use chrono::{DateTime, Datelike};

/// How many rows the most-worked lists hold.
pub const TOP: usize = 10;

/// One QSO's facts for the statistics.
#[derive(Clone, Debug, Default)]
pub struct StatsQso {
    pub call: String,
    /// Unix seconds, UTC.
    pub time_on: i64,
    pub dxcc: Option<u32>,
    pub lotw_sent: bool,
    pub lotw: bool,
    pub paper_sent: bool,
    pub paper: bool,
    pub qrz_sent: bool,
    pub qrz: bool,
    pub clublog_sent: bool,
    pub clublog: bool,
    pub eqsl_sent: bool,
    pub eqsl: bool,
}

#[derive(Clone, Debug, Default, PartialEq, Eq, serde::Serialize)]
pub struct YearRow {
    pub year: i32,
    pub qsos: usize,
    /// Entities first worked this year.
    pub new_entities: usize,
    /// Entities worked up to and including this year.
    pub total_entities: usize,
}

#[derive(Clone, Debug, Default, PartialEq, Eq, serde::Serialize)]
pub struct ServiceRow {
    pub name: String,
    /// QSOs sent to the service (a confirmed QSO counts as sent).
    pub sent: usize,
    pub confirmed: usize,
}

#[derive(Clone, Debug, Default, PartialEq, Eq, serde::Serialize)]
pub struct Ranked {
    pub name: String,
    pub qsos: usize,
}

#[derive(Clone, Debug, Default, serde::Serialize)]
pub struct Stats {
    pub total_qsos: usize,
    pub unique_calls: usize,
    pub entities_worked: usize,
    /// Entities with a LoTW or paper confirmation (the awards' default sources).
    pub entities_confirmed: usize,
    pub years: Vec<YearRow>,
    pub services: Vec<ServiceRow>,
    pub top_entities: Vec<Ranked>,
    pub top_calls: Vec<Ranked>,
    /// The summary as plain text, ready to copy.
    pub text: String,
}

/// Counts QSOs as they stream by.
#[derive(Default)]
pub struct StatsTally {
    total: usize,
    calls: HashMap<String, usize>,
    /// Per entity: QSO count, first year, confirmed.
    entities: HashMap<u32, (usize, i32, bool)>,
    years: BTreeMap<i32, usize>,
    /// (sent, confirmed) for LoTW, paper, QRZ, Club Log and eQSL.
    services: [(usize, usize); 5],
}

impl StatsTally {
    pub fn add(&mut self, q: &StatsQso) {
        self.total += 1;
        let year = DateTime::from_timestamp(q.time_on, 0).map_or(1970, |d| d.year());
        *self.years.entry(year).or_default() += 1;
        if !q.call.is_empty() {
            match self.calls.get_mut(&q.call) {
                Some(n) => *n += 1,
                None => {
                    self.calls.insert(q.call.clone(), 1);
                }
            }
        }
        if let Some(d) = q.dxcc {
            let e = self.entities.entry(d).or_insert((0, year, false));
            e.0 += 1;
            e.1 = e.1.min(year);
            e.2 |= q.lotw || q.paper;
        }
        let flags = [(q.lotw_sent, q.lotw), (q.paper_sent, q.paper), (q.qrz_sent, q.qrz), (q.clublog_sent, q.clublog), (q.eqsl_sent, q.eqsl)];
        for (s, (sent, got)) in self.services.iter_mut().zip(flags) {
            s.0 += usize::from(sent || got);
            s.1 += usize::from(got);
        }
    }

    /// The finished statistics. `names` maps DXCC numbers to entity names.
    pub fn finish(self, names: &BTreeMap<u32, String>) -> Stats {
        let mut new_by_year: BTreeMap<i32, usize> = BTreeMap::new();
        for (_, year, _) in self.entities.values() {
            *new_by_year.entry(*year).or_default() += 1;
        }
        let mut total_entities = 0;
        let years: Vec<YearRow> = self
            .years
            .iter()
            .map(|(&year, &qsos)| {
                let new_entities = new_by_year.get(&year).copied().unwrap_or(0);
                total_entities += new_entities;
                YearRow { year, qsos, new_entities, total_entities }
            })
            .collect();
        let labels = ["LoTW", "Paper QSL", "QRZ Logbook", "Club Log", "eQSL"];
        let services = labels
            .iter()
            .zip(self.services)
            .map(|(n, (sent, confirmed))| ServiceRow { name: (*n).into(), sent, confirmed })
            .collect();
        let top = |mut v: Vec<Ranked>| {
            v.sort_by(|a, b| b.qsos.cmp(&a.qsos).then_with(|| a.name.cmp(&b.name)));
            v.truncate(TOP);
            v
        };
        let top_entities = top(
            self.entities
                .iter()
                .map(|(d, (n, _, _))| Ranked { name: names.get(d).cloned().unwrap_or_else(|| format!("DXCC {d}")), qsos: *n })
                .collect(),
        );
        let top_calls = top(self.calls.iter().map(|(c, n)| Ranked { name: c.clone(), qsos: *n }).collect());
        let mut s = Stats {
            total_qsos: self.total,
            unique_calls: self.calls.len(),
            entities_worked: self.entities.len(),
            entities_confirmed: self.entities.values().filter(|e| e.2).count(),
            years,
            services,
            top_entities,
            top_calls,
            text: String::new(),
        };
        s.text = s.render();
        s
    }
}

impl Stats {
    fn render(&self) -> String {
        use std::fmt::Write;
        let mut o = String::new();
        let _ = writeln!(o, "QSOs: {}   Callsigns: {}", self.total_qsos, self.unique_calls);
        let _ = writeln!(o, "DXCC entities: {} worked, {} confirmed (LoTW or paper)\n", self.entities_worked, self.entities_confirmed);
        let _ = writeln!(o, "DXCC progress by year\n{:<6} {:>8} {:>6} {:>7}", "Year", "QSOs", "New", "Total");
        for y in &self.years {
            let _ = writeln!(o, "{:<6} {:>8} {:>6} {:>7}", y.year, y.qsos, y.new_entities, y.total_entities);
        }
        let _ = writeln!(o, "\nConfirmation rates\n{:<12} {:>8} {:>10} {:>6}", "Service", "Sent", "Confirmed", "Rate");
        for s in &self.services {
            let rate = if s.sent == 0 { "-".to_string() } else { format!("{:.1}%", s.confirmed as f64 * 100.0 / s.sent as f64) };
            let _ = writeln!(o, "{:<12} {:>8} {:>10} {:>6}", s.name, s.sent, s.confirmed, rate);
        }
        let _ = writeln!(o, "\nMost worked entities");
        for (i, r) in self.top_entities.iter().enumerate() {
            let _ = writeln!(o, "{:>2}. {:<32} {:>7}", i + 1, r.name, r.qsos);
        }
        let _ = writeln!(o, "\nMost worked callsigns");
        for (i, r) in self.top_calls.iter().enumerate() {
            let _ = writeln!(o, "{:>2}. {:<32} {:>7}", i + 1, r.name, r.qsos);
        }
        o
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn q(call: &str, ymd: (i32, u32, u32), dxcc: u32) -> StatsQso {
        let t = chrono::NaiveDate::from_ymd_opt(ymd.0, ymd.1, ymd.2).unwrap().and_hms_opt(12, 0, 0).unwrap().and_utc().timestamp();
        StatsQso { call: call.into(), time_on: t, dxcc: Some(dxcc), ..Default::default() }
    }

    #[test]
    fn counts_years_entities_and_rates() {
        let mut t = StatsTally::default();
        let mut a = q("K1ABC", (2023, 5, 1), 291);
        a.lotw_sent = true;
        a.lotw = true;
        let mut b = q("K1ABC", (2024, 5, 1), 291);
        b.lotw_sent = true;
        let mut c = q("DL1X", (2024, 6, 1), 230);
        c.paper = true;
        c.clublog_sent = true;
        for x in [&a, &b, &c] {
            t.add(x);
        }
        let names = BTreeMap::from([(291, "United States".to_string())]);
        let s = t.finish(&names);
        assert_eq!(s.years.iter().map(|y| (y.year, y.qsos, y.new_entities, y.total_entities)).collect::<Vec<_>>(), [(2023, 1, 1, 1), (2024, 2, 1, 2)]);
        assert_eq!((s.entities_worked, s.entities_confirmed, s.unique_calls), (2, 2, 2));
        assert_eq!((s.services[0].sent, s.services[0].confirmed), (2, 1));
        assert_eq!((s.services[1].sent, s.services[1].confirmed), (1, 1));
        assert_eq!((s.services[3].sent, s.services[3].confirmed), (1, 0));
        assert_eq!(s.top_entities[0], Ranked { name: "United States".into(), qsos: 2 });
        assert_eq!(s.top_entities[1].name, "DXCC 230");
        assert_eq!(s.top_calls[0], Ranked { name: "K1ABC".into(), qsos: 2 });
        assert!(s.text.contains("50.0%") && s.text.contains("2024"));
    }

    #[test]
    fn empty_log_renders() {
        let s = StatsTally::default().finish(&BTreeMap::new());
        assert_eq!(s.total_qsos, 0);
        assert!(s.text.contains("Most worked callsigns"));
    }
}
