import asyncpg
from pgvector.asyncpg import register_vector
from pathlib import Path

from .config import DATABASE_URL

_pool: asyncpg.Pool | None = None


async def _init(conn):
    await register_vector(conn)


async def pool() -> asyncpg.Pool:
    global _pool
    if _pool is None:
        _pool = await asyncpg.create_pool(DATABASE_URL, init=_init, min_size=1, max_size=10)
        await apply_schema(_pool)
    return _pool


async def apply_schema(p: asyncpg.Pool):
    sql = (Path(__file__).parent / "schema.sql").read_text()
    async with p.acquire() as conn:
        await conn.execute(sql)


async def close():
    global _pool
    if _pool:
        await _pool.close()
        _pool = None
