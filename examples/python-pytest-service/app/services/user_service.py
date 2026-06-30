import httpx


class UserService:
    async def fetch_user(self, user_id):
        async with httpx.AsyncClient() as client:
            response = await client.get(f"https://example.invalid/users/{user_id}")

        if response.status_code == 404:
            return None

        response.raise_for_status()
        return response.json()
