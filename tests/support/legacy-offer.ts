// ai-chat-v2 T55 transition helper: the press route still takes a legacy single-question offer (kind CUSTOMER /
// BANK_ACCOUNT / ...) until T57 teaches it forms. A typed turn now stores a Question form (kind FORM), so a press test
// turns the form's first question back into the legacy row it presses. A row that is already legacy is returned as is.
// Remove with T57.
import { Prisma, type ChoiceOffer, type PrismaClient } from '@prisma/client';

export async function toLegacyOffer(prisma: PrismaClient, row: ChoiceOffer): Promise<ChoiceOffer> {
  if (row.kind !== 'FORM') return row;
  const [first] = row.questions as Array<{ field: ChoiceOffer['kind']; lineIndex: number | null; options: unknown }>;
  return prisma.choiceOffer.update({
    where: { id: row.id },
    data: {
      kind: first.field,
      lineIndex: first.lineIndex,
      options: first.options as Prisma.InputJsonValue,
      questions: Prisma.DbNull,
      answers: Prisma.DbNull,
    },
  });
}
