from fastapi import APIRouter, HTTPException

from app.services.user_service import UserService

router = APIRouter(prefix="/users")


@router.get("/{user_id}")
async def get_user(user_id: str):
    user = await UserService().fetch_user(user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    return user
