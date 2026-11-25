# NBA Career Sim for macOS

A SwiftUI app around the same game as the website. The game itself (all the simulation, screens and AI features) is still `dist/index.html` running in a `WKWebView`, so the screens, the simulation and the saves match the web version. What is native:

- **Mac look**: inside the app the page switches to a Mac style (system font, sentence case, flat cards, Mac-style buttons and segmented controls, sheet-style pop-ups, no browser right-click menu). The website keeps the original look. Both can be switched off in Settings.
- **Toolbar tabs**: Season / Team / League / Career is a native segmented control in the window toolbar, with Sim, Game Settings and New Career buttons on the right. Settings can switch back to the game's own top bar.
- **Menus and shortcuts**: screens on ⌘1–⌘4, Sim Next Game (⌘↩), New Career (⌘N), Open Career… (⌘O), Save Career As… (⇧⌘S), Share Player Card…, Game Settings (⇧⌘G), zoom (⌘= ⌘- ⌘0), reload (⌘R).
- **Window**: title and subtitle show your player, team and record. It remembers its size and position, supports full screen, and opens dark with no white flash. Dark mode only, like the game.
- **Native pop-ups**: simple decision pop-ups (made of headings, text and buttons) open as SwiftUI sheets. Pop-ups with tables, fields or pickers stay as web pop-ups. Switch off in Settings.
- **Real Mac alerts**: "are you sure" buttons show a normal alert instead of "tap again to confirm".
- **Save file**: your career, save slots and settings are kept in `~/Library/Application Support/NBA Career Sim/store.json` (File ▸ Show Save Files in Finder), so they survive updates. Open Career / Save Career As use the same file format as the in-game export.
- **Keychain**: the Claude API key is stored in the macOS Keychain (Settings ▸ AI features), not in web storage.
- **Dock badge** with the number of things waiting in your inbox, **trackpad haptics** on big moments (a pop-up opening, a 9+ game, a season recap, a new award), and **Share Player Card** through the Mac share sheet.
- **No web habits**: UI text is not selectable, no right-click browser menu, no pinch zoom, arrow cursor on buttons, no rubber-band bounce (best effort).
- **Settings** (⌘,): Mac look, toolbar tabs, native pop-ups, Claude API key, page zoom, erase all game data.
- **Files**: the player card PNG and the career export open a normal Save panel. Links open in your browser.
- **App bundle**: installs into Applications, so Spotlight and Launchpad find it. The icon is `Resources/NBA Career Sim.icon` (Icon Composer), compiled with `actool` when your Xcode can, with a PNG-based icon as the fallback.

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

## Check that it compiles

```
cd macos && swift build
```

The Swift code was written without a Mac to compile on, so the first build may report a few errors: paste them back and they get fixed.

## How the two sides talk

- Game → app: after every screen it draws, `hostSync()` in `src/ui.js` posts JSON messages to `webkit.messageHandlers.nbacs`: `state` (`HostInfo.swift`), `dialog` (a pop-up as nodes, `DialogNode`), `haptic`. A script injected before the page (`StoreScript.swift`) also sends `store` (localStorage changes, saved to the file by `PersistentStore.swift`) and `aikey` (to the Keychain). None of this exists in a normal browser.
- App → game: the app calls `window.__NBA_UI.host.look / setView / newCareer / settings / press / saveText / importSave / card / keyChanged / sync`.
- The page is served from `nbacs://app/index.html` (`PageResources.swift`) so it has its own origin; that is what keeps the save in localStorage between launches. Only `index.html` is ever served.

After changing the game code, run `python3 scripts/build.py` (or just `build-app.sh`) so `dist/index.html` is current.

## Notes

- Your save lives in the Application Support file above, not in the browser's storage. Use File ▸ Save Career As… and the in-game Open/import to move a career between the website and the app. A career already in the app's old web storage is copied into the file the first time you run this version.
- The AI features use your own API key. Enter it in Settings (⌘,) or in the game's settings; either way it is stored in the Keychain and only sent to api.anthropic.com. After you rebuild the app, macOS may ask once whether the new build can use the Keychain item (it is signed ad hoc).
- To publish outside your own Mac you would need a Developer ID certificate and notarization, and if you turn on the App Sandbox, the "Outgoing Connections (Client)" entitlement so the AI features can reach the network.
