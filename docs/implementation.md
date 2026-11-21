# ResumeForge implementation

The supplied project specification defines the design and milestone order. The desktop shell uses typed React views and a Zustand store. Rust owns the SQLite connection lifecycle, transactions, exports, and file dialogs. Run the Rust core checks on Linux and run the Windows desktop build with the Tauri desktop feature enabled.

1. Create the versioned schema, transactional sample seed, and typed database commands. Test migration idempotence, CRUD, cascades, and persistence. Connect the master editor and linter to the normal desktop entry point.
2. Resolve variant selections into a serializable document. Test ordering and stale IDs. Render on a measured physical sheet with shared CSS and offline fonts. Persist layout and drag ordering.
3. Generate LaTeX from resolved documents and test escaping. Print the same React markup and CSS using headless Edge. Check vector output with text extraction and compile LaTeX where the compiler is available.
4. Match canonical dictionary terms and aliases against the job description and resume. Test punctuation boundaries and active versus available precedence. Link available results to variant toggles.
5. Freeze resolved documents and exported PDFs atomically with the application record. Track stage events for analytics, and implement portable backups with embedded frozen PDFs. Test immutability, failed writes, round trips, and release builds.
