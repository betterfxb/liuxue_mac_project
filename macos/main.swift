import AppKit
import WebKit
import Foundation
import CoreGraphics
import ImageIO
import CryptoKit
import UniformTypeIdentifiers
import Darwin

final class AppDelegate: NSObject, NSApplicationDelegate, NSWindowDelegate, WKNavigationDelegate, WKUIDelegate, WKScriptMessageHandler {
    private let window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 1180, height: 820),
                                  styleMask: [.titled, .closable, .miniaturizable, .resizable],
                                  backing: .buffered, defer: false)
    private let status = NSTextField(wrappingLabelWithString: "正在启动本机留学申请工作台…")
    private let bridge = Process(), output = Pipe(), input = Pipe()
    private var lineBuffer = Data()
    private var originPort: Int?
    private var stopping = false
    private var terminating = false
    private var failed = false
    private var view: WKWebView?
    private var savePanelActive = false

    func applicationDidFinishLaunching(_ notification: Notification) {
        window.title = "留学申请工作台"
        window.minSize = NSSize(width: 740, height: 520)
        window.delegate = self
        window.isReleasedWhenClosed = false
        status.alignment = .center
        status.font = .systemFont(ofSize: 17, weight: .medium)
        window.contentView = status
        window.center()
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
        guard let resources = Bundle.main.resourceURL, let executable = Bundle.main.executableURL else { fail(); return }
        let node = executable.deletingLastPathComponent().appendingPathComponent("admissions-node")
        let entry = resources.appendingPathComponent("workbench/native-bridge.cjs")
        guard FileManager.default.isExecutableFile(atPath: node.path),
              FileManager.default.fileExists(atPath: entry.path) else { fail(); return }
        bridge.executableURL = node
        bridge.arguments = [entry.path, "--synthetic-qa"]
        bridge.currentDirectoryURL = resources
        bridge.environment = ["TMPDIR": FileManager.default.temporaryDirectory.path]
        bridge.standardInput = input
        bridge.standardOutput = output
        bridge.standardError = FileHandle.nullDevice
        output.fileHandleForReading.readabilityHandler = { [weak self] handle in
            let data = handle.availableData
            if data.isEmpty { handle.readabilityHandler = nil; return }
            DispatchQueue.main.async { [weak self] in self?.receive(data) }
        }
        bridge.terminationHandler = { [weak self] _ in
            DispatchQueue.main.async { [weak self] in
                guard let self = self else { return }
                self.output.fileHandleForReading.readabilityHandler = nil
                if self.terminating { NSApp.reply(toApplicationShouldTerminate: true) }
                else if !self.stopping { self.fail() }
            }
        }
        do { try bridge.run() } catch { fail(); return }
        DispatchQueue.main.asyncAfter(deadline: .now() + 15) { [weak self] in
            if let self = self, self.originPort == nil, !self.stopping { self.fail() }
        }
    }

    private func receive(_ bytes: Data) {
        guard !stopping && !failed else { return }
        lineBuffer.append(bytes)
        guard lineBuffer.count <= 4096 else { fail(); return }
        while let newline = lineBuffer.firstIndex(of: 10) {
            let line = lineBuffer.prefix(upTo: newline)
            lineBuffer.removeSubrange(lineBuffer.startIndex...newline)
            guard let item = (try? JSONSerialization.jsonObject(with: Data(line))) as? [String: Any],
                  let event = item["event"] as? String else { fail(); return }
            if event == "ready" {
                guard originPort == nil, item["scope"] as? String == "synthetic-qa",
                      let raw = item["url"] as? String, let u = URLComponents(string: raw),
                      u.scheme == "http", u.host == "127.0.0.1", u.user == nil, u.password == nil,
                      u.path == "/", u.query == nil, u.fragment == "/apply",
                      let port = u.port, (1...65535).contains(port), let url = u.url,
                      raw == "http://127.0.0.1:\(port)/#/apply" else { fail(); return }
                originPort = port
                let config = WKWebViewConfiguration()
                config.userContentController.add(self, name: "admissionsSaveOriginal")
                config.websiteDataStore = .nonPersistent()
                config.preferences.javaScriptCanOpenWindowsAutomatically = false
                let web = WKWebView(frame: .zero, configuration: config)
                web.navigationDelegate = self
                web.uiDelegate = self
                window.contentView = web
                view = web
                web.load(URLRequest(url: url))
            } else { fail(); return }
        }
    }

    // Synthetic QA only: a one-operation bridge, not access to arbitrary files or tokens.
    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.name == "admissionsSaveOriginal", !stopping, !failed, !savePanelActive,
              message.webView === view, message.frameInfo.isMainFrame,
              ownOrigin(message.frameInfo.request.url), message.frameInfo.request.url?.path == "/",
              message.frameInfo.request.url?.query == nil,
              message.frameInfo.securityOrigin.protocol == "http",
              message.frameInfo.securityOrigin.host == "127.0.0.1",
              message.frameInfo.securityOrigin.port == originPort,
              let fields = message.body as? [String: String],
              Set(fields.keys) == Set(["filename", "base64"]),
              let name = fields["filename"], let encoded = fields["base64"], encoded.utf8.count == 1012 else { return }
        let known: [String: String] = [
            "synthetic-r367-a.pdf": "c18425b64614e3f03b5fe03ee49dbd1051e891b0cc4471e0734a801de7bfbd54",
            "synthetic-r367-b.pdf": "af4f7eea4a63240ec249b0f835bce18a9f66fa3d73c0626e4ff8b2af2674ae5d"
        ]
        guard let expected = known[name], let bytes = Data(base64Encoded: encoded), bytes.count == 759,
              bytes.prefix(8) == Data("%PDF-1.4".utf8),
              SHA256.hash(data: bytes).map({ String(format: "%02x", $0) }).joined() == expected else { return }

        // The web click need not keep transient WebKit activation across authenticated fetch.
        // The trusted native dialog requires an independent, explicit Save action before any write.
        let panel = NSSavePanel()
        panel.title = "保存原始合成 PDF"
        panel.nameFieldStringValue = name
        panel.allowedContentTypes = [.pdf]
        panel.canCreateDirectories = false
        panel.isExtensionHidden = false
        savePanelActive = true
        panel.beginSheetModal(for: window) { [weak self] response in
            guard let self = self else { return }
            self.savePanelActive = false
            guard response == .OK, !self.stopping, !self.failed,
                  let target = panel.url, target.isFileURL, target.pathExtension.lowercased() == "pdf" else { return }
            do { try self.writeVerifiedOriginal(bytes, to: target) }
            catch {
                let alert = NSAlert()
                alert.messageText = "未保存原始文件"
                alert.informativeText = "目标已存在或无法安全写入。请另选一个新文件名后重试。"
                alert.beginSheetModal(for: self.window)
            }
        }
    }

    private func writeVerifiedOriginal(_ bytes: Data, to target: URL) throws {
        let fm = FileManager.default
        let dir = target.deletingLastPathComponent().appendingPathComponent(".admissions-save-\(UUID().uuidString)", isDirectory: true)
        try fm.createDirectory(at: dir, withIntermediateDirectories: false, attributes: [.posixPermissions: 0o700])
        let staged = dir.appendingPathComponent("staged.pdf")
        defer {
            try? fm.removeItem(at: staged)
            try? fm.removeItem(at: dir)
        }
        try bytes.write(to: staged, options: .withoutOverwriting)
        try fm.setAttributes([.posixPermissions: 0o600], ofItemAtPath: staged.path)
        let linked: Int32 = staged.withUnsafeFileSystemRepresentation { from in
            target.withUnsafeFileSystemRepresentation { dest in
                guard let from = from, let dest = dest else { return -1 }
                // Atomic create-if-absent on supported filesystems. Never overwrite, including a symlink.
                return Darwin.link(from, dest)
            }
        }
        guard linked == 0 else { throw CocoaError(.fileWriteUnknown) }
    }

    private func ownOrigin(_ url: URL?) -> Bool {
        guard let url = url, let port = originPort else { return false }
        return url.scheme == "http" && url.host == "127.0.0.1" && url.port == port
            && url.user == nil && url.password == nil
    }
    // QA only. Blob URLs must be for a PDF created by the pinned page.
    // HTTP frames, arbitrary schemes, and top-level blob navigation stay disabled.
    private func ownPdfBlob(_ url: URL?) -> Bool {
        guard let raw = url?.absoluteString, let port = originPort else { return false }
        let prefix = "blob:http://127.0.0.1:\(port)/"
        guard raw.hasPrefix(prefix) else { return false }
        let identifier = String(raw.dropFirst(prefix.count))
        return identifier.count == 36 && UUID(uuidString: identifier) != nil
    }
    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let frame = action.targetFrame else { decisionHandler(.cancel); return }
        if frame.isMainFrame {
            decisionHandler(ownOrigin(action.request.url) ? .allow : .cancel)
            return
        }
        let source = action.sourceFrame.securityOrigin
        let allow = originPort.map { pinnedPort in
            source.protocol == "http" && source.host == "127.0.0.1" && source.port == pinnedPort
        } ?? false
        decisionHandler(allow && ownPdfBlob(action.request.url) ? .allow : .cancel)
    }
    func webView(_ webView: WKWebView, decidePolicyFor response: WKNavigationResponse,
                 decisionHandler: @escaping (WKNavigationResponsePolicy) -> Void) {
        if response.isForMainFrame {
            decisionHandler(response.canShowMIMEType && ownOrigin(response.response.url) ? .allow : .cancel)
            return
        }
        decisionHandler(response.canShowMIMEType && response.response.mimeType?.lowercased() == "application/pdf" &&
            ownPdfBlob(response.response.url) ? .allow : .cancel)
    }
    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration,
                 for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? { nil }
    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) { fail() }
    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) { fail() }
    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) { fail() }

    private func fail() {
        guard !failed else { return }
        failed = true
        view?.stopLoading()
        window.contentView = status
        status.stringValue = "无法启动留学申请工作台测试版。请关闭窗口后重试。"
        stop()
    }
    private func stop() {
        guard !stopping else { return }
        stopping = true
        guard bridge.isRunning else { return }
        try? input.fileHandleForWriting.write(contentsOf: Data("STOP\n".utf8))
        try? input.fileHandleForWriting.close()
        DispatchQueue.main.asyncAfter(deadline: .now() + 7) { [weak self] in
            if let self = self, self.bridge.isRunning { self.bridge.terminate() }
        }
    }
    func windowWillClose(_ notification: Notification) { NSApp.terminate(nil) }
    func applicationShouldTerminate(_ sender: NSApplication) -> NSApplication.TerminateReply {
        if !bridge.isRunning { return .terminateNow }
        terminating = true
        stop()
        return .terminateLater
    }
}


private func renderSyntheticPreviewCommand() throws {
    let input = FileHandle.standardInput
    var bytes = Data()
    while let chunk = try input.read(upToCount: min(1024, 1241 - bytes.count)), !chunk.isEmpty {
        bytes.append(chunk)
        if bytes.count > 1240 { throw CocoaError(.fileReadCorruptFile) }
    }
    // Only the existing deterministic QA samples; this is not a general PDF renderer.
    let pins: [String: Int] = [
        "c18425b64614e3f03b5fe03ee49dbd1051e891b0cc4471e0734a801de7bfbd54": 759,
        "af4f7eea4a63240ec249b0f835bce18a9f66fa3d73c0626e4ff8b2af2674ae5d": 759,
        "88e2bcc6fe0ac708885c436527f8d0d6e1002f46565d23ecd25d45d344796f37": 1240,
    ]
    let sha = SHA256.hash(data: bytes).map { String(format:"%02x", $0) }.joined()
    guard pins[sha] == bytes.count,
          bytes.prefix(8) == Data("%PDF-1.4".utf8),
          let provider = CGDataProvider(data: bytes as CFData),
          let doc = CGPDFDocument(provider), !doc.isEncrypted, doc.numberOfPages == 1,
          let page = doc.page(at: 1) else { throw CocoaError(.fileReadCorruptFile) }
    let box = page.getBoxRect(.mediaBox)
    guard box.width.isFinite, box.height.isFinite,
          box.width > 0, box.height > 0, box.width <= 2000, box.height <= 2000,
          page.rotationAngle == 0 else { throw CocoaError(.fileReadCorruptFile) }
    let scale = min(1000.0 / box.width, 1400.0 / box.height)
    let width = Int((box.width * scale).rounded(.down)), height = Int((box.height * scale).rounded(.down))
    guard (1...1000).contains(width), (1...1400).contains(height),
          let context = CGContext(data: nil, width: width, height: height, bitsPerComponent: 8,
                                  bytesPerRow: width * 4, space: CGColorSpaceCreateDeviceRGB(),
                                  bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else {
        throw CocoaError(.fileWriteUnknown)
    }
    let rectangle = CGRect(x: 0, y: 0, width: CGFloat(width), height: CGFloat(height))
    context.setFillColor(red: 1, green: 1, blue: 1, alpha: 1)
    context.fill(rectangle)
    context.concatenate(page.getDrawingTransform(.mediaBox, rect: rectangle, rotate: 0, preserveAspectRatio: true))
    context.drawPDFPage(page)
    let png = NSMutableData()
    guard let image = context.makeImage(),
          let writer = CGImageDestinationCreateWithData(png as CFMutableData, UTType.png.identifier as CFString, 1, nil)
    else { throw CocoaError(.fileWriteUnknown) }
    CGImageDestinationAddImage(writer, image, nil)
    guard CGImageDestinationFinalize(writer), png.length >= 100, png.length <= 4 * 1024 * 1024
    else { throw CocoaError(.fileWriteUnknown) }
    try FileHandle.standardOutput.write(contentsOf: png as Data)
}

if CommandLine.arguments.dropFirst() == ["--render-synthetic-page-v1"] {
    do { try renderSyntheticPreviewCommand(); exit(0) }
    catch { exit(2) }
}


let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.setActivationPolicy(.regular)
app.run()