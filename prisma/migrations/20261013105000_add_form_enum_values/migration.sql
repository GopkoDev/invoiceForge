-- ai-chat-v2 revision 2026-10-13 (ADR-0011; spec §1 F1, F5). A Question form row is kind FORM; a sent form is a
-- Freelancer message with origin FORM. Enum values only: the previous build never writes them.
-- Own file: a value added by ALTER TYPE ... ADD VALUE cannot be used in the same transaction (PostgreSQL 12+),
-- and 07/08 do not use it either; promotion keeps this file separate.
ALTER TYPE "ChoiceOfferKind" ADD VALUE IF NOT EXISTS 'FORM';
ALTER TYPE "MessageOrigin" ADD VALUE IF NOT EXISTS 'FORM';
