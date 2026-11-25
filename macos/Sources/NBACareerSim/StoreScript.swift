import Foundation
import WebKit

/// The script that runs before the page: it fills localStorage from the saved file, sends every change
/// back to the app (batched), and keeps the Claude API key out of web storage (it is held in memory and
/// mirrored to the Keychain by the app).
enum StoreScript {
    static func make(items: [String: String], aiKey: String) -> WKUserScript {
        let itemsJSON = (try? JSONSerialization.data(withJSONObject: items)).flatMap { String(data: $0, encoding: .utf8) } ?? "{}"
        let keyJSON = (try? JSONEncoder().encode(aiKey)).flatMap { String(data: $0, encoding: .utf8) } ?? "\"\""
        let source = template
            .replacingOccurrences(of: "%%ITEMS%%", with: itemsJSON)
            .replacingOccurrences(of: "%%AIKEY%%", with: keyJSON)
        return WKUserScript(source: source, injectionTime: .atDocumentStart, forMainFrameOnly: true)
    }

    private static let template = """
    (function () {
      'use strict';
      var init = %%ITEMS%%;
      var aiKey = %%AIKEY%%;
      var NAME = 'nbacs-claude-key';
      var ls = window.localStorage, proto = Storage.prototype;
      var rawSet = proto.setItem, rawGet = proto.getItem, rawRemove = proto.removeItem;
      var post = function (o) { try { window.webkit.messageHandlers.nbacs.postMessage(JSON.stringify(o)); } catch (e) {} };
      for (var k in init) { try { rawSet.call(ls, k, init[k]); } catch (e) {} }
      var pending = {}, timer = null;
      var flush = function () {
        timer = null; var items = pending; pending = {};
        if (Object.keys(items).length) post({ kind: 'store', items: items });
      };
      var queue = function (k, v) { pending[k] = v; if (!timer) timer = setTimeout(flush, 700); };
      proto.setItem = function (k, v) {
        if (this !== ls) return rawSet.call(this, k, v);
        if (k === NAME) { aiKey = String(v); post({ kind: 'aikey', value: aiKey }); return; }
        rawSet.call(this, k, v); queue(String(k), String(v));
      };
      proto.removeItem = function (k) {
        if (this !== ls) return rawRemove.call(this, k);
        if (k === NAME) { aiKey = ''; post({ kind: 'aikey', value: '' }); return; }
        rawRemove.call(this, k); queue(String(k), null);
      };
      proto.getItem = function (k) {
        if (this === ls && k === NAME) return aiKey ? aiKey : null;
        return rawGet.call(this, k);
      };
      window.__nbacsKey = { set: function (v) { aiKey = v ? String(v) : ''; } };
      window.__nbacsFlush = flush;
      window.addEventListener('pagehide', flush);
      document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') flush(); });
      // one-time move of whatever the page stored before the file existed
      window.addEventListener('load', function () {
        try {
          var keys = []; for (var i = 0; i < ls.length; i++) keys.push(ls.key(i));
          keys.forEach(function (key) {
            if (key === NAME) { var old = rawGet.call(ls, NAME); if (old && !aiKey) { aiKey = old; post({ kind: 'aikey', value: aiKey }); } rawRemove.call(ls, NAME); return; }
            var val = rawGet.call(ls, key); if (init[key] !== val) queue(key, val);
          });
        } catch (e) {}
      });
    })();
    """
}
