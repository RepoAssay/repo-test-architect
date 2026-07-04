from pydantic import BaseModel


class OrderResponse(BaseModel):
    id: str
    status: str
