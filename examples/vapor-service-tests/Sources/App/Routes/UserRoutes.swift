import Vapor

struct UserRoutes: RouteCollection {
    let service: UserService

    func boot(routes: RoutesBuilder) throws {
        routes.get("users", ":id", use: getUser)
    }

    func getUser(req: Request) async throws -> UserResponseDTO {
        let id = try req.parameters.require("id")
        return try await service.findUser(id: id)
    }
}
