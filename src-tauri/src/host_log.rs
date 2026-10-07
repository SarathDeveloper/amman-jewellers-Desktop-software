//! Host-level crash reporting.
//!
//! The web layer reports its own problems to the API sidecar, which owns
//! `logs/` and issues `JTP-ERR-<date>-<seq>` reference IDs. Failures the web
//! layer cannot observe — a WebView2 process dying, or the API sidecar exiting
//! — are seen here instead and forwarded to that same logger, so they land in
//! `logs/crash.log` next to everything else.
//!
//! When the API is unreachable, which is exactly the case once the sidecar has
//! died, we append to `logs/crash.log` ourselves and issue a
//! `JTP-HOST-<date>-<seq>` reference ID from a counter file of our own. A
//! separate sequence keeps the two writers from ever issuing the same ID.

use std::fs;
use std::io::{Read, Write};
use std::net::TcpStream;
use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};

/// Mirrors the one-previous-copy rotation used by the server logger.
const MAX_LOG_BYTES: u64 = 1024 * 1024;
const HTTP_TIMEOUT: Duration = Duration::from_millis(2000);

/// What the API answers after it has logged a host crash.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ApiAck {
    pub reference_id: String,
}

#[derive(Default, Serialize, Deserialize)]
struct HostSeq {
    date: String,
    seq: u32,
}

/// Converts days since 1970-01-01 into a civil `(year, month, day)` date.
///
/// Howard Hinnant's `civil_from_days`, the inverse of `days_from_civil`.
/// Kept local so the desktop shell needs no date dependency.
fn civil_from_days(days: i64) -> (i64, u32, u32) {
    let z = days + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = (z - era * 146_097) as u64; // [0, 146096]
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365; // [0, 399]
    let year = yoe as i64 + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100); // [0, 365]
    let mp = (5 * doy + 2) / 153; // [0, 11]
    let day = (doy - (153 * mp + 2) / 5 + 1) as u32; // [1, 31]
    let month = (if mp < 10 { mp + 3 } else { mp - 9 }) as u32; // [1, 12]
    (if month <= 2 { year + 1 } else { year }, month, day)
}

/// UTC parts of `millis_since_epoch`: year, month, day, hour, minute, second, ms.
fn utc_parts(millis_since_epoch: u128) -> (i64, u32, u32, u32, u32, u32, u32) {
    let seconds = (millis_since_epoch / 1000) as i64;
    let millis = (millis_since_epoch % 1000) as u32;
    let days = seconds.div_euclid(86_400);
    let second_of_day = seconds.rem_euclid(86_400);
    let (year, month, day) = civil_from_days(days);
    (
        year,
        month,
        day,
        (second_of_day / 3600) as u32,
        ((second_of_day % 3600) / 60) as u32,
        (second_of_day % 60) as u32,
        millis,
    )
}

fn utc_now() -> (i64, u32, u32, u32, u32, u32, u32) {
    let millis = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|elapsed| elapsed.as_millis())
        .unwrap_or(0);
    utc_parts(millis)
}

/// `2026-10-07T10:51:46.650Z`
pub fn utc_timestamp() -> String {
    let (year, month, day, hour, minute, second, millis) = utc_now();
    format!("{year:04}-{month:02}-{day:02}T{hour:02}:{minute:02}:{second:02}.{millis:03}Z")
}

/// `20261007`
fn utc_date_stamp() -> String {
    let (year, month, day, ..) = utc_now();
    format!("{year:04}{month:02}{day:02}")
}

pub fn logs_dir(data_dir: &Path) -> PathBuf {
    data_dir.join("logs")
}

fn rotate_if_needed(file: &Path) {
    let Ok(metadata) = fs::metadata(file) else {
        return;
    };
    if metadata.len() < MAX_LOG_BYTES {
        return;
    }
    let rotated = file.with_file_name(format!(
        "{}.1",
        file.file_name().and_then(|name| name.to_str()).unwrap_or("crash.log")
    ));
    let _ = fs::remove_file(&rotated);
    let _ = fs::rename(file, rotated);
}

fn append_line(file: &Path, line: &str) {
    if let Some(parent) = file.parent() {
        let _ = fs::create_dir_all(parent);
    }
    rotate_if_needed(file);
    if let Ok(mut handle) = fs::OpenOptions::new().create(true).append(true).open(file) {
        let _ = handle.write_all(line.as_bytes());
    }
}

fn next_host_reference_id(logs: &Path) -> String {
    let date = utc_date_stamp();
    let path = logs.join("host-error-seq.json");
    let mut state: HostSeq = fs::read_to_string(&path)
        .ok()
        .and_then(|text| serde_json::from_str(&text).ok())
        .unwrap_or_default();
    if state.date != date {
        state = HostSeq { date: date.clone(), seq: 0 };
    }
    state.seq += 1;
    if let Ok(text) = serde_json::to_string(&state) {
        let _ = fs::create_dir_all(logs);
        let _ = fs::write(&path, text);
    }
    format!("JTP-HOST-{date}-{:03}", state.seq)
}

/// Writes a crash line for a failure the API cannot log, because it is down.
///
/// Returns the `JTP-HOST-…` reference ID written with it.
pub fn log_host_crash(data_dir: &Path, message: &str) -> String {
    let logs = logs_dir(data_dir);
    let reference_id = next_host_reference_id(&logs);
    let line = format!("[{}] {} {}\n", utc_timestamp(), reference_id, message);
    append_line(&logs.join("crash.log"), &line);
    reference_id
}

/// Sends one JSON request to the local API and returns the response body.
///
/// A hand-rolled request keeps the desktop shell free of an HTTP client; it is
/// only ever used for loopback calls to the sidecar we started ourselves.
fn post_json(port: u16, path: &str, body: &str) -> Option<String> {
    let address = ("127.0.0.1", port);
    let mut stream = TcpStream::connect(address).ok()?;
    let _ = stream.set_read_timeout(Some(HTTP_TIMEOUT));
    let _ = stream.set_write_timeout(Some(HTTP_TIMEOUT));
    let request = format!(
        "POST {path} HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
        body.len()
    );
    stream.write_all(request.as_bytes()).ok()?;
    let mut response = String::new();
    stream.read_to_string(&mut response).ok()?;
    let (head, payload) = response.split_once("\r\n\r\n")?;
    if !head.starts_with("HTTP/1.1 200") {
        return None;
    }
    Some(payload.to_string())
}

/// Reports a renderer failure to the API so it gets a `JTP-ERR-…` reference ID.
///
/// `fatal` marks a crash the app could not recover from, which the API records
/// so the next launch can show what happened.
pub fn report_to_api(port: u16, message: &str, detail: &str, fatal: bool) -> Option<ApiAck> {
    let body = serde_json::json!({
        "message": message,
        "detail": detail,
        "fatal": fatal,
    })
    .to_string();
    let payload = post_json(port, "/api/diagnostics/host", &body)?;
    serde_json::from_str::<ApiAck>(&payload).ok()
}

#[cfg(test)]
mod tests {
    use super::{civil_from_days, utc_parts};

    #[test]
    fn converts_known_epochs_to_civil_dates() {
        assert_eq!(civil_from_days(0), (1970, 1, 1));
        assert_eq!(civil_from_days(19_723), (2024, 1, 1));
        assert_eq!(civil_from_days(-1), (1969, 12, 31));
    }

    #[test]
    fn formats_utc_parts_for_a_known_instant() {
        // 2026-10-07T10:51:46.650Z
        let millis = 1_791_370_306_650_u128;
        assert_eq!(utc_parts(millis), (2026, 10, 7, 10, 51, 46, 650));
    }
}
