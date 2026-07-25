from fastapi import APIRouter

router = APIRouter(prefix="/users")


@router.get("/{user_id}")
def get_user(user_id):
    if not user_id:
        return None
    return {"id": user_id}
