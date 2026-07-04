public struct StockResponseDTO: Codable, Equatable {
    public let sku: String
    public let available: Int
    public let reserved: Int
}
