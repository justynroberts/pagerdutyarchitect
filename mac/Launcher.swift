// PagerDuty Architect.app: a Dock app around the dwell binary. It starts the server, opens the browser
// once it answers, reopens the browser from the Dock, stops the server on Quit, and keeps itself up to
// date with Sparkle (feed and key in Info.plist).
// MIT License. Made by FintonLabs.
import AppKit
import Sparkle

final class AppDelegate: NSObject, NSApplicationDelegate {
    private var server: Process?
    private let port = Int(ProcessInfo.processInfo.environment["PDA_PORT"] ?? "") ?? 5817
    private var url: URL { URL(string: "http://localhost:\(port)")! }
    private let fm = FileManager.default
    // PDA_PORT, PDA_DIR, PDA_NO_BROWSER and PDA_NO_UPDATES exist for the build script's smoke test.
    private lazy var diagrams = ProcessInfo.processInfo.environment["PDA_DIR"].map { URL(fileURLWithPath: $0) }
        ?? fm.homeDirectoryForCurrentUser.appendingPathComponent("Documents/PagerDuty Architect")
    private lazy var log = fm.homeDirectoryForCurrentUser.appendingPathComponent("Library/Logs/PagerDuty Architect.log")
    // Checks in the background on every launch and hourly after (SUScheduledCheckInterval), and offers to install.
    // PDA_NO_UPDATES keeps the smoke test offline.
    private let updates = SPUStandardUpdaterController(
        startingUpdater: ProcessInfo.processInfo.environment["PDA_NO_UPDATES"] != "1",
        updaterDelegate: nil,
        userDriverDelegate: nil
    )

    func applicationDidFinishLaunching(_ note: Notification) {
        buildMenu()
        // Sparkle on its own waits a full interval since the last check; a new release should show on the next launch.
        if updates.updater.canCheckForUpdates { updates.updater.checkForUpdatesInBackground() }
        // Another copy (this app or the dwell command) already serving: just show it.
        if answers() {
            openBrowser()
            return
        }
        start()
    }

    // The page's "Install update" opens pagerduty-architect://check-for-updates (through dwell), bringing the app
    // forward with Sparkle's window, since the app has no window of its own and otherwise sits behind the browser.
    func application(_ application: NSApplication, open urls: [URL]) {
        guard urls.contains(where: { $0.host == "check-for-updates" }) else { return }
        NSApp.activate(ignoringOtherApps: true)
        updates.checkForUpdates(nil)
    }

    func applicationShouldHandleReopen(_ app: NSApplication, hasVisibleWindows: Bool) -> Bool {
        openBrowser()
        return false
    }

    func applicationWillTerminate(_ note: Notification) {
        guard let p = server, p.isRunning else { return }
        p.terminationHandler = nil
        p.terminate()
        p.waitUntilExit()
    }

    private func start() {
        guard let dwell = Bundle.main.url(forAuxiliaryExecutable: "dwell") else {
            fail("The app is incomplete: dwell is missing from the bundle.")
            return
        }
        // Append, so a crash's log survives the next launch; start a fresh file past 1 MB.
        let size = (try? fm.attributesOfItem(atPath: log.path)[.size] as? Int) ?? 0
        if size == 0 || size > 1_000_000 { fm.createFile(atPath: log.path, contents: nil) }
        let out = try? FileHandle(forWritingTo: log)
        _ = try? out?.seekToEnd()
        out?.write(Data("\n--- launched \(Date())\n".utf8))

        let p = Process()
        p.executableURL = dwell
        p.arguments = ["--dir", diagrams.path, "--port", String(port), "--open=false"]
        // Tells dwell it can hand updates to this app.
        p.environment = ProcessInfo.processInfo.environment.merging(["PDA_APP": "1"]) { $1 }
        p.standardOutput = out
        p.standardError = out
        p.terminationHandler = { [weak self] proc in
            DispatchQueue.main.async {
                self?.fail("PagerDuty Architect stopped unexpectedly (exit \(proc.terminationStatus)).")
            }
        }
        do {
            try p.run()
        } catch {
            fail("Could not start: \(error.localizedDescription)")
            return
        }
        server = p

        DispatchQueue.global().async { [weak self] in
            guard let self else { return }
            for _ in 0..<50 where p.isRunning {
                if self.answers() {
                    DispatchQueue.main.async { self.openBrowser() }
                    return
                }
                Thread.sleep(forTimeInterval: 0.2)
            }
        }
    }

    private func answers() -> Bool {
        var req = URLRequest(url: url.appendingPathComponent("api/diagrams"), timeoutInterval: 0.5)
        req.cachePolicy = .reloadIgnoringLocalCacheData
        let done = DispatchSemaphore(value: 0)
        var ok = false
        URLSession.shared.dataTask(with: req) { _, resp, _ in
            ok = (resp as? HTTPURLResponse)?.statusCode == 200
            done.signal()
        }.resume()
        _ = done.wait(timeout: .now() + 1)
        return ok
    }

    @objc private func openBrowser() {
        if ProcessInfo.processInfo.environment["PDA_NO_BROWSER"] == "1" { return }
        NSWorkspace.shared.open(url)
    }

    @objc private func showDiagrams() {
        try? fm.createDirectory(at: diagrams, withIntermediateDirectories: true)
        NSWorkspace.shared.open(diagrams)
    }

    @objc private func showLog() {
        NSWorkspace.shared.activateFileViewerSelecting([log])
    }

    private func fail(_ message: String) {
        let alert = NSAlert()
        alert.messageText = message
        alert.informativeText = "Details are in ~/Library/Logs/PagerDuty Architect.log. If another program is using port \(port), quit it and open the app again."
        alert.addButton(withTitle: "Quit")
        alert.addButton(withTitle: "Show Log")
        NSApp.activate(ignoringOtherApps: true)
        if alert.runModal() == .alertSecondButtonReturn { showLog() }
        NSApp.terminate(nil)
    }

    private func buildMenu() {
        let main = NSMenu()
        let appItem = NSMenuItem()
        main.addItem(appItem)
        let m = NSMenu()
        m.addItem(withTitle: "About PagerDuty Architect", action: #selector(NSApplication.orderFrontStandardAboutPanel(_:)), keyEquivalent: "")
        m.addItem(withTitle: "Check for Updates…", action: #selector(SPUStandardUpdaterController.checkForUpdates(_:)), keyEquivalent: "").target = updates
        m.addItem(.separator())
        m.addItem(withTitle: "Open in Browser", action: #selector(openBrowser), keyEquivalent: "o").target = self
        m.addItem(withTitle: "Show Diagrams Folder", action: #selector(showDiagrams), keyEquivalent: "d").target = self
        m.addItem(withTitle: "Show Log", action: #selector(showLog), keyEquivalent: "").target = self
        m.addItem(.separator())
        m.addItem(withTitle: "Hide PagerDuty Architect", action: #selector(NSApplication.hide(_:)), keyEquivalent: "h")
        m.addItem(withTitle: "Quit PagerDuty Architect", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        appItem.submenu = m
        NSApp.mainMenu = main
    }
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.setActivationPolicy(.regular)

// SIGTERM (kill, some logouts) skips applicationWillTerminate, so route it through a normal quit
// or dwell is left running with the port held.
signal(SIGTERM, SIG_IGN)
let sigterm = DispatchSource.makeSignalSource(signal: SIGTERM, queue: .main)
sigterm.setEventHandler { NSApp.terminate(nil) }
sigterm.resume()

app.run()
