import Foundation

/// The game's saved data (career, save slots, settings), kept as a file in
/// ~/Library/Application Support/NBA Career Sim/ instead of only in the web view's storage,
/// so it survives updates and a reset of web data. The page's localStorage is filled from this
/// file when it loads (see StoreScript) and every change it makes is sent back here.
final class PersistentStore {
    let directory: URL
    private let fileURL: URL
    private(set) var items: [String: String]
    private let queue = DispatchQueue(label: "nbacs.store.write", qos: .utility)
    private var pendingWrite: DispatchWorkItem?

    init() {
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        directory = base.appendingPathComponent("NBA Career Sim", isDirectory: true)
        fileURL = directory.appendingPathComponent("store.json")
        try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        if let data = try? Data(contentsOf: fileURL),
           let decoded = try? JSONDecoder().decode([String: String].self, from: data) {
            items = decoded
        } else {
            items = [:]
        }
    }

    func set(_ key: String, _ value: String) {
        items[key] = value
        scheduleWrite()
    }

    func remove(_ key: String) {
        items.removeValue(forKey: key)
        scheduleWrite()
    }

    func removeAll() {
        items = [:]
        flush()
    }

    /// Writes right now (used when the app quits).
    func flush() {
        pendingWrite?.cancel()
        let snapshot = items
        let url = fileURL
        queue.sync { Self.write(snapshot, to: url) }
    }

    private func scheduleWrite() {
        pendingWrite?.cancel()
        let snapshot = items
        let url = fileURL
        let work = DispatchWorkItem { Self.write(snapshot, to: url) }
        pendingWrite = work
        queue.asyncAfter(deadline: .now() + 0.5, execute: work)
    }

    private static func write(_ snapshot: [String: String], to url: URL) {
        guard let data = try? JSONEncoder().encode(snapshot) else { return }
        try? data.write(to: url, options: .atomic)
    }
}
