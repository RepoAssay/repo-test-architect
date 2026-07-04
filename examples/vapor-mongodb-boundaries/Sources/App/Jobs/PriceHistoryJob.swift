import FluentMongoDriver
import Vapor

struct PriceHistoryJob {
    func run(app: Application, history: CardPriceHistory) async throws {
        if let existing = try await CardPriceHistory.query(on: app.db(.mongo)).first() {
            existing.lastSeenAt = Date()
            try await existing.update(on: app.db(.mongo))
        } else {
            try await history.create(on: app.db(.mongo))
        }
    }
}

final class CardPriceHistory {
    var lastSeenAt: Date?

    static func query(on database: Database) -> CardPriceHistoryQuery {
        CardPriceHistoryQuery()
    }

    func create(on database: Database) async throws {}
    func update(on database: Database) async throws {}
}

struct CardPriceHistoryQuery {
    func first() async throws -> CardPriceHistory? {
        nil
    }
}
