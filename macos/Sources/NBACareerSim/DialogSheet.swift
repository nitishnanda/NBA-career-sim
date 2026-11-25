import SwiftUI

/// A game pop-up (press question, trade offer, injury call...) shown as a native sheet.
/// The game describes the pop-up as headings, text, buttons and cards of those; pressing a button
/// presses the matching button in the page.
struct DialogSheet: View {
    let nodes: [DialogNode]

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                NodeList(nodes: nodes)
            }
            .padding(24)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .frame(width: 540)
        .frame(minHeight: 240, idealHeight: 420, maxHeight: 640)
        .interactiveDismissDisabled()
    }
}

private struct NodeList: View {
    let nodes: [DialogNode]

    var body: some View {
        ForEach(Array(nodes.enumerated()), id: \.offset) { item in
            NodeRow(node: item.element)
        }
    }
}

private struct NodeRow: View {
    let node: DialogNode

    var body: some View {
        switch node.t {
        case "h":
            Text(node.text ?? "")
                .font((node.lv ?? 1) <= 1 ? Font.title2.weight(.semibold) : Font.headline)
                .frame(maxWidth: .infinity, alignment: .leading)
                .fixedSize(horizontal: false, vertical: true)
        case "p":
            Text(node.text ?? "")
                .font(node.dim == true ? Font.callout : Font.body)
                .foregroundStyle(node.dim == true ? Color.secondary : Color.primary)
                .frame(maxWidth: .infinity, alignment: .leading)
                .fixedSize(horizontal: false, vertical: true)
        case "b":
            DialogButton(node: node)
        case "g":
            VStack(alignment: .leading, spacing: 8) {
                NodeList(nodes: node.kids ?? [])
            }
            .padding(12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(
                RoundedRectangle(cornerRadius: 10, style: .continuous)
                    .fill(node.warn == true ? Color.red.opacity(0.14) : Color.primary.opacity(0.06))
            )
        default:
            EmptyView()
        }
    }
}

private struct DialogButton: View {
    let node: DialogNode
    @EnvironmentObject private var model: AppModel

    private var isPrimary: Bool { (node.cls ?? "").contains("primary") }
    private var isDanger: Bool { (node.cls ?? "").contains("danger") }

    private static let accent = Color(red: 0.039, green: 0.518, blue: 1.0)   // the same blue as the page's primary buttons

    var body: some View {
        let button = Button {
            if let id = node.id { model.pressDialogButton(id) }
        } label: {
            VStack(alignment: .leading, spacing: 2) {
                Text(node.text ?? "")
                    .foregroundStyle(isPrimary ? Color.white : Color.primary)
                if let sub = node.sub, !sub.isEmpty {
                    Text(sub)
                        .font(.caption)
                        .foregroundStyle(isPrimary ? Color.white.opacity(0.8) : Color.secondary)
                        .multilineTextAlignment(.leading)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .controlSize(.large)
        .disabled(node.off == true)

        if isPrimary {
            button.buttonStyle(.borderedProminent).tint(Self.accent)
        } else {
            button.buttonStyle(.bordered).tint(isDanger ? Color.red : nil)
        }
    }
}
