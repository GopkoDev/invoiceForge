-- ai-chat-v2 T104 (SEC-L-05): the per-minute chat limit lives in the shared limit store. Enum value only, in its own
-- file: a value added by ALTER TYPE ... ADD VALUE cannot be used in the same transaction (PostgreSQL 12+).
ALTER TYPE "LimitScope" ADD VALUE IF NOT EXISTS 'CHAT_MESSAGE';
