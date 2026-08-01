import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Message, PpvMessage } from "@prisma/client";
import { platformFeeCents } from "@hushd/shared";
import type { RequestUser } from "../auth/current-user.decorator";
import { PrismaService } from "../prisma/prisma.service";
import type { SendMessageDto } from "./dto/send-message.dto";
import type { TipDto } from "./dto/tip.dto";

const DEFAULT_PLATFORM_FEE_BPS = 1500;

@Injectable()
export class MessagingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async sendMessage(user: RequestUser, dto: SendMessageDto) {
    const isCreatorSender = user.id === dto.creatorId;

    if (isCreatorSender) {
      if (!dto.fanUserId) {
        throw new BadRequestException("fan_user_id_required");
      }
    } else {
      if (dto.ppvPriceCents) {
        throw new BadRequestException("only_creators_can_send_ppv");
      }
      const subscription = await this.prisma.subscription.findFirst({
        where: {
          fanUserId: user.id,
          creatorId: dto.creatorId,
          status: "ACTIVE",
          OR: [{ currentPeriodEnd: null }, { currentPeriodEnd: { gt: new Date() } }],
        },
      });
      if (!subscription) {
        throw new ForbiddenException("active_subscription_required");
      }
    }

    const fanUserId = isCreatorSender ? dto.fanUserId! : user.id;
    const conversation = await this.prisma.conversation.upsert({
      where: {
        fanUserId_creatorId: {
          fanUserId,
          creatorId: dto.creatorId,
        },
      },
      create: {
        fanUserId,
        creatorId: dto.creatorId,
      },
      update: {},
    });

    const message = await this.prisma.message.create({
      data: {
        conversationId: conversation.id,
        senderUserId: user.id,
        body: dto.body,
      },
    });

    if (isCreatorSender && dto.ppvPriceCents) {
      await this.prisma.ppvMessage.create({
        data: {
          messageId: message.id,
          priceCents: dto.ppvPriceCents,
          currency: dto.currency ?? "EUR",
        },
      });
    }
    return message;
  }

  async unlockPpv(user: RequestUser, messageId: string) {
    const ppv = await this.prisma.ppvMessage.findUnique({ where: { messageId } });
    if (!ppv) throw new NotFoundException("ppv_message_not_found");

    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
      include: { conversation: true },
    });
    if (!message || message.conversation.fanUserId !== user.id) {
      throw new ForbiddenException("not_allowed");
    }
    if (ppv.unlockTxnId) {
      return { ok: true as const, alreadyUnlocked: true };
    }

    const feeBps = Number(this.config.get("PLATFORM_FEE_BPS") ?? DEFAULT_PLATFORM_FEE_BPS);
    const feeCents = platformFeeCents(ppv.priceCents, feeBps);
    const netCents = Math.max(ppv.priceCents - feeCents, 0);

    // Transaction + balanced ledger entries + unlock marker must commit
    // together — a partial write would either double-charge or lose revenue.
    const tx = await this.prisma.$transaction(async (db) => {
      const created = await db.transaction.create({
        data: {
          payerUserId: user.id,
          payeeCreatorId: message.conversation.creatorId,
          type: "PPV_PURCHASE",
          status: "SUCCEEDED",
          grossCents: ppv.priceCents,
          feeCents,
          netCents,
          currency: ppv.currency,
          processor: "internal",
          processorTxnId: `ppv_${messageId}_${Date.now()}`,
        },
      });
      await db.ledgerEntry.createMany({
        data: [
          { accountCode: "cash_processor_clearing", direction: "DEBIT" as const, amountCents: ppv.priceCents },
          { accountCode: "creator_payable", direction: "CREDIT" as const, amountCents: netCents },
          { accountCode: "platform_revenue", direction: "CREDIT" as const, amountCents: feeCents },
        ].map((entry) => ({ ...entry, transactionId: created.id, currency: ppv.currency })),
      });
      await db.ppvMessage.update({
        where: { messageId },
        data: { unlockTxnId: created.id },
      });
      return created;
    });
    return { ok: true as const, transactionId: tx.id };
  }

  async sendTip(user: RequestUser, dto: TipDto) {
    if (dto.creatorId === user.id) {
      throw new BadRequestException("cannot_tip_yourself");
    }
    const feeBps = Number(this.config.get("PLATFORM_FEE_BPS") ?? DEFAULT_PLATFORM_FEE_BPS);
    const feeCents = platformFeeCents(dto.amountCents, feeBps);
    const netCents = Math.max(dto.amountCents - feeCents, 0);
    const currency = dto.currency ?? "EUR";

    return this.prisma.$transaction(async (db) => {
      const transaction = await db.transaction.create({
        data: {
          payerUserId: user.id,
          payeeCreatorId: dto.creatorId,
          type: "TIP",
          status: "SUCCEEDED",
          grossCents: dto.amountCents,
          feeCents,
          netCents,
          currency,
          processor: "internal",
          processorTxnId: `tip_${user.id}_${Date.now()}`,
        },
      });
      await db.ledgerEntry.createMany({
        data: [
          { accountCode: "cash_processor_clearing", direction: "DEBIT" as const, amountCents: dto.amountCents },
          { accountCode: "creator_payable", direction: "CREDIT" as const, amountCents: netCents },
          { accountCode: "platform_revenue", direction: "CREDIT" as const, amountCents: feeCents },
        ].map((entry) => ({ ...entry, transactionId: transaction.id, currency })),
      });
      return db.tip.create({
        data: {
          fromUserId: user.id,
          toCreatorId: dto.creatorId,
          postId: dto.postId,
          messageId: dto.messageId,
          amountCents: dto.amountCents,
          currency,
          transactionId: transaction.id,
        },
      });
    });
  }

  async conversation(user: RequestUser, creatorId: string, fanUserId?: string) {
    const isCreatorViewer = user.id === creatorId;
    const effectiveFanId = isCreatorViewer ? fanUserId : user.id;
    if (isCreatorViewer && !effectiveFanId) {
      throw new BadRequestException("fan_user_id_required");
    }

    const convo = await this.prisma.conversation.findUnique({
      where: {
        fanUserId_creatorId: {
          fanUserId: effectiveFanId!,
          creatorId,
        },
      },
      include: {
        messages: {
          include: { ppv: true },
          orderBy: { createdAt: "asc" },
          take: 200,
        },
      },
    });
    if (!convo) return { messages: [] };

    return {
      id: convo.id,
      fanUserId: convo.fanUserId,
      creatorId: convo.creatorId,
      messages: convo.messages.map((msg) => this.toMessageDto(msg, isCreatorViewer)),
    };
  }

  /**
   * Locked PPV content is never sent to the fan — the body stays server-side
   * until unlock, so it cannot be scraped from the API response.
   */
  private toMessageDto(msg: Message & { ppv: PpvMessage | null }, viewerIsCreator: boolean) {
    const locked = Boolean(msg.ppv && !msg.ppv.unlockTxnId);
    if (locked && !viewerIsCreator) {
      return {
        id: msg.id,
        senderUserId: msg.senderUserId,
        createdAt: msg.createdAt,
        locked: true as const,
        body: null,
        ppv: { priceCents: msg.ppv!.priceCents, currency: msg.ppv!.currency, unlocked: false as const },
      };
    }
    return {
      id: msg.id,
      senderUserId: msg.senderUserId,
      createdAt: msg.createdAt,
      locked: false as const,
      body: msg.body,
      ppv: msg.ppv
        ? { priceCents: msg.ppv.priceCents, currency: msg.ppv.currency, unlocked: Boolean(msg.ppv.unlockTxnId) }
        : null,
    };
  }
}
