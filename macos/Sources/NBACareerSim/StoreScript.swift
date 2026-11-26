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
      // the career, its replay snapshot and the save slots are big (about 1.2 MB each) and the web view only keeps about 5 MB of
      // localStorage: they live in memory here and in the app's file, never in web storage, so nothing can fail to save
      var BIG = /^nba-career-sim/;
      var mem = {};
      var ls = window.localStorage, proto = Storage.prototype;
      var rawSet = proto.setItem, rawGet = proto.getItem, rawRemove = proto.removeItem;
      var post = function (o) { try { window.webkit.messageHandlers.nbacs.postMessage(JSON.stringify(o)); } catch (e) {} };
      var pending = {}, timer = null;
      var flush = function () {
        timer = null; var items = pending; pending = {};
        if (Object.keys(items).length) post({ kind: 'store', items: items });
      };
      var queue = function (k, v) { pending[k] = v; if (!timer) timer = setTimeout(flush, 700); };
      for (var k in init) { if (BIG.test(k)) mem[k] = init[k]; else { try { rawSet.call(ls, k, init[k]); } catch (e) {} } }
      // what an older version of the app left in web storage moves into the file right away (before the page reads its save)
      try {
        var old = []; for (var i = 0; i < ls.length; i++) old.push(ls.key(i));
        old.forEach(function (key) {
          if (key === NAME) { var ak = rawGet.call(ls, NAME); if (ak && !aiKey) { aiKey = ak; post({ kind: 'aikey', value: aiKey }); } rawRemove.call(ls, NAME); return; }
          if (BIG.test(key)) { var v = rawGet.call(ls, key); if (!(key in mem)) { mem[key] = v; queue(key, v); } rawRemove.call(ls, key); }
        });
      } catch (e) {}
      proto.setItem = function (k, v) {
        if (this !== ls) return rawSet.call(this, k, v);
        if (k === NAME) { aiKey = String(v); post({ kind: 'aikey', value: aiKey }); return; }
        if (BIG.test(k)) { mem[k] = String(v); queue(String(k), mem[k]); return; }
        rawSet.call(this, k, v); queue(String(k), String(v));
      };
      proto.removeItem = function (k) {
        if (this !== ls) return rawRemove.call(this, k);
        if (k === NAME) { aiKey = ''; post({ kind: 'aikey', value: '' }); return; }
        if (BIG.test(k)) { delete mem[k]; queue(String(k), null); return; }
        rawRemove.call(this, k); queue(String(k), null);
      };
      proto.getItem = function (k) {
        if (this === ls && k === NAME) return aiKey ? aiKey : null;
        if (this === ls && BIG.test(k)) return Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : null;
        return rawGet.call(this, k);
      };
      window.__nbacsKey = { set: function (v) { aiKey = v ? String(v) : ''; } };
      window.__nbacsFlush = flush;
      window.addEventListener('pagehide', flush);
      document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') flush(); });
      // everything else the page already had (settings) is copied into the file once
      window.addEventListener('load', function () {
        try {
          var keys = []; for (var i = 0; i < ls.length; i++) keys.push(ls.key(i));
          keys.forEach(function (key) { var val = rawGet.call(ls, key); if (init[key] !== val) queue(key, val); });
        } catch (e) {}
      });
    })();
    """
}
