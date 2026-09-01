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
