"""Database models and session management."""

from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship

from homeward_gateway.config import settings


class Base(DeclarativeBase):
    pass


class ParentAccount(Base):
    __tablename__ = "parent_accounts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    setup_complete: Mapped[bool] = mapped_column(Boolean, default=False)
    cloud_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    ollama_model: Mapped[str | None] = mapped_column(String(100), nullable=True)
    classifier_model: Mapped[str | None] = mapped_column(String(100), nullable=True)
    recovery_code_hash: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    children: Mapped[list["ChildProfile"]] = relationship(back_populates="parent", cascade="all, delete-orphan")


class ChildProfile(Base):
    __tablename__ = "child_profiles"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    parent_id: Mapped[int] = mapped_column(ForeignKey("parent_accounts.id"), nullable=False)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    age: Mapped[int] = mapped_column(Integer, nullable=False)
    preset_id: Mapped[str] = mapped_column(String(50), nullable=False)
    strictness: Mapped[int] = mapped_column(Integer, default=3)
    pin: Mapped[str | None] = mapped_column(String(10), nullable=True)
    homework_mode: Mapped[bool] = mapped_column(Boolean, default=False)
    allow_resume: Mapped[bool] = mapped_column(Boolean, default=True)
    quiet_hours_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    quiet_hours_start: Mapped[str | None] = mapped_column(String(5), nullable=True)
    quiet_hours_end: Mapped[str | None] = mapped_column(String(5), nullable=True)
    quiet_hours_days: Mapped[str | None] = mapped_column(String(20), nullable=True)
    slug: Mapped[str] = mapped_column(String(100), nullable=False, default="child")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    parent: Mapped["ParentAccount"] = relationship(back_populates="children")
    chat_sessions: Mapped[list["ChatSession"]] = relationship(
        back_populates="child", cascade="all, delete-orphan"
    )


class ChatSession(Base):
    __tablename__ = "chat_sessions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    child_id: Mapped[int] = mapped_column(ForeignKey("child_profiles.id"), nullable=False)
    preview: Mapped[str | None] = mapped_column(String(200), nullable=True)
    summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    child: Mapped["ChildProfile"] = relationship(back_populates="chat_sessions")
    messages: Mapped[list["ConversationLog"]] = relationship(back_populates="session")


class ConversationLog(Base):
    __tablename__ = "conversation_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    child_id: Mapped[int] = mapped_column(ForeignKey("child_profiles.id"), nullable=False)
    session_id: Mapped[int | None] = mapped_column(ForeignKey("chat_sessions.id"), nullable=True)
    direction: Mapped[str] = mapped_column(String(10), nullable=False)  # input | output
    content: Mapped[str] = mapped_column(Text, nullable=False)
    blocked: Mapped[bool] = mapped_column(Boolean, default=False)
    block_reason: Mapped[str | None] = mapped_column(String(255), nullable=True)
    stage: Mapped[str | None] = mapped_column(String(50), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    session: Mapped["ChatSession | None"] = relationship(back_populates="messages")


class BlockedAttempt(Base):
    __tablename__ = "blocked_attempts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    child_id: Mapped[int] = mapped_column(ForeignKey("child_profiles.id"), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    reason: Mapped[str] = mapped_column(String(255), nullable=False)
    stage: Mapped[str] = mapped_column(String(50), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )


engine = create_async_engine(settings.resolved_db_url(), echo=False)
async_session_factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


async def init_db() -> None:
    settings.data_dir.mkdir(parents=True, exist_ok=True)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        await conn.run_sync(_migrate_parent_columns)
        await conn.run_sync(_migrate_child_columns)
        await conn.run_sync(_migrate_chat_session_columns)
        await conn.run_sync(_migrate_session_columns)


def _migrate_parent_columns(connection) -> None:
    """Add new columns to existing SQLite databases."""
    import sqlalchemy as sa

    inspector = sa.inspect(connection)
    if "parent_accounts" not in inspector.get_table_names():
        return
    columns = {col["name"] for col in inspector.get_columns("parent_accounts")}
    if "ollama_model" not in columns:
        connection.execute(sa.text("ALTER TABLE parent_accounts ADD COLUMN ollama_model VARCHAR(100)"))
    if "classifier_model" not in columns:
        connection.execute(sa.text("ALTER TABLE parent_accounts ADD COLUMN classifier_model VARCHAR(100)"))
    if "recovery_code_hash" not in columns:
        connection.execute(sa.text("ALTER TABLE parent_accounts ADD COLUMN recovery_code_hash VARCHAR(255)"))


def _migrate_child_columns(connection) -> None:
    import sqlalchemy as sa

    inspector = sa.inspect(connection)
    if "child_profiles" not in inspector.get_table_names():
        return
    columns = {col["name"] for col in inspector.get_columns("child_profiles")}
    additions = [
        ("homework_mode", "BOOLEAN DEFAULT 0"),
        ("allow_resume", "BOOLEAN DEFAULT 1"),
        ("quiet_hours_enabled", "BOOLEAN DEFAULT 0"),
        ("quiet_hours_start", "VARCHAR(5)"),
        ("quiet_hours_end", "VARCHAR(5)"),
        ("quiet_hours_days", "VARCHAR(20)"),
        ("slug", "VARCHAR(100)"),
    ]
    for name, col_type in additions:
        if name not in columns:
            connection.execute(sa.text(f"ALTER TABLE child_profiles ADD COLUMN {name} {col_type}"))

    _backfill_child_slugs(connection)


def _backfill_child_slugs(connection) -> None:
    import sqlalchemy as sa

    from homeward_gateway.util.slug import slugify_name, unique_slug

    inspector = sa.inspect(connection)
    if "child_profiles" not in inspector.get_table_names():
        return
    if "slug" not in {col["name"] for col in inspector.get_columns("child_profiles")}:
        return

    rows = connection.execute(
        sa.text("SELECT id, parent_id, name, slug FROM child_profiles ORDER BY id")
    ).fetchall()
    taken_by_parent: dict[int, set[str]] = {}
    for row in rows:
        parent_id = row.parent_id
        taken = taken_by_parent.setdefault(parent_id, set())
        base = slugify_name(row.name)
        slug = unique_slug(base, taken)
        taken.add(slug)
        if row.slug != slug:
            connection.execute(
                sa.text("UPDATE child_profiles SET slug = :slug WHERE id = :id"),
                {"slug": slug, "id": row.id},
            )


def _migrate_chat_session_columns(connection) -> None:
    import sqlalchemy as sa

    inspector = sa.inspect(connection)
    if "chat_sessions" not in inspector.get_table_names():
        return
    columns = {col["name"] for col in inspector.get_columns("chat_sessions")}
    if "summary" not in columns:
        connection.execute(sa.text("ALTER TABLE chat_sessions ADD COLUMN summary TEXT"))


def _migrate_session_columns(connection) -> None:
    import sqlalchemy as sa

    inspector = sa.inspect(connection)
    tables = inspector.get_table_names()
    if "chat_sessions" not in tables:
        ChatSession.__table__.create(connection)
    if "conversation_logs" in tables:
        columns = {col["name"] for col in inspector.get_columns("conversation_logs")}
        if "session_id" not in columns:
            connection.execute(
                sa.text("ALTER TABLE conversation_logs ADD COLUMN session_id INTEGER")
            )


async def get_session() -> AsyncSession:
    async with async_session_factory() as session:
        yield session
