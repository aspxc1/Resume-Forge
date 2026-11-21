use crate::resume::PageSize;
use base64::{engine::general_purpose::STANDARD, Engine};
use std::{
    env, fs,
    io::Write,
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    time::{Duration, Instant},
};

const PRINT_CSS: &str = include_str!("../../src/paper.css");
const FONTS: [(u16, &str, &[u8]); 4] = [
    (
        400,
        "normal",
        include_bytes!("../../public/fonts/lmroman10-regular.woff2"),
    ),
    (
        700,
        "normal",
        include_bytes!("../../public/fonts/lmroman10-bold.woff2"),
    ),
    (
        400,
        "italic",
        include_bytes!("../../public/fonts/lmroman10-italic.woff2"),
    ),
    (
        700,
        "italic",
        include_bytes!("../../public/fonts/lmroman10-bolditalic.woff2"),
    ),
];

pub fn print_html(page: &PageSize, markup: &str) -> String {
    let fonts = FONTS.iter().map(|(weight, style, bytes)| format!(
        "@font-face{{font-family:'Latin Modern Roman';font-weight:{weight};font-style:{style};src:url(data:font/woff2;base64,{}) format('woff2');}}",
        STANDARD.encode(bytes)
    )).collect::<String>();
    format!(
        r#"<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; font-src data:; base-uri 'none'; form-action 'none'">
<title>Resume</title><style>@page{{size:{};margin:0}}html,body{{margin:0;padding:0}}{fonts}{PRINT_CSS}</style></head><body>{markup}</body></html>"#,
        page.css()
    )
}

fn on_path(name: &str) -> Option<PathBuf> {
    env::split_paths(&env::var_os("PATH")?)
        .map(|dir| dir.join(name))
        .find(|path| path.is_file())
}

pub fn pdflatex(explicit: Option<&str>) -> Option<PathBuf> {
    if let Some(path) = explicit.filter(|s| !s.trim().is_empty()) {
        let path = PathBuf::from(path);
        return (path.is_absolute() && path.is_file()).then_some(path);
    }
    on_path(if cfg!(windows) {
        "pdflatex.exe"
    } else {
        "pdflatex"
    })
}

fn browser() -> Option<PathBuf> {
    if cfg!(windows) {
        for (vendor, executable) in [
            ("Microsoft/Edge/Application", "msedge.exe"),
            ("Google/Chrome/Application", "chrome.exe"),
        ] {
            for var in [
                "ProgramFiles(x86)",
                "ProgramFiles",
                "ProgramW6432",
                "LOCALAPPDATA",
            ] {
                if let Some(root) = env::var_os(var) {
                    let candidate = PathBuf::from(root).join(vendor).join(executable);
                    if candidate.is_file() {
                        return Some(candidate);
                    }
                }
            }
            if let Some(path) = on_path(executable) {
                return Some(path);
            }
        }
        None
    } else {
        ["microsoft-edge", "chromium", "google-chrome"]
            .into_iter()
            .find_map(on_path)
    }
}

#[derive(Clone, Copy)]
pub enum EngineChoice<'a> {
    Builtin,
    Latex(Option<&'a str>),
}

pub fn render(
    page: &PageSize,
    markup: &str,
    tex: &str,
    engine: EngineChoice<'_>,
) -> Result<Vec<u8>, String> {
    let temp = tempfile::tempdir().map_err(|e| e.to_string())?;
    let log = temp.path().join("render.log");
    let output = temp.path().join("resume.pdf");
    let mut command = match engine {
        EngineChoice::Builtin => {
            let browser = browser().ok_or("Microsoft Edge or Chrome could not be located")?;
            let sheet = temp.path().join("resume.html");
            fs::write(&sheet, print_html(page, markup)).map_err(|e| e.to_string())?;
            let file =
                url::Url::from_file_path(&sheet).map_err(|_| "Invalid path to print sheet")?;
            let profile = temp.path().join("browser");
            let mut cmd = Command::new(browser);
            cmd.args([
                "--headless=new",
                "--disable-gpu",
                "--no-pdf-header-footer",
                "--disable-background-networking",
                "--disable-component-update",
                "--no-first-run",
                "--disable-extensions",
            ]);
            cmd.arg(path_option("--user-data-dir=", &profile))
                .arg(path_option("--print-to-pdf=", &output))
                .arg(file.as_str());
            cmd
        }
        EngineChoice::Latex(explicit) => {
            let executable = pdflatex(explicit)
                .ok_or("pdflatex could not be located. Check the executable path in Settings.")?;
            fs::write(temp.path().join("resume.tex"), tex).map_err(|e| e.to_string())?;
            let mut cmd = Command::new(executable);
            cmd.args([
                "-no-shell-escape",
                "-halt-on-error",
                "-interaction=nonstopmode",
                "-file-line-error",
                "resume.tex",
            ])
            .env("openin_any", "p")
            .env("openout_any", "p");
            cmd
        }
    };
    run_renderer(
        command.current_dir(temp.path()),
        &log,
        Duration::from_secs(45),
    )?;
    let bytes = fs::read(&output)
        .map_err(|_| format!("The PDF renderer produced no output.\n{}", log_tail(&log)))?;
    if !bytes.starts_with(b"%PDF-") {
        return Err("The renderer did not produce a valid PDF".into());
    }
    Ok(bytes)
}

fn path_option(prefix: &str, path: &Path) -> std::ffi::OsString {
    let mut option = std::ffi::OsString::from(prefix);
    option.push(path);
    option
}

fn log_tail(path: &Path) -> String {
    let bytes = fs::read(path).unwrap_or_default();
    String::from_utf8_lossy(&bytes[bytes.len().saturating_sub(3600)..])
        .trim()
        .to_owned()
}

fn run_renderer(command: &mut Command, log: &Path, timeout: Duration) -> Result<(), String> {
    let file = fs::File::create(log).map_err(|e| e.to_string())?;
    let err_log = file.try_clone().map_err(|e| e.to_string())?;
    command.stdin(Stdio::null()).stdout(file).stderr(err_log);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        use windows_sys::Win32::System::Threading::{CREATE_NO_WINDOW, CREATE_SUSPENDED};
        command.creation_flags(CREATE_NO_WINDOW | CREATE_SUSPENDED);
    }
    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        command.process_group(0);
    }
    let mut child = command
        .spawn()
        .map_err(|e| format!("Could not launch the PDF renderer: {e}"))?;
    let tree = ProcessTree::attach(&mut child)?;
    #[cfg(windows)]
    if let Err(error) = resume_renderer(child.id()) {
        drop(tree);
        let _ = child.wait();
        return Err(format!(
            "Could not start the supervised PDF renderer: {error}"
        ));
    }
    let start = Instant::now();
    loop {
        match child.try_wait() {
            Ok(Some(status)) => {
                return if status.success() {
                    Ok(())
                } else {
                    Err(format!(
                        "PDF renderer exited with {status}.\n{}",
                        log_tail(log)
                    ))
                };
            }
            Ok(None) if start.elapsed() < timeout => std::thread::sleep(Duration::from_millis(50)),
            outcome => {
                drop(tree);
                let _ = child.kill();
                let _ = child.wait();
                return match outcome {
                    Err(error) => Err(format!("Could not wait for the PDF renderer: {error}")),
                    _ => Err(format!(
                        "PDF rendering timed out after {} seconds.\n{}",
                        timeout.as_secs(),
                        log_tail(log)
                    )),
                };
            }
        }
    }
}

#[cfg(unix)]
struct ProcessTree(u32);
#[cfg(unix)]
impl ProcessTree {
    fn attach(child: &mut Child) -> Result<Self, String> {
        Ok(Self(child.id()))
    }
}
#[cfg(unix)]
impl Drop for ProcessTree {
    fn drop(&mut self) {
        // A negative PID addresses the renderer's dedicated process group.
        unsafe {
            libc::kill(-(self.0 as libc::pid_t), libc::SIGKILL);
        }
    }
}

#[cfg(windows)]
struct ProcessTree(windows_sys::Win32::Foundation::HANDLE);
#[cfg(windows)]
impl ProcessTree {
    fn attach(child: &mut Child) -> Result<Self, String> {
        use std::{
            mem::{size_of, zeroed},
            os::windows::io::AsRawHandle,
            ptr::null,
        };
        use windows_sys::Win32::System::JobObjects::*;
        let attached = unsafe {
            let handle = CreateJobObjectW(null(), null());
            if handle.is_null() {
                Err(std::io::Error::last_os_error())
            } else {
                let tree = Self(handle);
                let mut limits: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = zeroed();
                limits.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
                if SetInformationJobObject(
                    handle,
                    JobObjectExtendedLimitInformation,
                    (&limits as *const JOBOBJECT_EXTENDED_LIMIT_INFORMATION).cast(),
                    size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32,
                ) == 0
                    || AssignProcessToJobObject(handle, child.as_raw_handle().cast()) == 0
                {
                    Err(std::io::Error::last_os_error())
                } else {
                    Ok(tree)
                }
            }
        };
        attached.map_err(|error| {
            let _ = child.kill();
            let _ = child.wait();
            format!("Could not supervise the PDF renderer: {error}")
        })
    }
}
#[cfg(windows)]
fn resume_renderer(pid: u32) -> std::io::Result<()> {
    use std::os::windows::io::{FromRawHandle, OwnedHandle};
    use windows_sys::Win32::{
        Foundation::INVALID_HANDLE_VALUE,
        System::{
            Diagnostics::ToolHelp::{
                CreateToolhelp32Snapshot, Thread32First, Thread32Next, TH32CS_SNAPTHREAD,
                THREADENTRY32,
            },
            Threading::{OpenThread, ResumeThread, THREAD_SUSPEND_RESUME},
        },
    };
    unsafe {
        // A CREATE_SUSPENDED process has one primary thread. It cannot create
        // renderer children until the process has been assigned to our job.
        let snapshot = CreateToolhelp32Snapshot(TH32CS_SNAPTHREAD, 0);
        if snapshot == INVALID_HANDLE_VALUE {
            return Err(std::io::Error::last_os_error());
        }
        let _snapshot = OwnedHandle::from_raw_handle(snapshot);
        let mut entry = THREADENTRY32 {
            dwSize: std::mem::size_of::<THREADENTRY32>() as u32,
            ..Default::default()
        };
        let mut found = Thread32First(snapshot, &mut entry);
        while found != 0 {
            if entry.th32OwnerProcessID == pid {
                let thread = OpenThread(THREAD_SUSPEND_RESUME, 0, entry.th32ThreadID);
                if thread.is_null() {
                    return Err(std::io::Error::last_os_error());
                }
                let _thread = OwnedHandle::from_raw_handle(thread);
                return if ResumeThread(thread) == u32::MAX {
                    Err(std::io::Error::last_os_error())
                } else {
                    Ok(())
                };
            }
            found = Thread32Next(snapshot, &mut entry);
        }
        Err(std::io::Error::other(
            "The renderer primary thread could not be found",
        ))
    }
}

#[cfg(windows)]
impl Drop for ProcessTree {
    fn drop(&mut self) {
        use windows_sys::Win32::{Foundation::CloseHandle, System::JobObjects::*};
        unsafe {
            if TerminateJobObject(self.0, 1) != 0 {
                let start = Instant::now();
                let mut info = JOBOBJECT_BASIC_ACCOUNTING_INFORMATION::default();
                while start.elapsed() < Duration::from_secs(2) {
                    if QueryInformationJobObject(
                        self.0,
                        JobObjectBasicAccountingInformation,
                        (&mut info as *mut JOBOBJECT_BASIC_ACCOUNTING_INFORMATION).cast(),
                        std::mem::size_of::<JOBOBJECT_BASIC_ACCOUNTING_INFORMATION>() as u32,
                        std::ptr::null_mut(),
                    ) == 0
                        || info.ActiveProcesses == 0
                    {
                        break;
                    }
                    std::thread::sleep(Duration::from_millis(20));
                }
            }
            CloseHandle(self.0);
        }
    }
}

pub fn write_file(path: &Path, bytes: &[u8]) -> Result<(), String> {
    write_atomic(path, bytes, true)
}

pub fn write_new_file(path: &Path, bytes: &[u8]) -> Result<(), String> {
    write_atomic(path, bytes, false)
}

fn write_atomic(path: &Path, bytes: &[u8], replace: bool) -> Result<(), String> {
    let parent = path
        .parent()
        .filter(|path| !path.as_os_str().is_empty())
        .unwrap_or(Path::new("."));
    let mut temp = tempfile::NamedTempFile::new_in(parent).map_err(|e| e.to_string())?;
    temp.write_all(bytes)
        .and_then(|_| temp.as_file().sync_all())
        .map_err(|e| e.to_string())?;
    if replace {
        temp.persist(path)
    } else {
        temp.persist_noclobber(path)
    }
    .map_err(|e| e.error.to_string())?;
    Ok(())
}

pub const DEFAULT_PATTERN: &str = "{FirstName}_{LastName}_{Company}_{Role}";

pub fn filename(
    pattern: &str,
    name: &str,
    company: &str,
    role: &str,
    variant: &str,
    extension: &str,
) -> String {
    let mut names = name.split_whitespace();
    let first = names.next().unwrap_or("Resume");
    let last = names.next_back().unwrap_or("");
    let expanded = pattern
        .trim()
        .replace("{FirstName}", first)
        .replace("{LastName}", last)
        .replace("{Company}", company)
        .replace("{Role}", role)
        .replace("{Variant}", variant);
    let lower = expanded.to_ascii_lowercase();
    let stem = [".pdf", ".tex"]
        .into_iter()
        .find(|suffix| lower.ends_with(suffix))
        .map_or(expanded.as_str(), |suffix| {
            &expanded[..expanded.len() - suffix.len()]
        });
    let cleaned = stem
        .chars()
        .map(|ch| {
            if ch.is_control() || r#"<>:"/\|?*"#.contains(ch) {
                '_'
            } else {
                ch
            }
        })
        .take(110)
        .collect::<String>();
    let cleaned = cleaned.trim_matches(|ch: char| ch.is_whitespace() || ch == '.' || ch == '_');
    let upper = cleaned
        .split('.')
        .next()
        .unwrap_or_default()
        .trim_end()
        .to_ascii_uppercase();
    let reserved = matches!(upper.as_str(), "CON" | "PRN" | "AUX" | "NUL")
        || ["COM", "LPT"].iter().any(|prefix| {
            upper.strip_prefix(prefix).is_some_and(|s| {
                ["1", "2", "3", "4", "5", "6", "7", "8", "9", "¹", "²", "³"].contains(&s)
            })
        });
    if cleaned.is_empty() {
        format!("Resume.{extension}")
    } else if reserved {
        format!("_{cleaned}.{extension}")
    } else {
        format!("{cleaned}.{extension}")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn filename_is_safe_on_windows() {
        assert_eq!(
            filename(
                "{FirstName}_{LastName}_{Company}_{Role}.pdf",
                "Alex Morgan",
                "AC/DC",
                "SWE: Intern",
                "",
                "tex"
            ),
            "Alex_Morgan_AC_DC_SWE_ Intern.tex"
        );
        assert_eq!(filename("CON.pdf", "", "", "", "", "pdf"), "_CON.pdf");
    }

    #[test]
    fn print_sheet_uses_the_preview_styles_and_embedded_fonts() {
        let html = print_html(
            &PageSize::A4,
            "<article class=\"resume-paper\">Rust</article>",
        );
        assert!(html.contains("@page{size:A4;margin:0}"));
        assert_eq!(html.matches("data:font/woff2;base64,").count(), 4);
        assert!(html.contains(PRINT_CSS));
    }
}
