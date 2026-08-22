#if canImport(FoundationEssentials)
import FoundationEssentials
#else
import Foundation
#endif

/// Minimal, dependency-free JSON tree: parse, inspect, serialize.
/// Exists so migration and v1 ingestion can walk raw JSON on every platform
/// TowerCore compiles for (including WebAssembly, where JSONSerialization
/// is unavailable). Not a general-purpose library — just what the package needs.
public enum JSONValue: Sendable, Equatable {
    case object([String: JSONValue])
    case array([JSONValue])
    case string(String)
    case number(Double)
    case bool(Bool)
    case null

    // MARK: Accessors
    public var object: [String: JSONValue]? { if case .object(let o) = self { return o }; return nil }
    public var array: [JSONValue]? { if case .array(let a) = self { return a }; return nil }
    public var string: String? { if case .string(let s) = self { return s }; return nil }
    public var double: Double? { if case .number(let n) = self { return n }; return nil }
    public var int: Int? { double.map { Int($0) } }
    public var boolValue: Bool? { if case .bool(let b) = self { return b }; return nil }
    public subscript(_ key: String) -> JSONValue? { object?[key] }

    // MARK: Parsing
    public enum ParseError: Error, Equatable { case malformed(String) }

    public static func parse(_ data: Data) throws -> JSONValue {
        var parser = Parser(bytes: Array(data))
        let value = try parser.parseValue()
        parser.skipWhitespace()
        guard parser.atEnd else { throw ParseError.malformed("trailing content") }
        return value
    }

    private struct Parser {
        let bytes: [UInt8]
        var i = 0
        var atEnd: Bool { i >= bytes.count }
        mutating func skipWhitespace() {
            while i < bytes.count, bytes[i] == 0x20 || bytes[i] == 0x0A || bytes[i] == 0x0D || bytes[i] == 0x09 { i += 1 }
        }
        mutating func expect(_ b: UInt8) throws {
            guard i < bytes.count, bytes[i] == b else { throw ParseError.malformed("expected \(Character(UnicodeScalar(b)))") }
            i += 1
        }
        mutating func parseValue() throws -> JSONValue {
            skipWhitespace()
            guard i < bytes.count else { throw ParseError.malformed("unexpected end") }
            switch bytes[i] {
            case UInt8(ascii: "{"): return try parseObject()
            case UInt8(ascii: "["): return try parseArray()
            case UInt8(ascii: "\""): return .string(try parseString())
            case UInt8(ascii: "t"):
                try literal("true"); return .bool(true)
            case UInt8(ascii: "f"):
                try literal("false"); return .bool(false)
            case UInt8(ascii: "n"):
                try literal("null"); return .null
            default: return .number(try parseNumber())
            }
        }
        mutating func literal(_ s: String) throws {
            for c in s.utf8 {
                guard i < bytes.count, bytes[i] == c else { throw ParseError.malformed("bad literal") }
                i += 1
            }
        }
        mutating func parseObject() throws -> JSONValue {
            try expect(UInt8(ascii: "{")); skipWhitespace()
            var out: [String: JSONValue] = [:]
            if i < bytes.count, bytes[i] == UInt8(ascii: "}") { i += 1; return .object(out) }
            while true {
                skipWhitespace()
                let key = try parseString()
                skipWhitespace(); try expect(UInt8(ascii: ":"))
                out[key] = try parseValue()
                skipWhitespace()
                if i < bytes.count, bytes[i] == UInt8(ascii: ",") { i += 1; continue }
                try expect(UInt8(ascii: "}")); break
            }
            return .object(out)
        }
        mutating func parseArray() throws -> JSONValue {
            try expect(UInt8(ascii: "[")); skipWhitespace()
            var out: [JSONValue] = []
            if i < bytes.count, bytes[i] == UInt8(ascii: "]") { i += 1; return .array(out) }
            while true {
                out.append(try parseValue())
                skipWhitespace()
                if i < bytes.count, bytes[i] == UInt8(ascii: ",") { i += 1; continue }
                try expect(UInt8(ascii: "]")); break
            }
            return .array(out)
        }
        mutating func parseString() throws -> String {
            try expect(UInt8(ascii: "\""))
            var out: [UInt8] = []
            while i < bytes.count {
                let b = bytes[i]
                if b == UInt8(ascii: "\"") { i += 1; return String(decoding: out, as: UTF8.self) }
                if b == UInt8(ascii: "\\") {
                    i += 1
                    guard i < bytes.count else { break }
                    switch bytes[i] {
                    case UInt8(ascii: "\""): out.append(UInt8(ascii: "\""))
                    case UInt8(ascii: "\\"): out.append(UInt8(ascii: "\\"))
                    case UInt8(ascii: "/"): out.append(UInt8(ascii: "/"))
                    case UInt8(ascii: "n"): out.append(0x0A)
                    case UInt8(ascii: "t"): out.append(0x09)
                    case UInt8(ascii: "r"): out.append(0x0D)
                    case UInt8(ascii: "b"): out.append(0x08)
                    case UInt8(ascii: "f"): out.append(0x0C)
                    case UInt8(ascii: "u"):
                        guard i + 4 < bytes.count,
                              let scalarValue = UInt32(String(decoding: bytes[(i+1)...(i+4)], as: UTF8.self), radix: 16)
                        else { throw ParseError.malformed("bad \\u escape") }
                        i += 4
                        var value = scalarValue
                        // surrogate pair
                        if (0xD800...0xDBFF).contains(value), i + 6 < bytes.count,
                           bytes[i+1] == UInt8(ascii: "\\"), bytes[i+2] == UInt8(ascii: "u"),
                           let low = UInt32(String(decoding: bytes[(i+3)...(i+6)], as: UTF8.self), radix: 16),
                           (0xDC00...0xDFFF).contains(low) {
                            value = 0x10000 + ((value - 0xD800) << 10) + (low - 0xDC00)
                            i += 6
                        }
                        if let scalar = UnicodeScalar(value) { out.append(contentsOf: Array(String(scalar).utf8)) }
                    default: throw ParseError.malformed("bad escape")
                    }
                    i += 1
                } else { out.append(b); i += 1 }
            }
            throw ParseError.malformed("unterminated string")
        }
        mutating func parseNumber() throws -> Double {
            let start = i
            while i < bytes.count, "0123456789+-.eE".utf8.contains(bytes[i]) { i += 1 }
            guard let d = Double(String(decoding: bytes[start..<i], as: UTF8.self)) else {
                throw ParseError.malformed("bad number")
            }
            return d
        }
    }

    // MARK: Serialization
    public func serialized() -> Data {
        var out = ""
        write(into: &out)
        return Data(out.utf8)
    }
    private func write(into out: inout String) {
        switch self {
        case .null: out += "null"
        case .bool(let b): out += b ? "true" : "false"
        case .number(let n):
            out += n == n.rounded() && abs(n) < 1e15 ? String(Int64(n)) : String(n)
        case .string(let s): Self.writeEscaped(s, into: &out)
        case .array(let a):
            out += "["
            for (idx, v) in a.enumerated() { if idx > 0 { out += "," }; v.write(into: &out) }
            out += "]"
        case .object(let o):
            out += "{"
            for (idx, key) in o.keys.sorted().enumerated() {
                if idx > 0 { out += "," }
                Self.writeEscaped(key, into: &out); out += ":"
                o[key]!.write(into: &out)
            }
            out += "}"
        }
    }
    static func writeEscaped(_ s: String, into out: inout String) {
        out += "\""
        for c in s.unicodeScalars {
            switch c {
            case "\"": out += "\\\""
            case "\\": out += "\\\\"
            case "\n": out += "\\n"
            case "\t": out += "\\t"
            case "\r": out += "\\r"
            default:
                if c.value < 0x20 {
                    let hex = String(c.value, radix: 16)
                    out += "\\u" + String(repeating: "0", count: 4 - hex.count) + hex
                } else { out.unicodeScalars.append(c) }
            }
        }
        out += "\""
    }
}
