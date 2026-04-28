from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import logging

from app.api.scan import router as scan_router
from app.core.config import settings
from app.db import init_db
from app.services.prowler import restore_scans_from_db

logging.basicConfig(
    level=logging.DEBUG if settings.debug else logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    await restore_scans_from_db()
    yield


app = FastAPI(
    title=settings.app_title,
    description="Prowler 클라우드 보안 점검을 한국어로 실행하고 결과를 확인하는 API",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS 설정 (React 개발 서버 허용)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(scan_router)


@app.get("/health", tags=["health"])
async def health_check():
    return {"status": "ok", "service": settings.app_title}
