import SwiftUI

enum Theme {
    static let bg         = Color(hex: "#080612")
    static let surface    = Color(hex: "#100d1c")
    static let surface2   = Color(hex: "#181228")
    static let border     = Color(hex: "#251b3e")
    static let accent     = Color(hex: "#8b5cf6")
    static let accentLo   = Color(hex: "#5b21b6")
    static let accentGlow = Color(hex: "#a78bfa")
    static let record     = Color(hex: "#f43f5e")
    static let recordGlow = Color(hex: "#fb7185")
    static let text       = Color(hex: "#f0ebff")
    static let textMuted  = Color(hex: "#7c6b9e")
    static let textDim    = Color(hex: "#3d3057")
}

extension Color {
    init(hex: String) {
        let hex = hex.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
        var int: UInt64 = 0
        Scanner(string: hex).scanHexInt64(&int)
        let r = Double((int >> 16) & 0xFF) / 255
        let g = Double((int >> 8)  & 0xFF) / 255
        let b = Double(int         & 0xFF) / 255
        self.init(red: r, green: g, blue: b)
    }
}

extension View {
    func glowEffect(_ color: Color, radius: CGFloat = 18) -> some View {
        self.shadow(color: color.opacity(0.7), radius: radius)
    }
}

extension Double {
    func rounded(toPlaces places: Int) -> Double {
        let d = pow(10.0, Double(places))
        return (self * d).rounded() / d
    }
    func nonZeroOr(_ fallback: Double) -> Double { self > 0 ? self : fallback }
}

func fmt(_ ms: Double) -> String {
    let s = Int(ms / 1000)
    return "\(s / 60):\(String(format: "%02d", s % 60))"
}

extension Array {
    subscript(safe index: Int) -> Element? {
        indices.contains(index) ? self[index] : nil
    }
}
