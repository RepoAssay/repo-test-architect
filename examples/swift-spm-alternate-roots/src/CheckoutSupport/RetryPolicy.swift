public struct RetryPolicy {
    public func shouldRetry(attempt: Int) -> Bool {
        if attempt < 0 { return false }
        return attempt < 3
    }
}
