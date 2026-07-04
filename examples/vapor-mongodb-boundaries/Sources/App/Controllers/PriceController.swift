import BSON
import FluentMongoDriver
import MongoKitten
import Vapor

struct PriceController: RouteCollection {
    func boot(routes: RoutesBuilder) throws {
        routes.get("prices", use: index)
    }

    func index(_ req: Request) async throws -> [PriceChange] {
        let database = req.db(.mongo)
        guard let database = database as? MongoDatabaseRepresentable else {
            throw Abort(.internalServerError)
        }

        let collection = database.raw["price_changes"]
        let pipeline: [Document] = [
            [
                "$group": Document(dictionaryLiteral:
                    ("_id", "$card_id"),
                    ("latestPrices", Document(dictionaryLiteral: ("$push", "$price")))
                )
            ],
            [
                "$project": Document(dictionaryLiteral:
                    ("_id", 0),
                    ("top10", Document(dictionaryLiteral: ("$slice", ["$latestPrices", 10] as Document)))
                )
            ]
        ]

        return try await collection
            .aggregate([.init(documents: pipeline)])
            .decode(PriceChange.self)
            .allResults()
    }
}

struct PriceChange: Content {
    let cardId: String
    let top10: [Double]
}
