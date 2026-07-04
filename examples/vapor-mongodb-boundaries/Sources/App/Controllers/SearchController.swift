import Fluent
import FluentMongoDriver
import Vapor

struct SearchController: RouteCollection {
    func boot(routes: RoutesBuilder) throws {
        routes.get("search", use: search)
    }

    func search(_ req: Request) async throws -> [Card] {
        let term = try req.query.get(String.self, at: "q")
        let pageSize = min(50, max(1, try req.query.get(Int.self, at: "limit")))
        let regexPattern = ".*\(NSRegularExpression.escapedPattern(for: term)).*"

        var queryDocument = Document()
        queryDocument["name"]["$regex"] = regexPattern

        return try await Card.query(on: req.db(.mongo))
            .filter(.custom(queryDocument))
            .sort(\.$name, .ascending)
            .limit(pageSize)
            .all()
    }
}

struct Card: Content {
    let name: String
}
