# ResumeForge

ResumeForge is a local-first Windows desktop application for Computer Engineering students tailoring resumes for SWE, AI/ML, Systems, and Embedded internships.

- **Master Bank** stores your profile, entries, alternate bullets, and skills. The first-run sample includes two variants and five applications.
- **Variant Studio** builds a resume from ordered selections, previews Jake’s layout on Letter or A4, and measures one-page density. The JD Matcher runs locally against its dictionary and your custom terms.
- **Applications** tracks applications, OA deadlines, and interview notes. **Log Application & Freeze Snapshot** saves the resume content, LaTeX, and PDF along with the application.
- **Analytics** counts recorded stages. Rejected or ghosted applications retain previously reached stages. A direct move into Technical counts toward interviews. OA rates use recorded OA stages. The weekly chart uses the applied date, and variant attribution uses the frozen snapshot.
- **Settings** configures exports and provides JSON backup/restore and applications CSV. JSON backups embed frozen PDFs.

## Windows development

Install Node.js 22 or newer, stable Rust, Microsoft C++ Build Tools, and the Microsoft Edge WebView2 Runtime. Run these commands from the project root in PowerShell.

```powershell
npm ci
npm run tauri dev
npm run tauri build -- --target x86_64-pc-windows-msvc
```

After the build, the NSIS installer is under `src-tauri/target/x86_64-pc-windows-msvc/release/bundle/nsis/`. The **Windows build** workflow also builds and uploads that installer.

The SQLite database lives at `%APPDATA%\ResumeForge\resumeforge.db`. Snapshot PDFs live under `%APPDATA%\ResumeForge\snapshots\`. The built-in PDF engine uses Edge or Chrome. To use LaTeX for PDF generation, install a distribution with `pdflatex`, Latin Modern, `fullpage`, `titlesec`, `enumitem`, `hyperref`, and `tabularx`, then select it in Settings. The built-in PDF renderer shares print CSS and bundled fonts with the preview.

## Verification

```sh
npm test
npx tsc --noEmit
cargo check --locked --manifest-path src-tauri/Cargo.toml
cargo test --locked --manifest-path src-tauri/Cargo.toml
```

The platform-independent Rust core runs without GUI libraries. On Windows, add `--features desktop` to check and test the Tauri commands. To test selectable PDF text, hyperlinks, and page count, install Poppler and run:

```sh
cargo test --manifest-path src-tauri/Cargo.toml --test export_engines builtin_pdf -- --ignored
cargo test --manifest-path src-tauri/Cargo.toml --test export_engines latex_pdf -- --ignored
```

For a Windows runtime smoke test, load the sample, export the same variant as PDF and LaTeX, and open the PDF to check its text and links. Freeze a resume against an application, then edit or delete a selected Master Bank bullet and reopen the frozen preview and saved PDF. Export a JSON backup and restore it to verify the PDF still opens.

Latin Modern Roman font licensing is included in `public/fonts/LICENSE.txt`.
