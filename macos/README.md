# NBA Career Sim for macOS

A SwiftUI app around the same game as the website. The game itself (all the simulation, screens and AI features) is still `dist/index.html` running in a `WKWebView`, so the screens, the simulation and the saves match the web version. What is native:

- **Mac look**: inside the app the page switches to a Mac style (system font, sentence case, flat cards, Mac-style buttons and segmented controls, sheet-style pop-ups, no browser right-click menu). The website keeps the original look. Both can be switched off in Settings.
- **Toolbar tabs**: Season / Team / League / Career is a native segmented control in the window toolbar, with Sim, Game Settings and New Career buttons on the right. Settings can switch back to the game's own top bar.
- **Menus and shortcuts**: screens on ⌘1–⌘4, Sim Next Game (⌘↩), New Career (⌘N), Game Settings (⇧⌘G), zoom (⌘= ⌘- ⌘0), reload (⌘R).
- **Window**: the title and subtitle show your player, team and record. Dark mode only, like the game.
- **Settings** (⌘,): page zoom and "Erase all game data".
- **Files**: the player card PNG and the career export open a normal Save panel. Links open in your browser.
- **App bundle**: installs into Applications, so Spotlight and Launchpad find it.

## Build and install (on a Mac)

Needs macOS 13 or newer and Xcode (or the Command Line Tools) with Swift 5.9+.

```
./macos/build-app.sh --install --open
```

That bundles `dist/index.html`, compiles a universal (Apple silicon + Intel) build, assembles and signs `NBA Career Sim.app`, copies it to `/Applications` (or `~/Applications` if that is not writable), and registers it:

- **Spotlight**: press ⌘Space and type "NBA Career". The script runs `mdimport` on the app so it is found right away.
- **Launchpad**: it appears with the app icon after a few seconds. If it does not, run `defaults write com.apple.dock ResetLaunchPad -bool true && killall Dock` once (this also resets your Launchpad layout).
- **Dock**: open it once, then right-click the icon, Options, Keep in Dock.

Other options:

```
./macos/build-app.sh            # just build: macos/build/NBA Career Sim.app
./macos/build-app.sh --dmg      # also make macos/build/NBA-Career-Sim.dmg (open it, drag the app onto Applications)
```

To work on it in Xcode: open the `macos/` folder (File → Open, pick `Package.swift`), then Run. For `swift run` from the `macos/` folder the app loads `../dist/index.html` (override with `NBACS_HTML=/path/to/index.html`). Note that `swift run` is not an app bundle, so it will not show up in Spotlight or Launchpad: use `--install` for that.

## How the two sides talk

- Game → app: after every screen it draws, `hostSync()` in `src/ui.js` posts one JSON message (`HostInfo.swift`) to `webkit.messageHandlers.nbacs`. It does nothing in a normal browser.
- App → game: the app calls `window.__NBA_UI.host.setView / newCareer / settings / sync`.
- The page is served from `nbacs://app/index.html` (`PageResources.swift`) so it has its own origin; that is what keeps the save in localStorage between launches. Only `index.html` is ever served.

After changing the game code, run `python3 scripts/build.py` (or just `build-app.sh`) so `dist/index.html` is current.

## Notes

- Your save lives in the app's WebKit storage, not in the browser's. Use the in-game export/save slots to move a career between the website and the app.
- The AI features still use your own API key, entered in the game's settings; it is stored in the app's web storage and only sent to api.anthropic.com.
- To publish outside your own Mac you would need a Developer ID certificate and notarization, and if you turn on the App Sandbox, the "Outgoing Connections (Client)" entitlement so the AI features can reach the network.
