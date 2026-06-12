export interface UserDto {
  id: string;
  email: string;
  role: "admin" | "member";
}
