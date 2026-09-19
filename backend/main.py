from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .db import close, pool
from .routes import router


@asynccontextmanager
async def lifespan(app: FastAPI):
    await pool()          # connect + apply schema
    yield
    await close()


app = FastAPI(title="PaperTrail", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["*"], allow_headers=["*"],
)
app.include_router(router, prefix="/api")


@app.get("/api/health")
async def health():
    p = await pool()
    async with p.acquire() as conn:
        n = await conn.fetchval("SELECT count(*) FROM chunks")
    return {"ok": True, "chunks": n}
