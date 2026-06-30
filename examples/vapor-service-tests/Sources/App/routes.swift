import Vapor

func routes(_ app: Application) throws {
    try app.register(collection: UserRoutes(service: UserService()))
}
