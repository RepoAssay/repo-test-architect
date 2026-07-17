public final class SessionService {
    public init() {}

    public func canRestore(token: String?) -> Bool {
        guard let token else { return false }
        return !token.isEmpty
    }
}
