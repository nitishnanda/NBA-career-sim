import Foundation
import WebKit

/// Finds the bundled game page. In the built .app it sits in Contents/Resources;
/// for `swift run` it falls back to the repo's dist/ folder.
enum PageResources {
    static func indexURL() -> URL? {
        if let url = Bundle.main.url(forResource: "index", withExtension: "html") { return url }
        let env = ProcessInfo.processInfo.environment["NBACS_HTML"]
        let cwd = FileManager.default.currentDirectoryPath
        let candidates = [env, cwd + "/../dist/index.html", cwd + "/dist/index.html"].compactMap { $0 }
        return candidates.map { URL(fileURLWithPath: $0) }.first { FileManager.default.fileExists(atPath: $0.path) }
    }
}

/// Serves the game from nbacs://app/ so it gets a stable origin of its own
/// (that is what keeps localStorage, i.e. the save game, between launches).
/// Only index.html is ever served.
final class BundleSchemeHandler: NSObject, WKURLSchemeHandler {
    func webView(_ webView: WKWebView, start urlSchemeTask: WKURLSchemeTask) {
        guard let url = urlSchemeTask.request.url else {
            urlSchemeTask.didFailWithError(URLError(.badURL))
            return
        }
        let path = url.path
        let isIndex = path.isEmpty || path == "/" || path == "/index.html"
        guard isIndex, let file = PageResources.indexURL(), let data = try? Data(contentsOf: file) else {
            let body = Data("Not found".utf8)
            let response = HTTPURLResponse(url: url, statusCode: 404, httpVersion: "HTTP/1.1",
                                           headerFields: ["Content-Type": "text/plain", "Content-Length": "\(body.count)"])!
            urlSchemeTask.didReceive(response)
            urlSchemeTask.didReceive(body)
            urlSchemeTask.didFinish()
            return
        }
        let response = HTTPURLResponse(url: url, statusCode: 200, httpVersion: "HTTP/1.1",
                                       headerFields: ["Content-Type": "text/html; charset=utf-8",
                                                      "Content-Length": "\(data.count)",
                                                      "Cache-Control": "no-cache"])!
        urlSchemeTask.didReceive(response)
        urlSchemeTask.didReceive(data)
        urlSchemeTask.didFinish()
    }

    func webView(_ webView: WKWebView, stop urlSchemeTask: WKURLSchemeTask) {}
}
