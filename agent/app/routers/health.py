from fastapi import APIRouter

router = APIRouter()


@router.get("/")
async def root():
    return {"message": "Hello from Agent API"}


@router.get("/health")
async def health_check():
    return {"status": "healthy"}
