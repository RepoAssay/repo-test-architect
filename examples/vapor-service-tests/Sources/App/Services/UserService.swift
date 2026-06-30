struct UserService {
    func findUser(id: String) async throws -> UserResponseDTO {
        guard !id.isEmpty else {
            throw UserServiceError.missingId
        }

        return UserResponseDTO(id: id, name: "Example")
    }
}

enum UserServiceError: Error {
    case missingId
}
